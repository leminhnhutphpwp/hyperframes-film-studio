# AGENTS.md: guide for coding agents

Read this first when you work in this repository (Claude Code, Codex, Cursor, …). It says where things are, which
commands work, and the mistakes that break a build. Every command here is run from the repository root.

## First run (do this before anything else)

```bash
bash scripts/setup.sh --kokoro              # .venv, .env, English TTS runtime and model; checks Node 18+ and ffmpeg
bash examples/ides-of-march/build.sh        # builds and renders the example film → examples/ides-of-march/ch01/renders/*.mp4
```

If both succeed, the machine is ready. If `setup.sh` reports a missing tool, install it and run it again.
Rendering an 80-second chapter takes about 3–4 minutes.

## Map

| Path | What it is |
|---|---|
| `examples/ides-of-march/` | A complete film project that builds and renders: `narration.en.txt`, `ch01/chapter.json`, `ch01/js/scenes.js`, `tableaux/`, committed narration audio, `build.sh`. **Start new films by copying it.** |
| `templates/film/shared/` | The film engine (`js/engine.js`, `js/fx.js`, `js/overlay.js`, `js/stage.js`, `js/people.js`, `js/cast.js`) and `chapter_build.py`. `build.sh` copies it into each film. |
| `templates/film/README.md` | Engine reference: every `fx.*` call, tableaux, drawn characters, rig test. |
| `templates/battle/`, `tools/battle.py` | Battle maps. |
| `templates/short/` | Vertical Shorts (Vietnamese-first template; see its README). |
| `demos/` | Small standalone compositions (voices, animals, stickman, daily-life Short, explainer). `demos/make_audio.py` makes their sound. |
| `library/` | Asset library: `kits/`, `heads/`, `cutouts/`, `props/`, `backdrops/`, `catalog.json`, `eras.md` (codes), `style.prompt.txt`. |
| `tools/` | Python tools: `asset.py` (draw/list/cut assets), `imagegen.py` (image backend), `tts_vieneu.py` (TTS, Kokoro or VieNeu), `assemble_narration.py`, `tableau.py`, `anim_frames.py`, `framecheck.py`, `thumb_art.py`, `thumbnail.py`, `synth_audio.py`, `map_render.py`. |
| `publish/` | YouTube / Facebook scripts (Node). `cd publish && npm install` first. See `publish/README.md`. |
| `channels/my-channel/channel.js` | Example channel identity used by `publish/`. |
| `docs/setup.md`, `docs/workflow.md` | Machine setup; the full film workflow. |

Python tools run with the repo venv and `-I`: `.venv/bin/python -I tools/<tool>.py --help`.
TTS runs with its own venv: `runtime/venv-kokoro/bin/python tools/tts_vieneu.py …`.

## Common tasks

**Make a new film (English)**

```bash
cp -r examples/ides-of-march projects/<channel>/<film>
# 1. write narration.en.txt: "NNN text" lines; a blank line ends a paragraph; "# ── Title" starts a chapter
# 2. one chNN/ folder per chapter: chapter.json (assets, backdrops, tableaux) + js/scenes.js
# 3. build and render (re-records the voice from the narration):
bash projects/<channel>/<film>/build.sh --voice
```

- `chapter.json` `"chapter": N` is the Nth `# ──` chapter of the narration. Asset refs are `kind/id[@colour]`; every id
  must exist in `library/` (`.venv/bin/python -I tools/asset.py list`).
- In `scenes.js`, time comes from the narration: `at(n)` = start of line n, `end(n)` = its end,
  `cue(n, 0.4)` = 40% through line n. On-screen text is plain strings with an opacity you animate:
  `ov.caption(text, [x, y], alpha)`, `ov.note(head, body, alpha)`, `ov.stamp(year, line, alpha)`; use
  `window01(t, a, b, fadeIn, fadeOut)` from `engine.js` for the alpha. The example's `ch01/js/scenes.js` shows all of it.
- Each segment's `run(t)` returns the stage it drew, or `null` when a tableau (`fx.tableau`) fills the frame.

**Draw assets** (needs an image backend in `.env`: `IMAGE_BACKEND=codex` with the Codex CLI signed in, or
`IMAGE_BACKEND=api` with `IMAGE_API_KEY`)

```bash
.venv/bin/python -I tools/asset.py draw kit roman-legionary --era ancient --region mediterranean --role heavy-infantry \
  --desc "Roman legionary, tunic, segmented armour, rectangular shield, short sword"
.venv/bin/python -I tools/asset.py list --kind kit
```

Look up before drawing (`asset.py list`); draw only what is missing. Check every drawing at full size before use.

**Render a demo**: `cd demos/<name> && npx --yes hyperframes@0.8.152 render`. Re-make demo sound:
`runtime/venv-kokoro/bin/python demos/make_audio.py [demo]`.

**Preview one moment without rendering**: compositions in `demos/` accept `index.html#t=3.5` in a browser.

**Upload**: `node publish/youtube/upload.js …` (see `publish/README.md`). Uploads are always private. Never make a
video public, delete one or change its privacy unless the user explicitly asks for that video.

## Rules that prevent broken builds

- Do not edit `templates/film/shared/` inside a film by hand expecting it to persist: `build.sh` re-copies the
  template each run. Change the template, or change the film's `chNN/js/scenes.js`.
- Generated files are git-ignored and rebuilt: `chNN/index.html`, `chNN/assets/`, `chNN/shared/`, `chNN/js/data.js`,
  `shared/` in a film. Keep `chapter.json`, `js/scenes.js`, `narration.*.txt`, `tableaux/`, `audio/*-story/`
  (`narration.m4a`, `timing.json`, `lines.json`).
- After changing the narration text, re-record (`build.sh --voice`); timing comes from the audio.
- Check a render before calling it done: watch it, or extract frames with ffmpeg
  (`ffmpeg -ss 10 -i out.mp4 -frames:v 1 frame.jpg`). A build that finishes can still show an empty or wrong frame.
- One render at a time on a small machine; rendering is memory-hungry.
- Never commit `.env`, `secrets/` or tokens; never print them.
- Facts in narration need a source (`source/facts.md`, see `docs/workflow.md`). Do not invent dates or numbers.

## Language notes

The pipeline was first written for Vietnamese narration. A film written in English only needs `narration.en.txt`
and `audio/en-story/`; build with `--lang=en` (what `build.sh` does). Vietnamese-first films use `narration.vi.txt`,
and other languages are timed against it and translated through `strings.<lang>.json`; see `docs/workflow.md`.
