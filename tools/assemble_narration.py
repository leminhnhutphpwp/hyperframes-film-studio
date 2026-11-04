"""Join the paragraph WAVs from tools/tts_vieneu.py into one narration track, with breaths between paragraphs and a
longer pause between chapters.

  .venv/bin/python -I tools/assemble_narration.py <narration.txt> <paragraph_dir> <out.m4a> [--gap 0.7] [--chapter-gap 1.6] [--lead 0.6] [--pause 3=2.6]

Chapters are the "# ──" comment lines in narration.txt. Writes <out>.m4a (stereo AAC, loudness-normalised to -16 LUFS)
and <paragraph_dir>/timing.json: {"total": s, "chapters": [{"title", "t"}], "lines": {"NNN": {"t": s, "d": s}}}
with times on the assembled track.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

ap = argparse.ArgumentParser()
ap.add_argument("narration")
ap.add_argument("pdir")
ap.add_argument("out")
ap.add_argument("--gap", type=float, default=0.7)
ap.add_argument("--chapter-gap", type=float, default=1.6)
ap.add_argument("--lead", type=float, default=0.6)
ap.add_argument("--pause", action="append", default=[], help="N=seconds: extra silence after line N (e.g. a title card)")
a = ap.parse_args()

# which line opens each chapter
chapters, pending = [], None
for raw in Path(a.narration).read_text(encoding="utf-8").splitlines():
    if raw.startswith("# ──"):
        pending = raw.strip("# ─").strip()
    m = re.match(r"(\d+)\s", raw)
    if m and pending:
        chapters.append({"title": pending, "line": int(m.group(1))})
        pending = None
opens = {c["line"] for c in chapters}
extra = {int(k): float(v) for k, v in (x.split("=") for x in a.pause)}

pdir = Path(a.pdir)
meta = json.loads((pdir / "lines.json").read_text())
t, starts, inputs = a.lead, [], []
for i, p in enumerate(meta["paragraphs"]):
    if i and p["lines"][0] in opens:
        t += a.chapter_gap - a.gap
    if i:
        t += extra.get(meta["paragraphs"][i - 1]["lines"][-1], 0)
    starts.append(round(t, 3))
    t += p["dur"] + a.gap
    inputs += ["-i", str(pdir / p["file"])]
total = round(t - a.gap, 3)

# amix in batches is unnecessary: concat with exact silences is lossless and cheap for ~60 inputs
fc, labels = [], []
for i, s in enumerate(starts):
    prev_end = 0.0 if i == 0 else starts[i - 1] + meta["paragraphs"][i - 1]["dur"]
    pad = s - prev_end
    fc.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,adelay={int(pad * 1000)}[a{i}]")
    labels.append(f"[a{i}]")
fc.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000[out]")
ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", "[out]", "-ac", "2", "-c:a", "aac", "-b:a", "160k", a.out], check=True)

lines = {n: {"t": round(starts[v["p"]] + v["start"], 3), "d": round(v["end"] - v["start"], 3)} for n, v in meta["lines"].items()}
for c in chapters:
    c["t"] = lines[str(c["line"])]["t"]
timing = {"total": total, "lead": a.lead, "pauses": extra, "paragraph_starts": starts, "chapters": chapters, "lines": lines}
(pdir / "timing.json").write_text(json.dumps(timing, indent=1, ensure_ascii=False))
print(f"{a.out}: {total / 60:.2f} min, {len(starts)} paragraphs, {len(chapters)} chapters")
for c in chapters:
    print(f"  {int(c['t'] // 60):02d}:{c['t'] % 60:05.2f}  {c['title']}")
