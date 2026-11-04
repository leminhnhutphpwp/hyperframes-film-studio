# Demos

Short HyperFrames compositions with sound that show the range of the studio. Each folder renders on its own:

```bash
cd demos/<name> && npx --yes hyperframes@0.8.152 render
```

| Demo | What it shows | Size |
|---|---|---|
| [`voices/`](voices/) | Five English Kokoro voices and a Vietnamese VieNeu voice, each with its line lighting up as it is spoken and a waveform from the real recording | 1920×1080, 27 s |
| [`animals/`](animals/) | Drawn animals (two elephants, war horses, steppe horses) played as whole-body walk and gallop cycles over a painted countryside, with shadows, dust and a lyre music bed | 1920×1080, 7 s |
| [`stickman/`](stickman/) | Two stick figures animated from joint angles only: run, jump, kick, header, celebration, with synthesized whoosh, kick, bonk and cheer. No image assets | 1920×1080, 7 s |
| [`daily-life/`](daily-life/) | A vertical Short: painted everyday scenes with slow camera moves, crossfades, English narration and captions that follow the voice | 1080×1920, 8.5 s |
| [`explainer/`](explainer/) | An explainer beat: typed headline, bars that grow, numbers that count up, a row of people filled in by the result, all timed to the narration | 1920×1080, 10 s |

The history film in the main README is `examples/ides-of-march`; the battle clips come from `tools/battle.py`.

## Sound

The sound files are committed, so every demo renders with sound as it is. To make them again (different voices,
different lines), set up Kokoro (`bash scripts/setup.sh --kokoro`) and run:

```bash
runtime/venv-kokoro/bin/python demos/make_audio.py              # every demo
runtime/venv-kokoro/bin/python demos/make_audio.py explainer    # one demo
```

It writes `assets/audio/*.m4a` and `assets/audio/timing.js` (when each line is spoken) and rewrites the `<audio>` tags
between `<!-- AUDIO:BEGIN -->` and `<!-- AUDIO:END -->` in each `index.html`; the captions and animation read the
timing, so they stay in sync with the voice. Music beds and effects come from `tools/synth_audio.py`.

Every composition is a pure function of time: it listens for HyperFrames' `hf-seek` event and redraws that moment.
Open `index.html#t=3.5` in a browser to see a single moment without rendering.

The animal frames and the daily-life paintings were drawn with an image model by the project author and are covered
by this repository's licence.
