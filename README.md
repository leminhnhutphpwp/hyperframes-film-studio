# hyperframes-film-studio

A code-first studio for **faceless YouTube videos**: paper cut-out history films, battles, animals, stick-figure
animation, vertical Shorts and data explainers. You write the narration, and the studio does the rest:

- draws a reusable library of paper puppets, backdrops and props with an image model;
- records the narration with a local text-to-speech voice (Vietnamese or English);
- animates the scenes in HTML and renders them to MP4 with [HyperFrames](https://github.com/heygen-com/hyperframes);
- makes thumbnails and Shorts;
- uploads the result to YouTube or a Facebook page, always as private first.

It is built to be driven by a coding agent such as Claude Code or Codex: every step is a script, and
[`AGENTS.md`](AGENTS.md) tells the agent where things are and which commands work. A complete example film builds and
renders with one command.

> This project is independent and is not affiliated with or endorsed by HeyGen. It uses HyperFrames as its renderer.

## Demos

Every video was rendered from this repository with `npx hyperframes render`, sound included. Each one is a folder you can
render yourself.

### History film · [`examples/ides-of-march`](examples/ides-of-march)

Paper puppets, fog, colour grades and a layered painted close-up, narrated in English with Kokoro. This is the example film: `bash examples/ides-of-march/build.sh` renders it.

https://github.com/user-attachments/assets/939692d5-4cea-41df-b6bc-0f9a4a141c5a

### Voices · [`demos/voices`](demos/voices)

Five English voices (Kokoro) and a Vietnamese one (VieNeu-TTS), all running locally. Each line lights up as it is spoken over a waveform of the real recording.

https://github.com/user-attachments/assets/1aced6d0-6740-40a6-b056-32e775dc3764

### Daily-life Short · [`demos/daily-life`](demos/daily-life)

A vertical 9:16 Short: painted everyday scenes, slow camera moves, narration and captions that follow the voice word by word.

https://github.com/user-attachments/assets/1eb214c5-1a4e-4326-afec-ca8a65c01e15

### Explainer · [`demos/explainer`](demos/explainer)

Kinetic type and data: a typed headline, bars that grow and numbers that count up, all timed to the narration.

https://github.com/user-attachments/assets/06244742-8e77-46f1-b869-0723feb7340e

### Animals · [`demos/animals`](demos/animals)

Elephants and horses drawn once and played as whole-body walk and gallop cycles, with a lyre music bed generated in code.

https://github.com/user-attachments/assets/cc67c6b0-76ea-44fc-a5aa-e1026f712fa1

### Stick figures · [`demos/stickman`](demos/stickman)

Two stick figures animated from joint angles only, no image assets, with whoosh, kick, bonk and cheer effects generated in code.

https://github.com/user-attachments/assets/fe6f797a-54a3-4819-8de1-00685b3f6890

### Battle map · [`samples/battle-paper`](samples/battle-paper)

Hundreds of paper puppets on a terrain map, with swords, shields and an oud, all synthesized.

https://github.com/user-attachments/assets/4fb1193c-eb33-456f-bbf0-06df39309c69

## What's in the box

| Path | What it does |
|---|---|
| `examples/ides-of-march/` | A complete film project (narration, chapter, tableaux, narration audio) that builds and renders with `build.sh`. Copy it to start a film. |
| `templates/film/` | The film engine: paper-puppet rig, cinematic layer (`fx.js`: colour grades, particles, fog, light rays, camera shake, layered close-up tableaux), map scenes and transitions. |
| `templates/battle/`, `templates/short/` | Templates for battle maps (`tools/battle.py`) and vertical Shorts with burned-in captions. |
| `library/` | Starter asset library: four costume kits, two sets of faces, a cut-out, props and four backdrops, plus `catalog.json` and the house style prompt. |
| `tools/` | Python tools: draw and cut assets (`asset.py`), whole-body animation frames (`anim_frames.py`), close-up tableaux (`tableau.py`), narration TTS (`tts_vieneu.py`), frame checks, thumbnails, archive. |
| `publish/` | Node scripts for YouTube (upload, thumbnail, captions, localisations, analytics, retention) and Facebook pages. |
| `demos/` | Short standalone compositions with sound: voices, animals, stick figures, a vertical daily-life Short, a data explainer. |
| `samples/battle-paper/` | A small HyperFrames composition that renders on its own. |
| `docs/` | `setup.md` (machine setup), `workflow.md` (the full film workflow). |
| `AGENTS.md` | The guide for coding agents: setup, a map of the repo, common tasks, rules that keep builds working. |

## Quick start

Requirements: Node.js 18+, Python 3.9+, `ffmpeg` and `ffprobe` on the PATH. For the English voice, also
[uv](https://docs.astral.sh/uv/) or Python 3.12.

```bash
git clone https://github.com/leminhnhutphpwp/hyperframes-film-studio.git
cd hyperframes-film-studio

bash scripts/setup.sh --kokoro           # Python tools, .env, the English voice and its model (~350 MB)
bash examples/ides-of-march/build.sh     # builds and renders the example film (~4 min) → examples/ides-of-march/ch01/renders/
```

Using a coding agent? Point it at [`AGENTS.md`](AGENTS.md) and ask it to run the two commands above first.

Then pick how the studio draws pictures:

| Backend | Setup | Good for |
|---|---|---|
| **Codex CLI** (`IMAGE_BACKEND=codex`) | Install the [Codex CLI](https://github.com/openai/codex) and sign in once with `codex login`. No API key needed. | Drawing on your own machine with your existing account. |
| **Images API** (`IMAGE_BACKEND=api`) | Set `IMAGE_API_KEY` in `.env`. Change `IMAGE_API_URL` and `IMAGE_MODEL` to use any other OpenAI-compatible provider. | Batch drawing, servers and CI. |

Leave `IMAGE_BACKEND` empty and the studio picks for you: the API when a key is set, otherwise Codex if it's installed.

Draw a new asset, then look it up:

```bash
.venv/bin/python -I tools/asset.py draw kit roman-legionary --era ancient --region mediterranean --role heavy-infantry \
  --desc "Roman legionary, tunic, segmented armour, rectangular shield, short sword"
.venv/bin/python -I tools/asset.py list --kind kit
```

Era, region and role codes are listed in [`library/eras.md`](library/eras.md).

Vietnamese TTS, YouTube sign-in and the rest of the setup are in [`docs/setup.md`](docs/setup.md).

## Making a film

1. Copy the example: `mkdir -p projects/<channel> && cp -r examples/ides-of-march projects/<channel>/<film>`, and copy
   `channels/my-channel` to `channels/<channel>` (the channel's name, YouTube id and language, used when uploading).
2. Write `narration.en.txt` (one `NNN text` line per sentence, `# ── Title` for each chapter) and `source/facts.md`
   (one source per fact). Edit `ch01/chapter.json` (which assets and backdrops the chapter uses) and `ch01/js/scenes.js`
   (what happens on screen, timed to the narration lines). Add `ch02/`, `ch03/` … for more chapters.
3. Build and render: `bash projects/<channel>/<film>/build.sh --voice` (records the narration, then renders every chapter).
4. Check the frames (`tools/framecheck.py`), make a thumbnail (`tools/thumb_art.py`, `tools/thumbnail.py`), fill in
   `channels/<channel>/channel.js` and upload with `publish/youtube/upload.js`. Uploads are private until you change them.

The full workflow, including how to keep each film different enough for YouTube's "inauthentic content" policy, is in
[`docs/workflow.md`](docs/workflow.md).

## Good to know

- **Images:** every drawing tool goes through `tools/imagegen.py`, using either the Codex CLI on your machine or an
  OpenAI-compatible Images API. Use an account and a model whose terms allow your use.
- **Voices:** English uses Kokoro (54 voices; `scripts/setup.sh --kokoro`), Vietnamese uses VieNeu-TTS (`docs/setup.md`).
  Both run locally.
- **Music and effects in code:** `tools/synth_audio.py` makes music beds (lyre, oud, zither, tanpura) and battle sounds
  (melee, muskets, cannon) from numpy, so there is nothing to license. `demos/make_audio.py` shows how the demos use it.
- **Secrets:** `.env` and `secrets/` are git-ignored. Never commit API keys or OAuth tokens.
- **Music and sound:** only add audio you have the right to use, and keep its source and licence next to it.

## Licence

Code and the starter assets: [MIT](LICENSE). The bundled Lora font is under the SIL Open Font License 1.1.
HyperFrames is a separate project with its own licence.
