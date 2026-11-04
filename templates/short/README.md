# Vertical Shorts template (1080×1920)

A standalone Short (not cut from a long film): portrait tableaux drawn for it fill the frame, the camera drifts
slowly, scenes dissolve into each other, captions are burned in sentence by sentence (names and years highlighted in
yellow), a year + place card, a fixed title at the top, and voice + music bed + sound effects with fades. A Short
lives in `projects/<channel>/<short-name>/`.

```bash
P=projects/<channel>/<name>
# 1. source/facts.md (one source per detail) → narration.vi.txt ("NNN sentences", blank line = paragraph break) — get it approved before recording
runtime/venv-vieneu/bin/python tools/tts_vieneu.py $P/narration.vi.txt $P/audio/vi-story --voice "Hải Đăng"
.venv/bin/python -I tools/assemble_narration.py $P/narration.vi.txt $P/audio/vi-story $P/audio/vi-story/loi-ke-toan-bo.m4a --lead 0.3 --gap 0.6
# 2. tableaux: $P/tableaux/sNN/tableau.json with "flat": true, "portrait": true → (say how many tableaux first)
.venv/bin/python -I tools/tableau.py $P/tableaux/s*/tableau.json
# 3. a self-made music bed (pentatonic zither) — or pick one from library/sfx
.venv/bin/python -I tools/synth_audio.py $P/audio/sfx --bed tranh --bed-seconds 100
# 4. short.json (scenes, year cards, sound effects — see the top of build.py) → build, check, render
.venv/bin/python -I templates/short/build.py $P
(cd $P/build && npx --yes hyperframes@0.8.152 check && npx --yes hyperframes@0.8.152 render --workers 4 --output ../out/<name>.mp4)
```

`"Hải Đăng"` is the name of a VieNeu voice and must be written exactly like this.

- Break captions at units of meaning (≤ ~48 characters, 2–3 lines). Do not split the names listed in `highlight` /
  `keep`, and do not leave a short function word hanging at the end of a line (in Vietnamese, words like `của` "of" or
  `ba` "three"). The last sentence (the question to the viewer) stays whole until the end card finishes.
- Shorts safe area: captions sit at y 1180–1440, with 120 px kept clear on the right (YouTube buttons) and at the
  bottom (channel name, description).
- `build/` is the build output (git-ignored); `out/` → archive it with `tools/archive_videos.py` once published.
