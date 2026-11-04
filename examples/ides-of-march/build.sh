#!/bin/bash
# Build and render this film from scratch: engine → narration → chapter → MP4.
# Copy the whole folder to projects/<channel>/<film>/ to start your own film; this script works from there too.
#
#   bash build.sh            build (reuses the committed narration audio) and render
#   bash build.sh --voice    re-record the narration with Kokoro first
#
# Needs the .venv from the README (numpy, pillow, scipy, imageio-ffmpeg), Node.js 18+ and ffmpeg.
# --voice also needs the Kokoro runtime (docs/setup.md). The result is one MP4 per chapter in chNN/renders/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# the repo root: the nearest folder above that has tools/asset.py (works wherever you copy this project)
ROOT="$HERE"; while [ ! -f "$ROOT/tools/asset.py" ]; do [ "$ROOT" = "/" ] && { echo "Run this inside the hyperframes-film-studio repo."; exit 1; }; ROOT="$(dirname "$ROOT")"; done
PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || { echo "Missing $PY: run the Python setup from the README first."; exit 1; }
cd "$HERE"

echo "1/4  engine: copy templates/film/shared into this project"
rm -rf shared && cp -R "$ROOT/templates/film/shared" shared

if [ "${1:-}" = "--voice" ] || [ ! -f audio/en-story/narration.m4a ]; then
  echo "2/4  narration: read narration.en.txt with Kokoro, then join the paragraphs"
  KPY="$ROOT/runtime/venv-kokoro/bin/python"
  [ -x "$KPY" ] || { echo "Missing $KPY: set up Kokoro (docs/setup.md), or keep the committed audio/en-story."; exit 1; }
  "$KPY" "$ROOT/tools/tts_vieneu.py" narration.en.txt audio/en-story --engine kokoro --voice am_fenrir
  "$PY" -I "$ROOT/tools/assemble_narration.py" narration.en.txt audio/en-story audio/en-story/narration.m4a
else
  echo "2/4  narration: using audio/en-story/narration.m4a (pass --voice to re-record)"
fi

echo "3/4  chapters: stage assets, cut the narration, write chNN/index.html"
for ch in ch[0-9][0-9]; do "$PY" -I shared/chapter_build.py "$ch" --lang=en; done

echo "4/4  render each chapter with HyperFrames"
for ch in ch[0-9][0-9]; do (cd "$ch" && npx --yes hyperframes@0.8.152 render); done
ls -1 "$HERE"/ch[0-9][0-9]/renders/*.mp4
