"""Whole-body animation for animals (replacement animation, like cut-out films do for what joints can't fake): the image
model draws one master side view, then redraws it for every frame of each cycle through its image edit with the master as
the reference — the same animal each time, only the legs change. No jointed legs, so no joint can slip.

  .venv/bin/python -I tools/anim_frames.py library/anims/<id>          draw what is missing (master, then frames)
  .venv/bin/python -I tools/anim_frames.py --cut library/anims/<id>    key off magenta, align, write frames/

anim.json:
  {"type": "horse" | "elephant" | "person" | "rider" (a rider drawn on his horse), "height": 2.35,             (metres, ground to the highest point of the master)
   "master": "Prompt for the side view, standing ...",
   "cycles": {"walk": ["near hind leg lifted ...", ...], "gallop": [...]}}
frames/ holds one canvas per drawing (master.png, walk1.png …) with the feet on one ground line, and frames.json:
  {"w", "h", "ground", "mPerPx", "frames": {name: {"back": [21 y's of the top outline], "x0", "x1"}}, "cycles": {...}}
The engine (shared/js/engine.js makeAnimMount) plays the cycles and sits saddles and riders on the back line.
"""
import json
import re
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import imagegen  # noqa: E402

# Drawings go through tools/imagegen.py (IMAGE_BACKEND=codex or api).
# Several processes can run at once: each drawing is claimed with an exclusive <name>.claim file.
WORKERS = int(os.environ.get("ANIM_WORKERS", "3"))


def claim(path):
    """True if this process may draw `path` (nobody drew or is drawing it)."""
    if path.exists():
        return False
    try:
        os.close(os.open(str(path) + ".claim", os.O_CREAT | os.O_EXCL))
        return True
    except FileExistsError:
        return False


def release(path):
    try:
        os.remove(str(path) + ".claim")
    except FileNotFoundError:
        pass
ROOT = Path(__file__).resolve().parent.parent
STYLE = (ROOT / "library/style.prompt.txt").read_text().split("\n")[0]
MASTER = ("{desc} In strict SIDE PROFILE facing RIGHT, the whole animal from nose (or trunk) to tail, standing still with "
          "all four legs straight and vertical, feet flat on one level ground line. Natural, anatomically correct proportions. "
          "Nothing on its back: no saddle, no harness, no blanket, no rider. The animal fills about 80% of the frame width, "
          "centred, feet at 90% of the frame height. Isolated on a perfectly flat pure magenta (#FF00FF) background, no "
          "ground, no shadow.\n\n" + STYLE)
PERSON = ("{desc} Full body, in strict SIDE PROFILE facing RIGHT, standing upright and relaxed, arms hanging, both feet "
          "flat on one level ground line. Natural adult proportions (about 7.5 heads tall). The figure fills about 80% of "
          "the frame height, centred, feet at 92% of the frame height. Isolated on a perfectly flat pure magenta (#FF00FF) "
          "background, no ground, no shadow.\n\n" + STYLE)
KEEP_PERSON = ("Draw exactly ONE person (never several copies or a character sheet). Redraw EXACTLY this same person: same art style, same face, hair, costume, colours, armour and proportions, the "
               "same size as in the reference, still in strict side profile facing right, on the same ground line. Change only "
               "the pose to: {pose}. Same perfectly flat pure magenta (#FF00FF) background, no ground, no shadow.")
RIDER = ("{desc} In strict SIDE PROFILE facing RIGHT, the whole horse and rider, the horse standing still with all four legs "
         "straight and vertical, hooves on one level ground line; the rider sitting upright in the saddle, feet in the stirrups, "
         "reins in the left hand. Natural proportions. The group fills about 80% of the frame width, centred, hooves at 92% "
         "of the frame height. Isolated on a perfectly flat pure magenta (#FF00FF) background, no ground, no shadow.\n\n" + STYLE)
KEEP_RIDER = ("Redraw EXACTLY this same rider on this same horse: same art style, same faces, costume, colours, saddle and "
              "harness, same size and the same place in the frame, strict side profile facing right, on the same ground line. "
              "Change the horse's legs (and the rider only as needed to move with the horse) to: {pose}. Same perfectly flat "
              "pure magenta (#FF00FF) background, no ground, no shadow.")
KEEP = ("Redraw EXACTLY this same animal: same art style, same colours and markings, same size, same position in the frame; "
        "the body, head, mane, ears, trunk, tusks and tail the same shape and in the same place as in the reference (the body "
        "may rise or dip a little with the step). Change the legs to this pose: {pose}. Feet on the ground stay on the same "
        "ground line as in the reference. Strict side profile facing right. Same perfectly flat pure magenta (#FF00FF) "
        "background, no ground, no shadow.")


def generate(prompt, size="1536x1024"):
    # size: "1536x1024" (landscape, films) or "1024x1536" (portrait, Shorts)
    return imagegen.generate(prompt, size)


def edit(ref, prompt):
    return imagegen.edit(ref, prompt, "1536x1024")


def frame_names(spec):
    return [f"{c}{i}" for c, poses in spec["cycles"].items() for i in range(1, len(poses) + 1)]


def draw(dirs):
    jobs = []
    for d in dirs:
        spec = json.loads((d / "anim.json").read_text())
        first, keep = {"person": (PERSON, KEEP_PERSON), "rider": (RIDER, KEEP_RIDER)}.get(spec["type"], (MASTER, KEEP))
        if not (d / "master.png").exists():
            jobs.append((d, "master", first.format(desc=spec["master"])))
        need = spec.get("need")  # only these drawings ("walk" = the whole walk cycle, "act3" …); all when absent
        for c, poses in spec["cycles"].items():
            for i, pose in enumerate(poses, 1):
                if need is not None and c not in need and f"{c}{i}" not in need:
                    continue
                if not (d / f"{c}{i}.png").exists():
                    jobs.append((d, f"{c}{i}", keep.format(pose=pose)))

    def one(job):
        d, name, prompt = job
        out = d / f"{name}.png"
        if name != "master" and not (d / "master.png").exists():
            return f"{d.name}/{name} skipped (no master yet)"
        if not claim(out):
            return f"{d.name}/{name} taken"
        try:
            data = generate(prompt) if name == "master" else edit((d / "master.png").read_bytes(), prompt)
            out.write_bytes(data)
            return f"{d.name}/{name} ok"
        except Exception as e:  # noqa: BLE001 — report and carry on
            return f"{d.name}/{name} FAIL {e}"
        finally:
            release(out)

    # masters first (every frame is redrawn from its master)
    for group in ([j for j in jobs if j[1] == "master"], [j for j in jobs if j[1] != "master"]):
        with ThreadPoolExecutor(WORKERS) as ex:
            for r in ex.map(one, group):
                print(r, flush=True)


def cut(d):
    import numpy as np
    from PIL import Image

    sys.path.insert(0, str(ROOT / "tools"))
    from asset import key_magenta

    spec = json.loads((d / "anim.json").read_text())
    names = ["master"] + [n for n in frame_names(spec) if (d / f"{n}.png").exists()]
    keyed, meas = {}, {}
    for n in names:
        if not (d / f"{n}.png").exists():
            sys.exit(f"{d.name}: {n}.png missing — draw it first")
        rgb = np.asarray(Image.open(d / f"{n}.png").convert("RGB"))
        rgba = key_magenta(rgb)
        m = rgba[..., 3] > 128
        if m.mean() > 0.9:
            # the model ignored the magenta ground: key off the flat colour in the corners instead
            bgc = np.median(np.concatenate([rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3)]), axis=0)
            dist = np.abs(rgb.astype(int) - bgc).sum(axis=2)
            alpha = np.clip((dist - 30) * 8, 0, 255).astype(np.uint8)
            rgba = np.dstack([rgb, alpha])
            m = alpha > 128
        ys, xs = np.nonzero(m)
        top, ground = ys.min(), ys.max()
        # the barrel (a band through the trunk, 35–55 % down): its length sets the scale — not the upper half, which
        # grows when a galloping horse stretches its head and neck out
        # (elephants: the upper half — their big ears cross that band and the head hardly moves)
        if spec["type"] == "rider":
            # a rider on his horse: in a gallop the horse stretches and the rider leans, so no width is stable; the
            # horse's barrel depth is — the vertical run through the saddle-cloth column, across the middle of the group
            cols = np.nonzero(m.any(axis=0))[0]
            depths = []
            for fx in (0.42, 0.46, 0.5, 0.54, 0.58):
                x = int(cols.min() + (cols.max() - cols.min()) * fx)
                ys_ = np.nonzero(m[:, x])[0]
                if len(ys_):
                    yb = ys_[ys_ < top + (ground - top) * 0.8].max() if (ys_ < top + (ground - top) * 0.8).any() else ys_.max()
                    run = yb
                    while run > 0 and m[run - 1, x]:
                        run -= 1
                    depths.append(yb - max(run, top + int((ground - top) * 0.35)))
            d_ = float(np.median(depths))
            cx = (cols.min() + cols.max()) / 2
            bx = np.array([cx - d_, cx + d_])
        elif spec["type"] == "elephant":
            bx = np.nonzero(m[top : top + (ground - top) // 2].any(axis=0))[0]
        else:
            lo, hi = (0.55, 0.72) if spec["type"] == "rider" else (0.35, 0.55)  # a rider's horse: its barrel is lower down
            band = m[top + int((ground - top) * lo) : top + int((ground - top) * hi)]
            widths = [(r.min(), r.max()) for r in (np.nonzero(row)[0] for row in band) if len(r)]
            bx = np.array([np.median([a for a, _ in widths]), np.median([b for _, b in widths])])
        keyed[n] = rgba
        meas[n] = (float(bx.min()), float(bx.max()), float(ground), float(top))
    # the size every frame is brought to: the median of all drawings (one odd drawing — often the master, drawn
    # without a reference — must not set the scale for the rest)
    ref_w = float(np.median([meas[n][1] - meas[n][0] for n in names]))
    person_scale = {}
    if spec["type"] == "person":
        upright = [n for n in names if n == "master" or n.startswith("walk")]
        hs = {n: meas[n][2] - meas[n][3] for n in upright}
        ref_h = float(np.median(list(hs.values())))
        person_scale = {n: ref_h / hs[n] for n in upright}
        mid = float(np.median(list(person_scale.values())))
        person_scale.update({n: mid for n in names if n not in person_scale})
    W, H, G = 1600, 1100, 1060
    out = d / "frames"
    out.mkdir(exist_ok=True)
    frames = {}
    for n in names:
        x0, x1, g, _ = meas[n]
        # people: the standing and walking drawings are brought to one height; poses that change the outline
        # (sitting, kneeling, lying) take the median scale of those, since they were drawn at the same size
        s = person_scale.get(n, 1.0) if spec["type"] == "person" else ref_w / (x1 - x0)
        if spec["type"] == "person":
            x0 = x1 = (meas["master"][0] + meas["master"][1]) / 2 if n.startswith("act") else (x0 + x1) / 2
            x0 -= 1
            x1 += 1
        im = Image.fromarray(keyed[n], "RGBA")
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(im, (round(W / 2 - (x0 + x1) / 2 * s), round(G - g * s)), im)
        canvas.save(out / f"{n}.png")
        a = np.asarray(canvas)[..., 3] > 128
        cols = np.nonzero(a.any(axis=0))[0]
        cx0, cx1 = int(cols.min()), int(cols.max())
        back = []
        for i in range(21):  # the top outline along the animal (tail end → head end): where saddles and riders sit
            x = int(cx0 + (cx1 - cx0) * i / 20)
            ys = np.nonzero(a[:, max(0, x - 3) : x + 4].any(axis=1))[0]
            back.append(int(ys.min()) if len(ys) else G)
        frames[n] = {"back": back, "x0": cx0, "x1": cx1}
    m = np.asarray(Image.open(out / "master.png"))[..., 3] > 128
    top = int(np.nonzero(m.any(axis=1))[0].min())
    meta = {"type": spec["type"], "w": W, "h": H, "ground": G, "mPerPx": spec["height"] / (G - top), "frames": frames,
            "cycles": {c: names_c for c in spec["cycles"] if (names_c := [n for n in names if re.fullmatch(c + r"\d+", n)]) and c != "act"}}
    (out / "frames.json").write_text(json.dumps(meta, indent=1))
    print(d.name, "cut", len(names), "drawings")


if __name__ == "__main__":
    dirs = [Path(a).resolve() for a in sys.argv[1:] if not a.startswith("--")]
    if "--cut" in sys.argv:
        for d in dirs:
            cut(d)
    else:
        draw(dirs)
