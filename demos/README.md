# Demos

Short HyperFrames compositions that show the range of the studio. Each folder renders on its own:

```bash
cd demos/<name> && npx --yes hyperframes@0.8.152 render
```

| Demo | What it shows | Size |
|---|---|---|
| [`animals/`](animals/) | Drawn animals (two elephants, war horses, steppe horses) played as whole-body walk and gallop cycles over a painted countryside, with shadows and dust | 1920×1080, 7 s |
| [`stickman/`](stickman/) | Two stick figures animated from joint angles only: run, jump, kick, header, celebration. No image assets | 1920×1080, 7 s |
| [`daily-life/`](daily-life/) | A vertical Short: painted everyday scenes with slow camera moves, crossfades and word-by-word captions | 1080×1920, 8 s |
| [`explainer/`](explainer/) | An explainer beat: typed headline, bars that grow, numbers that count up, a row of people filled in by the result | 1920×1080, 7 s |

The history film and battle clips in the main README come from `templates/film` and `tools/battle.py`.

Every composition is a pure function of time: it listens for HyperFrames' `hf-seek` event and redraws that moment.
Open `index.html#t=3.5` in a browser to see a single moment without rendering.

The animal frames and the daily-life paintings were drawn with an image model by the project author and are covered
by this repository's licence.
