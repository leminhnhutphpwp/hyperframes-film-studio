"""Build one chapter of a film as its own HyperFrames project.

  .venv/bin/python -I <film>/shared/chapter_build.py <film>/ch01 --lang=en     (examples/ides-of-march/build.sh runs this)

The chapter directory holds chapter.json + js/scenes.js. This script
- cuts the chapter's window out of the full narration (audio/<lang>-story/narration.m4a, timing.json): chapters meet
  halfway through the pause between them, so the cut chapters play back to back as the whole film;
- copies shared/ (engine, map, overlay, fonts) into <chapter>/shared, stages library assets (recoloured) into
  <chapter>/assets/lib, converts the sound effects it names into <chapter>/assets/audio;
- writes js/data.js (window.LINES in chapter seconds with the Vietnamese text for word cues, window.MAP_PROJ) and
  index.html from shared/template.html.

chapter.json:
  {"chapter": 1,                                  # 1-based, as in narration.vi.txt "# ──" headers
   "title": ["The Ides of March", "Julius Caesar"],             # title card text (optional), in the narration's language
                                                   # (a Vietnamese-first film looks it up in strings.<lang>.json)
   "assets": ["kits/roman-citizen@wool", "kits/roman-senator@purple!head", "cutouts/pompey-statue", "anims/<id>", ...],  # kind/id[@colour][!parts kept undyed]; anims/<id> → LIB["<id>@anim"] (makeAnimMount)
   "backdrops": ["roman-forum", "terrains/x"],    # library/backdrops/<id>/image.jpg (or another kind) → assets/lib/backdrops/<id>.jpg
   "tableaux": ["ides-toga"],                      # <project>/tableaux/<id>/ (tools/tableau.py) → assets/tableaux/<id>/
   "sfx": [{"id": "amb-hills", "src": "<library/sfx id>", "at": [1, 0], "until": [3, "end"],
            "vol": 0.3, "fi": 1.0, "fo": 1.0, "track": 3}],                # at/until: [line, seconds | "word" | "end"]
   "clips": [{"id": "clip-x", "src": "assets/clips/x.webm", "at": [5, 0], "until": [7, 0]}],
   "dips": []}
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent  # shared/
PROJECT = HERE.parent  # projects/<film> (or projects/<series>/<part>)
ROOT = next(p for p in PROJECT.parents if (p / "tools" / "asset.py").exists())  # repo root, however deep the project sits
sys.path.insert(0, str(ROOT / "tools"))
from asset import LIB  # noqa: E402
from battle import variant, weapon_class  # noqa: E402

SFX_LIB = ROOT / "library" / "sfx"  # your sound library: library/sfx/<any folders>/<id>.<flac|wav|mp3|m4a|ogg> (audio is git-ignored)
FF = imageio_ffmpeg.get_ffmpeg_exe()


def main(chdir, lang="vi"):
    story = PROJECT / f"audio/{lang}-story"
    LANG = lang
    trf = PROJECT / f"strings.{lang}.json"  # on-screen text: Vietnamese → this language (cues still follow the Vietnamese lines' proportions)
    TR = json.loads(trf.read_text()) if lang != "vi" and trf.exists() else {}  # narration in this language: timing.json + narration.m4a
    chdir = Path(chdir).resolve()
    cfg = json.loads((chdir / "chapter.json").read_text())
    timing = json.loads((story / "timing.json").read_text())
    # the source narration: narration.vi.txt for a Vietnamese-first film (other languages are timed against it and
    # translated through strings.<lang>.json); a film written straight in one language has only narration.<lang>.txt
    src = PROJECT / "narration.vi.txt"
    if not src.exists():
        src = PROJECT / f"narration.{lang}.txt"
    text = {int(m.group(1)): m.group(2).strip() for m in (re.match(r"(\d+)\s+(.*)", l) for l in src.read_text(encoding="utf-8").splitlines() if not l.startswith("#")) if m}
    L = {int(n): v for n, v in timing["lines"].items()}
    chs = timing["chapters"]
    k = cfg["chapter"] - 1
    first = chs[k]["line"]
    last = chs[k + 1]["line"] - 1 if k + 1 < len(chs) else max(L)
    lend = lambda n: L[n]["t"] + L[n]["d"]
    def split(i):
        # the cut between chapter i (1-based) and the next: half-way through the pause, or — when chapter i's
        # chapter.json has "hold": seconds — that long after its last line (room for a clip such as the channel sting)
        nxt = chs[i]["line"]
        cj = chdir.parent / f"ch{i:02d}" / "chapter.json"
        hold = json.loads(cj.read_text()).get("hold") if cj.exists() else None
        if hold:
            return round(min(lend(nxt - 1) + hold, L[nxt]["t"] - 0.3), 3)
        return round((lend(nxt - 1) + L[nxt]["t"]) / 2, 3)

    start = 0.0 if k == 0 else split(k)
    stop = split(k + 1) if last + 1 in L else round(timing["total"] + 1.5, 3)
    stop = round(stop + cfg.get("tail", 0), 3)  # extra seconds after the last line (closing title card)
    dur = round(stop - start, 3)
    lines = {n: {"t": round(L[n]["t"] - start, 3), "d": L[n]["d"], "vi": text[n]} for n in range(first, last + 1)}
    print(f"chapter {cfg['chapter']}: lines {first}–{last}, film {start:.2f}–{stop:.2f} s ({dur:.2f} s)")

    # shared code, fonts, map
    dst = chdir / "shared"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(HERE, dst, ignore=shutil.ignore_patterns("hyperframes.json", "subtitles.py", "chapter_build.py", "template.html", "land-50m.json", "spec.json", "__pycache__"))

    # library assets
    out = chdir / "assets" / "lib"
    if out.exists():
        shutil.rmtree(out)
    lib = {}
    for ref in cfg.get("assets", []):
        if ref.startswith("anims/"):
            # a drawn animal (tools/anim_frames.py): its frames, plus the saddle/howdah of the jointed mount of that id
            aid = ref.split("/", 1)[1]
            src = LIB / "anims" / aid / "frames"
            d = out / "anims" / aid
            shutil.copytree(src, d)
            e = {"dir": f"assets/lib/anims/{aid}", "frames": json.loads((d / "frames.json").read_text())}
            sp = LIB / "mounts" / aid / "parts"
            if (sp / "saddle.png").exists():
                (d / "saddle").mkdir(exist_ok=True)
                shutil.copy(sp / "saddle.png", d / "saddle" / "saddle.png")
                e["saddle"] = {"dir": f"assets/lib/anims/{aid}/saddle", "part": json.loads((sp / "parts.json").read_text())["saddle"]}
            lib[f"{aid}@anim"] = e
            continue
        ref, _, keep = ref.partition("!")  # "kits/caesar@purple!head": recolour, but keep these parts undyed (a green laurel)
        kind_id, _, colour = ref.partition("@")
        kind, aid = kind_id.split("/")
        src = LIB / kind / aid
        meta = json.loads((src / "meta.json").read_text())
        col = colour or None
        d = out / kind / aid / (col or "base")
        shutil.copytree(variant(src, col), d)
        for part in filter(None, keep.split(",")):
            shutil.copy(src / "parts" / f"{part}.png", d / f"{part}.png")
        e = {"dir": f"assets/lib/{kind}/{aid}/{col or 'base'}", "parts": json.loads((d / "parts.json").read_text())}
        if kind == "kits":
            e.update(weapon=weapon_class(meta), role=meta.get("role"))
        if kind == "mounts":
            e["type"] = "elephant" if "elephant" in meta["desc"].lower() else "horse"
        key = f"{aid}@{col or 'base'}"
        if key in lib:  # a kit and a heads set with the same id would overwrite each other in window.LIB
            sys.exit(f"two assets share the id {key} ({ref}); rename one of them in the library")
        lib[key] = e
    (out / "backdrops").mkdir(parents=True, exist_ok=True)
    for b in cfg.get("backdrops", []):
        kind, _, bid = b.rpartition("/")  # "id" (library/backdrops) or "terrains/id"
        shutil.copy(LIB / (kind or "backdrops") / bid / "image.jpg", out / "backdrops" / f"{bid}.jpg")
        blur = out / "backdrops" / f"{bid}.blur.jpg"  # for fx.focus (soft background in close shots)
        if not blur.exists():
            Image.open(out / "backdrops" / f"{bid}.jpg").convert("RGB").filter(ImageFilter.GaussianBlur(9)).save(blur, quality=90)
    # drawn stand-ins for puppets (tools/cast_draw.py): <project>/cast.<lang>.json maps a puppet to library/anims/<id>
    cast_map = {}
    cf = PROJECT / f"cast.{lang}.json"
    if lang != "vi" and cf.exists():
        seen = json.loads((PROJECT / "cast.json").read_text()) if (PROJECT / "cast.json").exists() else {}
        for key, aid in json.loads(cf.read_text()).items():
            if key in seen and chdir.name not in seen[key]["chapters"]:
                continue  # not in this chapter (tools/cast_list.py)
            fr = LIB / "anims" / aid / "frames"
            if not (fr / "frames.json").exists():
                continue
            name = aid.replace("/", "-")
            d = out / "anims" / name
            if not d.exists():
                shutil.copytree(fr, d)
            fj = json.loads((d / "frames.json").read_text())
            # borrow missing moving drawings from people of the same costume (tools/cast_draw.py LEADS)
            kit = key.split("|")[0]
            for k2, aid2 in json.loads(cf.read_text()).items():
                if k2.split("|")[0] != kit or k2 == key:
                    continue
                f2 = LIB / "anims" / aid2 / "frames" / "frames.json"
                if not f2.exists():
                    continue
                j2 = json.loads(f2.read_text())
                for cyc, names in j2.get("cycles", {}).items():
                    if cyc not in fj["cycles"]:
                        for n in names:
                            shutil.copy(f2.parent / f"{n}.png", d / f"{n}.png")
                            fj["frames"][n] = j2["frames"][n]
                        fj["cycles"][cyc] = names
                for n in j2["frames"]:
                    if n.startswith("act") and n not in fj["frames"]:
                        shutil.copy(f2.parent / f"{n}.png", d / f"{n}.png")
                        fj["frames"][n] = j2["frames"][n]
            lib[f"{name}@anim"] = {"dir": f"assets/lib/anims/{name}", "frames": fj}
            cast_map[key] = f"{name}@anim"
    (out / "library.js").write_text("window.LIB = " + json.dumps(lib, separators=(",", ":")) + ";\n")

    # narration window and sound effects
    aud = chdir / "assets" / "audio"
    aud.mkdir(parents=True, exist_ok=True)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(story / "narration.m4a" if (story / "narration.m4a").exists() else story / "loi-ke-toan-bo.m4a"), "-c:a", "aac", "-b:a", "160k", str(aud / "narration.m4a")], check=True)

    def when(ref):
        n, x = ref
        ln = lines[n]
        if isinstance(x, str) and x.startswith("end"):  # "end", "end+0.3": seconds after the line ends
            return ln["t"] + ln["d"] + float(x[3:] or 0)
        if isinstance(x, str):
            i = ln["vi"].index(x)
            return ln["t"] + ln["d"] * i / len(ln["vi"])
        return ln["t"] + x

    def audio(id, src, s, d, pts, track):
        auto = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": [{"t": round(a, 3), "v": v} for a, v in pts]}]})
        return f'      <audio id="{id}" src="{src}" data-start="{s:.3f}" data-duration="{d:.3f}" data-track-index="{track}" data-automation=\'{auto}\'></audio>'

    probe = subprocess.run([FF, "-hide_banner", "-i", str(aud / "narration.m4a")], capture_output=True, text=True).stderr
    h, m_, sec = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe).groups()
    ndur = round(min(dur, int(h) * 3600 + int(m_) * 60 + float(sec)), 3)  # the last chapter's tail runs past the voice
    audios = [audio("narration", "assets/audio/narration.m4a", 0, ndur, [(0, 1), (ndur, 1)], 1)]
    for e in cfg.get("sfx", []):
        f = aud / f"{e['src']}.m4a"
        if not f.exists():
            exts = (".flac", ".wav", ".mp3", ".m4a", ".ogg")  # the film's own sounds first (tools/synth_audio.py), then the library
            hits = [p for p in (PROJECT / "audio/sfx").glob(f"{e['src']}.*") if p.suffix in exts] + [p for p in SFX_LIB.rglob(f"{e['src']}.*") if p.suffix in exts]
            if not hits:
                sys.exit(f"sound {e['src']} not in {SFX_LIB}")
            subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(hits[0]), "-c:a", "aac", "-b:a", "128k", str(f)], check=True)
        s = max(0.0, when(e["at"]))
        d = round((when(e["until"]) if "until" in e else s + e["dur"]) - s, 3)
        v, fi, fo = e.get("vol", 0.4), e.get("fi", 0.5), e.get("fo", 0.6)
        audios.append(audio(e["id"], f"assets/audio/{f.name}", s, d, [(0, 0), (min(fi, d / 2), v), (max(d - fo, d / 2), v), (d, 0)], e.get("track", 3)))
    # painted tableaux (tools/tableau.py → <project>/tableaux/<id>/): copy the layers, list them for preloading
    tab_files = []
    for tid in cfg.get("tableaux", []):
        src = PROJECT / "tableaux" / tid
        dst = chdir / "assets" / "tableaux" / tid
        dst.mkdir(parents=True, exist_ok=True)
        for f in sorted(src.iterdir()):
            if f.suffix in (".jpg", ".png", ".webp"):
                shutil.copy(f, dst / f.name)
                tab_files.append(f"{tid}/{f.name}")
    # battle clips live in <project>/clips (rendered by battles/render.sh); copy the ones this chapter plays
    for c in cfg.get("clips", []):
        dst_clip = chdir / c["src"]
        dst_clip.parent.mkdir(parents=True, exist_ok=True)
        src = PROJECT / "clips" / Path(c["src"]).name
        loc = src.with_name(f"{src.stem}.{lang}{src.suffix}")  # e.g. clips/sting.en.webm: the English version of the intro
        shutil.copy(loc if loc.exists() else src, dst_clip)
    # "overlay": true — a clip with transparency (WebM alpha) laid over the picture instead of replacing it
    def clip(c, cls, track):
        return f'      <video id="{c["id"]}" class="clip {cls}" src="{c["src"]}" muted playsinline data-start="{when(c["at"]):.3f}" data-duration="{when(c["until"]) - when(c["at"]):.3f}" data-track-index="{track}"></video>'
    videos = [clip(c, "battle", 0) for c in cfg.get("clips", []) if not c.get("overlay")]
    overlays = [clip(c, "overlay-clip", 8 + i) for i, c in enumerate(cfg.get("clips", [])) if c.get("overlay")]

    # data.js and index.html
    (chdir / "js").mkdir(exist_ok=True)
    # map scenes need the projection from tools/map_render.py; a chapter without a map runs without it
    pj = HERE / "map/out/projection.json"
    proj = json.loads(pj.read_text()) if pj.exists() else {"layers": []}
    scenes_js = (chdir / "js/scenes.js").read_text()
    # a layer is used when its name appears as a whole word in the scenes ("rome-264": 1, latium: 0.6, …)
    used_layers = [l for l in proj.get("layers", []) if re.search(rf"(?<![\w-]){re.escape(l)}(?![\w-])", scenes_js)]
    (chdir / "js/data.js").write_text(
        "// generated by shared/chapter_build.py: narration lines in chapter seconds (+ Vietnamese text for word cues), map projection\n"
        f"window.LINES = {json.dumps({str(n): v for n, v in lines.items()}, ensure_ascii=False)};\nwindow.MAP_PROJ = {json.dumps(proj)};\n"
        f"window.MAP_LAYERS = {json.dumps(used_layers)};\n"
        f"window.LANG = {json.dumps(lang)};\nwindow.TR = {json.dumps(TR, ensure_ascii=False)};\n"
        f"window.TABLEAUX = {json.dumps(tab_files)};\nwindow.CAST = {json.dumps(cast_map)};\n"
    )
    fontcss = (HERE / "fonts/lora.css").read_text().replace("url(lora-", "url(shared/fonts/lora-")
    t1, t2 = [TR.get(x, x) for x in ((cfg.get("title") or []) + ["", ""])[:2]]
    html = (HERE / "template.html").read_text()
    for key, val in {"TITLE": chs[k]["title"], "FONTCSS": fontcss, "DUR": f"{dur}", "VIDEOS": "\n".join(videos), "OVERLAYS": "\n".join(overlays), "AUDIOS": "\n".join(audios), "T1": t1, "T2": t2}.items():
        html = html.replace("{{" + key + "}}", val)
    html = html.replace("\n\n      <canvas", "\n      <canvas")
    (chdir / "index.html").write_text(html)
    if not (chdir / "package.json").exists():
        (chdir / "package.json").write_text(json.dumps({"name": chdir.name, "private": True, "type": "module", "scripts": {s: f"npx --yes hyperframes@0.8.152 {c}" for s, c in (("dev", "preview"), ("check", "check"), ("render", "render"))}}, indent=2) + "\n")
        (chdir / "hyperframes.json").write_text((HERE / "hyperframes.json").read_text())
        (chdir / "meta.json").write_text(json.dumps({"id": chdir.name, "name": chs[k]["title"]}, ensure_ascii=False, indent=2) + "\n")
    print(f"built {chdir.relative_to(ROOT)}: {len(lib)} assets, {len(audios) - 1} sounds, {len(videos)} clips")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--lang")]
    lang = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--lang=")), "vi")
    main(args[0], lang)
