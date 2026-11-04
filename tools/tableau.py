"""Painted tableaux for the films: a close, emotional frame in layers, so fx.tableau can move a camera through it with
parallax (the background drifts less than the figures in front).

  .venv/bin/python -I tools/tableau.py <project>/tableaux/<id>/tableau.json [--only bg,fg]

tableau.json:
  {"light": "night, one torch from the left, cold blue shadows",
   "bg":  "The Senate hall of Rome, empty: marble columns, a statue of Pompey ...",
   "fg":  "Julius Caesar, close, on the right third, turning in shock, a hand at his chest ...",
   "mid": "(optional) senators with raised daggers, small, in the middle distance ...",
   "flat": true,   (optional) bg is the whole picture, people included: one layer, a camera move without parallax
   "portrait": true}  (optional) a 1024x1536 portrait 2:3 frame for vertical Shorts instead of 1536x1024
Writes bg.jpg (the plate, no people) and fg.png / mid.png (keyed from a magenta ground, same 1536x1024 canvas, so the
layers line up; 1024x1536 when "portrait"). Every layer gets the same light and the paper cut-out look. Up to three drawings run at once (tools/imagegen.py).
"""
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset import key_magenta  # noqa: E402

LOOK = ("Flat hand-painted paper cut-out illustration for a history documentary, like layered cut paper: clean simple "
        "shapes, subtle paper grain, thin dark-brown outlines, painterly shading. A cinematic film frame, landscape 3:2, "
        "dramatic and emotional, strong value contrast. No text, no letters, no numbers, no flags, no logos.")


def draw(prompt, portrait=False):
    # same image backend as tools/anim_frames.py (tools/imagegen.py)
    import anim_frames

    if portrait:
        prompt = prompt.replace("landscape 3:2", "portrait 2:3 (tall vertical frame for a phone screen)")
    return Image.open(BytesIO(anim_frames.generate(prompt, "1024x1536" if portrait else "1536x1024"))).convert("RGB")


def make(d, spec, layer):
    light = spec.get("light", "")
    if layer == "bg":
        plate = "" if spec.get("flat") else "This is only the background plate: no people, no animals in it.\n"
        prompt = f"{spec['bg']}\n{plate}Light: {light}.\n\n{LOOK}"
        draw(prompt, spec.get("portrait")).save(d / "bg.jpg", quality=92)
    else:
        prompt = (f"{spec[layer]}\nPaint ONLY these figures, isolated on a perfectly flat, pure magenta (#FF00FF) background "
                  f"that fills ALL the rest of the frame edge to edge: no ground, no floor, no shadow, no darkness, no vignette, no "
                  f"glow, no light beams, no dust, no scenery. Every pixel that is not a figure must be pure magenta. Keep each "
                  f"figure where described in the frame and at that size. Do not use magenta or pink anywhere on the figures.\n"
                  f"Light: {light}.\n\n{LOOK}")
        rgba = key_magenta(np.asarray(draw(prompt, spec.get("portrait"))))
        Image.fromarray(rgba, "RGBA").save(d / f"{layer}.png")
    return f"{d.name}/{layer}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("specs", nargs="+")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true", help="redraw layers that already exist")
    a = ap.parse_args()
    jobs = []
    for sp in a.specs:
        d = Path(sp).resolve().parent
        spec = json.loads(Path(sp).read_text())
        for layer in ("bg", "mid", "fg"):
            if layer not in spec or (a.only and layer not in a.only.split(",")):
                continue
            out = d / ("bg.jpg" if layer == "bg" else f"{layer}.png")
            if out.exists() and not a.force:
                continue
            jobs.append((d, spec, layer))
    with ThreadPoolExecutor(3) as ex:
        for f in [ex.submit(make, *j) for j in jobs]:
            try:
                print(f.result(), flush=True)
            except Exception as e:  # noqa: BLE001 — report and carry on with the other layers
                print("FAIL", e, flush=True)
