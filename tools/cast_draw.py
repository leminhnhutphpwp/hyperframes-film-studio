"""Turn a project's puppets (cast.json from tools/cast_list.py) into drawn people (library/anims/cast/<slug>): the
puppet is rendered standing on the rig sheet and handed to the image model as the reference, so the drawn person keeps its
costume, colours and face; then the usual frames (tools/anim_frames.py) are drawn from that master.

  .venv/bin/python -I tools/cast_draw.py projects/my-channel/my-film/part-1          refs + masters + frames for every puppet
  (then)  .venv/bin/python -I tools/anim_frames.py --cut library/anims/cast/*
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import anim_frames as A  # noqa: E402

POSES = {
    "walk": [
        "walking: right leg stepping forward with the heel touching down, left leg behind on its toes, left arm swinging forward, right arm back",
        "walking: right foot flat and taking the weight under the body, left leg passing forward with the knee bent and the foot off the ground",
        "walking: right leg straight under the body, left leg swinging forward high, about to step",
        "walking: left leg stepping forward with the heel touching down, right leg behind on its toes, right arm swinging forward, left arm back",
        "walking: left foot flat and taking the weight, right leg passing forward with the knee bent and the foot off the ground",
        "walking: left leg straight under the body, right leg swinging forward high, about to step"],
    "act": [
        "pointing firmly forward with the right arm straight out at shoulder height",
        "raising the right arm high above the head, hand open, speaking to a crowd",
        "sitting on a simple low wooden stool (draw the stool), feet flat on the ground, hands on the knees",
        "kneeling on the left knee, right foot flat in front, head bowed, right hand on the right knee",
        "lying fallen on the back on the ground, one arm out, eyes closed (no blood, no wound)"],
}
ACTS = ["point", "raise", "sit", "kneel", "fall"]
LEADS = 1  # people per costume who get moving drawings; the rest borrow them (supporting cast: one is enough)
FROM_PUPPET = ("Draw exactly ONE person — not a character sheet, not several views or copies side by side. "
               "This picture is a jointed paper puppet made of separate cut-out pieces. Redraw it as ONE natural, full-body "
               "illustration of the same character: the same face, age, hair, headwear, costume, colours, armour and accessories "
               "(and the same weapon or shield if it holds one), but with natural human anatomy — a real neck, shoulders, elbows, "
               "hips and knees, no visible joints or seams. Strict SIDE PROFILE facing RIGHT, standing upright and relaxed, arms "
               "hanging, both feet flat on one level ground line. The figure fills about 80% of the frame height, centred, feet at "
               "92% of the frame height. Perfectly flat pure magenta (#FF00FF) background, no ground, no shadow.\n\n" + A.STYLE)


def slug(key):
    return re.sub(r"[^a-z0-9]+", "-", key.replace("@", "-").replace("|", "-").lower()).strip("-")


def refs(cast):
    todo = [(k, v) for k, v in cast.items() if not (ROOT / "library/anims/cast" / slug(k) / "ref.png").exists()]
    for k, v in todo:
        d = ROOT / "library/anims/cast" / slug(k)
        d.mkdir(parents=True, exist_ok=True)
        fig = ":".join(x for x in (v["kit"].split("@")[0], (v["heads"] or "").split("@")[0], v["head"] or "") if x)
        tmp = d / "_sheet.png"
        subprocess.run([str(ROOT / ".venv/bin/python"), "-I", str(ROOT / "tools/rigtest.py"), str(tmp), fig, "--poses", "đứng",
                        "--colour", v["kit"].split("@")[1] if "@" in v["kit"] else "base",
                        "--headcolour", (v["heads"] or "@base").split("@")[1] if v["heads"] else "base"], check=True, capture_output=True)
        im = Image.open(tmp).convert("RGB")
        # one figure, one pose: it sits in the middle cell — crop around the drawn pixels
        g = im.convert("L").point(lambda x: 255 if x < 200 else 0)
        box = g.getbbox()
        x0, y0, x1, y1 = box
        cx = (x0 + x1) // 2
        h = y1 - y0
        im.crop((max(0, cx - h // 2), max(0, y0 - 20), cx + h // 2, y1 + 20)).save(d / "ref.png")
        tmp.unlink()
        spec = {"type": "person", "height": 1.8, "master": f"puppet {k}", "cycles": {"walk": POSES["walk"], "act": POSES["act"]}}
        (d / "anim.json").write_text(json.dumps(spec, indent=1))
    # Reuse within a costume (user, 2026-10-17): crowds and soldiers of one costume share their moving drawings.
    # Per costume (kit@colour) only LEADS=2 people get walk/act drawings — those already drawn first, then the ones
    # in most chapters; everyone else gets just a standing master (their own face) and borrows the leads' frames
    # (chapter_build.py). Named characters have a costume of their own, so they are always leads.
    by_kit = {}
    for k, v in cast.items():
        by_kit.setdefault(k.split("|")[0], []).append(k)
    leads = set()
    for kit, ks in by_kit.items():
        def score(k):
            d = ROOT / "library/anims/cast" / slug(k)
            return (-len(list(d.glob("walk*.png"))) - len(list(d.glob("act*.png"))), -len(cast[k].get("chapters", [])))
        leads |= set(sorted(ks, key=score)[:LEADS])
    for k, v in cast.items():
        if k not in leads:
            d = ROOT / "library/anims/cast" / slug(k)
            spec = json.loads((d / "anim.json").read_text())
            drawn = {f.stem for f in d.glob("act*.png")} | ({"walk"} if (d / "walk1.png").exists() else set())
            spec["need"] = sorted(drawn)
            (d / "anim.json").write_text(json.dumps(spec, indent=1))
            continue
        d = ROOT / "library/anims/cast" / slug(k)
        spec = json.loads((d / "anim.json").read_text())
        if "poses" not in v:
            continue
        need = set(spec.get("need", [])) | {p for p in v["poses"] if p != "master"}
        drawn = {f.stem for f in d.glob("act*.png")} | ({"walk"} if (d / "walk1.png").exists() else set())
        spec["need"] = sorted(need | drawn)
        (d / "anim.json").write_text(json.dumps(spec, indent=1))
        print("ref", slug(k), flush=True)


def masters(cast):
    jobs = [ROOT / "library/anims/cast" / slug(k) for k in cast if not (ROOT / "library/anims/cast" / slug(k) / "master.png").exists()]

    def one(d):
        out = d / "master.png"
        if not A.claim(out):
            return f"master {d.name} taken"
        try:
            out.write_bytes(A.edit((d / "ref.png").read_bytes(), FROM_PUPPET))
            return f"master {d.name} ok ({A.BACKEND})"
        except Exception as e:  # noqa: BLE001
            return f"master {d.name} FAIL ({A.BACKEND}) {e}"
        finally:
            A.release(out)

    with ThreadPoolExecutor(A.WORKERS) as ex:
        for r in ex.map(one, jobs):
            print(r, flush=True)


if __name__ == "__main__":
    proj = Path(sys.argv[1]).resolve()
    cast = json.loads((proj / "cast.json").read_text())
    refs(cast)
    masters(cast)
    A.draw([ROOT / "library/anims/cast" / slug(k) for k in cast])
    m = {k: f"cast/{slug(k)}" for k in cast}
    (proj / "cast.en.json").write_text(json.dumps(m, indent=1))
    print("done")
