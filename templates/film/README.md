# Paper cut-out film template (latest)

`shared/` is the film build kit for **every new film**: the paper-puppet engine plus the cinematic layer `fx.js`.
Published films keep their old code; this template only applies from the next film on.

Starting a new film:

```bash
mkdir -p projects/<name> && cp -r templates/film/shared projects/<name>/shared
# edit shared/js/cast.js (the film's characters) and shared/map/spec.json (the map region), then run tools/map_render.py
```

`examples/` — a test chapter, "The Ides of March", using every effect (`ides-scenes.js`, `ides-chapter.json`), plus two
tableaux (`ides-dao`: 3 layers, `ides-toga`: 1 layer).

## Cinematic layer — `shared/js/fx.js`

Call these inside a scene function, every frame (driven by t, so they are correct wherever you seek to):

| Call | Use it for |
|---|---|
| `fx.grade("night" \| "dusk" \| "dawn" \| "storm" \| "fire" \| "gold" \| "cold" \| "blood" \| "memory" \| "tense", a)` | colour to match the mood of the scene |
| `fx.particles("dust" \| "embers" \| "rain" \| "snow" \| "ash" \| "sparks" \| "petals" \| "smoke", t, a, {n, area, wind})` | sunlit dust, embers, rain, triumph petals, smoke from fires |
| `fx.fog(t, a, {y})` | river mist, early morning, battlefields |
| `fx.glow([x, y], r, "#ff9a3c", a, t)` | torchlight, a furnace, an oil lamp — put the source off-frame if the backdrop has no torch |
| `fx.rays(t, a, {from, angle})` | sunbeams through a window or a temple |
| `fx.lightning(t, [t1, t2])` | lightning in a storm |
| `fx.bars(a)` | 2.35:1 letterbox bars for big moments |
| `fx.focus(S, a)` | blurs the backdrop when the camera pushes in to a close shot (chapter_build pre-builds `<backdrop>.blur.jpg`) |
| `fx.shake(camera, t, amp)` | shake on impacts and cannon fire |
| `fx.tableau(spec, t, a, b)` | a layered close-up tableau with a parallax camera move — the scene function returns `null` |

Transitions: `export const TRANSITIONS = [{ t, kind: "ink" | "burn" | "paper" | "flash", d }]` in `scenes.js`
(use these instead of `DIPS` fades to black where it helps).

Close-up camera: push `look()` from z≈8.5 (wide shot) to z≈4.5 (medium shot) on whoever is speaking, together with
`fx.focus`. Puppet heads are 270×380 px, so medium shots stay sharp.

## Close-up tableaux — `tools/tableau.py`

```bash
.venv/bin/python -I tools/tableau.py projects/<name>/tableaux/<id>/tableau.json
```

`tableau.json`: `light` (shared by every layer), `bg` (the background plate, no people), `mid`/`fg` (characters on a
pink background, which is then removed), or `"flat": true` (one image that includes the people, no parallax). Add
`"tableaux": ["<id>"]` to `chapter.json`.
Lessons learned: the image model tends to darken the middle of the foreground layer — check the layer on a blue
background before using it. For a quiet scene with a single character, use `flat`. Do not draw blood or wounds;
only suggest violence (a raised knife, a fall into darkness).

## Characters and animals drawn as whole figures

Jointed puppets (head, torso, thighs… rotating around joints) keep showing faults at the neck, legs and joints no
matter how much you fix them. What animation does with movement that joints cannot fake is **replacement**: draw a
whole figure for each pose and play them in sequence. The image model draws a reference figure, then redraws each
frame from that same reference (image-to-image editing), so it stays the same character.

| Kind | Used for | anim.json `type` |
|---|---|---|
| Animal | horses, elephants (walk, gallop) — the saddle/howdah and the puppet riding it follow each frame | `horse`, `elephant` |
| Person | main characters and close-up characters: standing, walk frames, every pose the script needs | `person` |
| Rider | rider and horse drawn as one image (walk, gallop) — no neck or stirrup faults | `rider` |

```bash
mkdir -p library/anims/<id> && $EDITOR library/anims/<id>/anim.json     # model it on an existing anim.json (a general, a rider, a horse)
.venv/bin/python -I tools/anim_frames.py library/anims/<id>              # draws the reference figure, then the frames (3 at a time)
.venv/bin/python -I tools/anim_frames.py --cut library/anims/<id>        # removes the background, same size, same ground line → frames/
.venv/bin/python -I tools/rigtest.py /tmp/x.png --anims <id>              # inspect every frame; --video 6 → /tmp/x.mp4
```

In `chapter.json`: `"assets": ["anims/<id>", …]`. In a scene:
- animal: `makeAnimMount(scene, "<id>@anim")` + `poseAnimMount(m, "walk" | "gallop", stride)`; to seat a puppet on it:
  `rideOn(m, figure)` + `applyPose(figure, RIDING)`.
- person or rider: `makeAnimPerson(scene, "<id>@anim")` + `poseAnimPerson(p, "walk", stride)` or
  `poseAnimPerson(p, "act3")`; to face the other way: `p.root.scale.x = -1`.
- Timing: walking ~6–8 frames per second (a person ~1 stride per second, a horse ~0.9, an elephant ~0.6), galloping
  ~2 strides per second.

**Reuse, don't redraw:** animals and minor roles (crowds, soldiers, civilians) are reused across films. For each
costume, only one person gets walk frames and poses drawn. Others in the same costume only get a standing image (their
own face) and borrow that person's frames (`tools/cast_draw.py` LEADS, `chapter_build.py`). Only each film's named
main characters get a full set.

If a pose is missing, add a line to `cycles` in anim.json and run it again (it only draws the missing images). Jointed
puppets are still fine for crowds and distant soldiers.

## Puppet rig — quick check on a canvas, no render

```bash
.venv/bin/python -I tools/rigtest.py /tmp/rig.png                               # 5 characters × 14 poses, ~8 s
.venv/bin/python -I tools/rigtest.py /tmp/rig.png <kit>[:<head-set>:<headN>] --poses "stand,sit,kneel" --marks
.venv/bin/python -I tools/rigtest.py /tmp/all.png --all --per 6                  # the whole library, ~20 s
.venv/bin/python -I tools/rigtest.py /tmp/mounts.png --mounts                      # horses, elephants: standing, 4 walk phases, gallop
.venv/bin/python -I tools/rigtest.py /tmp/mounts.png --mounts <mount> --rider <kit>  # one animal with a different rider
```

`--poses` takes the pose names defined in `templates/film/rigtest/index.html` (for example `stand`, `sit`, `kneel`, `bow`,
`fallen`).

After changing the engine or the joints, run this instead of rendering a whole chapter. For a new film, run it first
for **every action the film uses** (walk, sit, kneel, ride, animals) with the film's own costumes. `--marks`: red dots
for the neck, blue for shoulders/hips, green for elbows/knees. The rig:
- **Neck** — the head rotates at the nape (`neck`, `neckLen` in `parts.json`, measured on the image: `asset.py`
  measures it when cutting; the older library has been through `repivot`). The neck sinks into the collar socket
  (`neckSocket`) according to each figure's neck length; adjust globally with `NECK`.
- **Ground contact** — the hips rise to follow the lowest point: the sole, the toe (the foot is drawn on the shin
  piece) or the knee.
- **Sitting** (`SEATED`, `sit`) — set `root.position.y` to the seat height (or `seatH`) before `applyPose`: the legs
  bend on their own so the feet touch the ground; on a throne that is too high, the legs hang.
- **Kneeling** (`KNEEL`, `kneel`) — the front leg keeps its angle; the back leg is solved so the knee and toes both
  touch the ground.
- **Upright spears, guns, staffs** — the butt never goes through the ground (it rests on the ground; on horseback it
  rests level with the stirrup). With the arm hanging, the hand holds it slightly forward so the shaft does not cover
  the face.
- **Shields** — put down when sitting or kneeling (`keepShield: true` keeps them).
- **Pink fringes** at piece edges (knees, elbows) are removed in the shader.
- **Horses, elephants** — each frame the animal's body is lowered or raised so the lowest hoof touches the ground
  (previously a swinging leg made the whole animal float). Only a gallop (`amp > 1`) lifts it off the ground. An
  elephant rider sits behind the howdah wall (legs hidden, chest above the wall).

## Added in recent films

- A chapter's `chapter.json` can set `"hold": seconds` — cut to the next chapter exactly that many seconds after the
  last sentence (instead of in the middle of the silence), to leave room for a clip such as a channel intro. `at`/`until`
  cues accept `[n, "end+0.3"]` (seconds after sentence n finishes) — correct for every language version.
- Clips with `"overlay": true`: a WebM with a transparent background (`hyperframes render --format webm`) is laid over
  the picture instead of replacing it — used for info cards at the start of a film. Per-language clips:
  `clips/<name>.<lang>.webm`.
- Ink transitions: the SVG filter uses `color-interpolation-filters="sRGB"` (before, the ink turned greenish).
- Newly painted backdrops with high ground: the default camera angle only sees ground → use a smaller, closer, lower
  backdrop (`stage(id, { width: 18, height: 12, z: -5, y: 2.6 })`, see `projects/my-channel/hannibal/shared/js/stage.js`);
  check with `tools/frames.py` before rendering.
- Real archival material (credited images) and a top-down battle board: `projects/my-channel/hannibal/shared/js/han.js`
  (`archival`, `board`, `block`, `track`). An oud music bed: `tools/synth_audio.py --bed oud`.
