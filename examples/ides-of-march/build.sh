#!/bin/bash
# Build and render this film from scratch: engine → narration → chapter → MP4.
# Copy the whole folder to projects/<channel>/<film>/ to start your own film; this script works from there too.
#
#   bash build.sh            build (reuses the committed narration audio) and render
#   bash build.sh --voice    re-record the narration with Kokoro first
#
# Needs the .venv from the README (numpy, pillow, scipy, imageio-ffmpeg), Node.js 18+ and ffmpeg.
# --voice also needs the Kokoro runtime (docs/setup.md). Output: out/<film>.en.mp4 (all chapters joined, the file
# publish/youtube/upload.js picks up) and out/chapters.en.txt (YouTube chapter timestamps for the description).
#
# Your film's own files that survive a rebuild: cast.js (copied over shared/js/cast.js) and map/out/ (from
# tools/map_render.py). Everything in shared/ is replaced by templates/film/shared on every run.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# the repo root: the nearest folder above that has tools/asset.py (works wherever you copy this project)
ROOT="$HERE"; while [ ! -f "$ROOT/tools/asset.py" ]; do [ "$ROOT" = "/" ] && { echo "Run this inside the hyperframes-film-studio repo."; exit 1; }; ROOT="$(dirname "$ROOT")"; done
PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || { echo "Missing $PY: run the Python setup from the README first."; exit 1; }
cd "$HERE"

echo "1/5  engine: copy templates/film/shared into this project"
rm -rf shared && cp -R "$ROOT/templates/film/shared" shared
[ -f cast.js ] && cp cast.js shared/js/cast.js                     # this film's people
[ -d map/out ] && mkdir -p shared/map && cp -R map/out shared/map/  # this film's rendered map

if [ "${1:-}" = "--voice" ] || [ ! -f audio/en-story/narration.m4a ]; then
  echo "2/5  narration: read narration.en.txt with Kokoro, then join the paragraphs"
  KPY="$ROOT/runtime/venv-kokoro/bin/python"
  [ -x "$KPY" ] || { echo "Missing $KPY: set up Kokoro (docs/setup.md), or keep the committed audio/en-story."; exit 1; }
  "$KPY" "$ROOT/tools/tts_vieneu.py" narration.en.txt audio/en-story --engine kokoro --voice am_fenrir
  "$PY" -I "$ROOT/tools/assemble_narration.py" narration.en.txt audio/en-story audio/en-story/narration.m4a
else
  echo "2/5  narration: using audio/en-story/narration.m4a (pass --voice to re-record)"
fi

echo "3/5  chapters: stage assets, cut the narration, write chNN/index.html"
for ch in ch[0-9][0-9]; do "$PY" -I shared/chapter_build.py "$ch" --lang=en; done

echo "4/5  render each chapter with HyperFrames"
for ch in ch[0-9][0-9]; do (cd "$ch" && rm -rf renders && npx --yes hyperframes@0.8.152 render); done

echo "5/5  join the chapters: out/$(basename "$HERE").en.mp4"
mkdir -p out
FILM="out/$(basename "$HERE").en.mp4"
for ch in ch[0-9][0-9]; do echo "file '$HERE/$(ls "$ch"/renders/*.mp4 | tail -1)'"; done > out/chapters.list
FF="$("$PY" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
"$FF" -hide_banner -loglevel error -y -f concat -safe 0 -i out/chapters.list -c copy "$FILM"
# YouTube chapter list: "m:ss Title" per narration chapter (paste it into the video description)
"$PY" -c '
import json, sys
t = json.load(open("audio/en-story/timing.json"))
for i, c in enumerate(t["chapters"]):
    s = 0 if i == 0 else int(t["lines"][str(c["line"])]["t"])
    title = c["title"]
    print("%d:%02d %s" % (s // 60, s % 60, title))' > out/chapters.en.txt
echo "done: $HERE/$FILM"
