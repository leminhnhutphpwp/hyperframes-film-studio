#!/bin/bash
# One-time setup. Safe to run again: it only adds what is missing.
#
#   bash scripts/setup.sh            Python tools (.venv) + checks for Node.js and ffmpeg
#   bash scripts/setup.sh --kokoro   also the English voice: runtime/venv-kokoro + the Kokoro model (~350 MB)
#
# Vietnamese narration (VieNeu-TTS) is set up by hand, see docs/setup.md.
set -euo pipefail
cd "$(dirname "$0")/.."
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
need() { printf '  \033[31m✗\033[0m %s\n' "$1"; MISSING=1; }
MISSING=0

echo "Checking tools"
command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] && ok "Node.js $(node -v)" || need "Node.js 18+ (https://nodejs.org)"
command -v ffmpeg >/dev/null && ok "ffmpeg" || need "ffmpeg on the PATH (macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg)"
command -v ffprobe >/dev/null && ok "ffprobe" || need "ffprobe (comes with ffmpeg)"
command -v python3 >/dev/null && ok "$(python3 --version)" || need "Python 3.9+"
[ "$MISSING" = 0 ] || { echo "Install the missing tools above, then run this again."; exit 1; }

echo "Python tools (.venv)"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip >/dev/null
.venv/bin/pip install -q playwright imageio-ffmpeg numpy pillow scipy
ok ".venv with playwright, imageio-ffmpeg, numpy, pillow, scipy"

[ -f .env ] || { cp .env.example .env; ok ".env created from .env.example (set the image backend there when you draw)"; }

if [ "${1:-}" = "--kokoro" ]; then
  echo "English voice (Kokoro)"
  if [ ! -x runtime/venv-kokoro/bin/python ]; then
    if command -v uv >/dev/null; then uv venv -q --python 3.12 runtime/venv-kokoro
    elif command -v python3.12 >/dev/null; then python3.12 -m venv runtime/venv-kokoro
    else echo "  Kokoro needs Python 3.10+: install uv (https://docs.astral.sh/uv/) or python3.12, then run again."; exit 1; fi
  fi
  if command -v uv >/dev/null; then VIRTUAL_ENV=runtime/venv-kokoro uv pip install -q kokoro-onnx soundfile numpy scipy imageio-ffmpeg
  else runtime/venv-kokoro/bin/pip install -q kokoro-onnx soundfile numpy scipy imageio-ffmpeg; fi
  mkdir -p runtime/models/kokoro
  for f in kokoro-v1.0.onnx voices-v1.0.bin; do
    [ -s "runtime/models/kokoro/$f" ] || curl -fL --progress-bar -o "runtime/models/kokoro/$f" \
      "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
  done
  ok "runtime/venv-kokoro and runtime/models/kokoro"
fi

echo "Done. Next: bash examples/ides-of-march/build.sh   (builds and renders the example film)"
