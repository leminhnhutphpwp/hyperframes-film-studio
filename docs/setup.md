# Setup

Everything below is git-ignored. Rebuild it on a new machine with these steps.

| Folder / file | What it is | How to set it up |
|---|---|---|
| `.venv/` | Python 3.9+ for the film tools (`tools/*.py`) | `python3 -m venv .venv && .venv/bin/pip install playwright imageio-ffmpeg numpy pillow scipy` |
| `runtime/venv-vieneu/` | Python 3.12 + VieNeu-TTS, for Vietnamese narration | `python3.12 -m venv runtime/venv-vieneu`, then install VieNeu-TTS (the `vieneu` package) and `huggingface_hub` following VieNeu-TTS's own instructions |
| `runtime/venv-kokoro/` | Python 3.12 + kokoro-onnx (English narration) and faster-whisper (`tools/voice/transcribe.py`) | `python3.12 -m venv runtime/venv-kokoro && runtime/venv-kokoro/bin/pip install kokoro-onnx faster-whisper soundfile` |
| `runtime/models/` | Voice models (~2.5 GB) | VieNeu and its codec download on first use (`tools/voice/vieneu_local.py`); put the Kokoro onnx model and voices in `runtime/models/kokoro/` |
| `publish/node_modules/` | YouTube Data / Analytics clients, dotenv | `cd publish && npm install` |
| `secrets/` | Google OAuth client (`google-oauth-client.json`) and one token folder per channel (`<channel>/youtube-token.json`, `facebook-token.json`) | `node publish/youtube/auth.js --channel=<channel>` signs in and writes the token |
| `.env` | Image model and Facebook keys | Copy `.env.example` to `.env` and fill it in |

Never print, commit or send the contents of `secrets/` or `.env`.

## External tools

- **Image backend** (`tools/imagegen.py`, used by every drawing tool), set with `IMAGE_BACKEND` in `.env`:
  - `codex`: the Codex CLI on this machine. Install it, run `codex login` once, and nothing else is needed.
  - `api`: any OpenAI-compatible Images API (`/images/generations` and `/images/edits`). Set `IMAGE_API_KEY`, and
    `IMAGE_API_URL` / `IMAGE_MODEL` for a provider other than OpenAI (default `gpt-image-1`).
  - Empty: the API when a key is set, otherwise Codex if it's installed.
- **HyperFrames**: `npx --yes hyperframes@0.8.152 render` renders a composition to MP4 and needs `ffmpeg` / `ffprobe`
  on the PATH. To preview without system ffmpeg: `.venv/bin/python -I tools/frames.py <dir> out/ --video 24`.
- **ffmpeg** inside Python comes from `imageio_ffmpeg.get_ffmpeg_exe()` (installed in `.venv`).

## Archive

Finished films can be moved out of the working tree with `tools/archive_videos.py <project> --apply`. They go to
`$STUDIO_ARCHIVE/<channel>/<film>/` (default `archive/` in the studio root), and `<project>/archived.json` records
where each file went.
