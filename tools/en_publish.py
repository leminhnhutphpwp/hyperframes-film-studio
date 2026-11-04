"""English publish files for a film's English cut: publish/youtube-meta.en.json (title, description with chapter
times, tags) and publish/thumbnail.en.jpg (the film's thumbnail art with an English hook).

  .venv/bin/python -I tools/en_publish.py projects/<channel>/<film> --title "..." --lines "HUNTED|AT 18" [--badge "..."]

Chapter times come from audio/en-story/timing.json, cut the way shared/chapter_build.py cuts chapters (half-way
through the pause before each chapter's first line), so they match the English render. The description is the
existing English one with its chapter list replaced; tags are kept. The thumbnail reuses publish/thumb/thumb.json's
first entry (layout, crop, colours) with the English lines and badge.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("--title", required=True)
ap.add_argument("--lines", required=True, help="thumbnail hook, lines split by |")
ap.add_argument("--badge", default=None)
ap.add_argument("--fs", type=int, default=None)
a = ap.parse_args()
P = (ROOT / a.project).resolve()
pub = P / "publish"

timing = json.loads((P / "audio/en-story/timing.json").read_text())
L = {int(n): v for n, v in timing["lines"].items()}
titles = [re.sub(r"^# ── Chapter \d+ · ", "", l).strip(" ─\n") for l in (P / "narration.en.txt").read_text().splitlines() if l.startswith("# ── Chapter")]
rows = []
for i, ch in enumerate(timing["chapters"]):
    first = ch["line"]
    t = 0.0 if i == 0 else (L[first - 1]["t"] + L[first - 1]["d"] + L[first]["t"]) / 2
    rows.append(f"{int(t // 60):02d}:{int(t % 60):02d} {titles[i] if i < len(titles) else ch['title']}")

f = pub / "youtube-meta.en.json"
meta = json.loads(f.read_text()) if f.exists() else json.loads((pub / "youtube-meta.json").read_text())["localizations"]["en"]
desc = meta["description"]
desc = re.sub(r"Chapters\n(?:\d\d:\d\d .*\n?)+", "Chapters\n" + "\n".join(rows) + "\n", desc)
for junk in (" Narration in Vietnamese; music and sounds made for this video.", " Narration in Vietnamese, with English subtitles.",
             " Narration in Vietnamese; music and battle sounds made for this video."):
    desc = desc.replace(junk, "")
meta.update(title=a.title, description=desc, language="en", privacyStatus="private", madeForKids=False)
f.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")

spec = json.loads((pub / "thumb/thumb.json").read_text())[0]
spec.update(out="../thumbnail.en.jpg", lines=a.lines.split("|"))
if a.badge is not None:
    spec["badge"] = a.badge
if a.fs:
    spec["fs"] = a.fs
tj = pub / "thumb/thumb.en.json"
tj.write_text(json.dumps([spec], ensure_ascii=False, indent=1))
subprocess.run(["python3", str(ROOT / "tools/thumbnail.py"), str(tj)], check=True, capture_output=True)
print(a.title)
print("\n".join(rows))
