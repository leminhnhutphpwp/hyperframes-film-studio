"""Draw the art for a YouTube thumbnail through the image model (tools/imagegen.py; 1536x1024, cropped to 16:9 by tools/thumbnail.py;
--portrait: 1024x1536 for a vertical Short's 9:16 thumbnail).

  .venv/bin/python -I tools/thumb_art.py <out.png> --side left "Close-up of ... with a tense stare ..."

The description is the creative part: pick per video what makes the story striking (a face with a clear emotion, a
face-off, a scale contrast, an object). --side names the part of the frame left calm and dark for the headline
(left/right/top/bottom). The paper cut-out look and the thumbnail rules are added here.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import imagegen  # noqa: E402

STYLE = ("Flat hand-painted paper cut-out illustration, like layered cut paper for a history animation: clean simple shapes, "
         "subtle paper grain, thin dark-brown outlines, painterly shading. YouTube thumbnail composition: ONE dominant subject, "
         "large and close, readable at a tiny size; strong value contrast, dramatic rim light, deep dark vignette, saturated warm "
         "accents against cool shadows. Leave the {side} part of the frame calm and dark for a headline. "
         "No text, no letters, no numbers, no flags, no logos.")
# --real: a photographic, film-still look (real faces, real places), which tends to draw more clicks
REAL = ("Photorealistic cinematic film still from a big-budget historical epic, shot on a full-frame camera with a 50mm lens: "
        "a real human face with natural skin texture, pores, sweat and stubble, real costume fabrics and metal, a real location, "
        "shallow depth of field. YouTube thumbnail composition: ONE dominant subject, large and close, readable at a tiny size; "
        "strong value contrast, dramatic rim light, deep dark vignette, warm highlights against cool shadows. Leave the {side} "
        "part of the frame calm and dark for a headline. Not a painting, not an illustration, not CGI-looking. "
        "No text, no letters, no numbers, no flags, no logos, no watermark.")

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("desc")
ap.add_argument("--side", default="left", choices=["left", "right", "top", "bottom"])
ap.add_argument("--portrait", action="store_true", help="1024x1536 (vertical Short)")
ap.add_argument("--real", action="store_true", help="photorealistic film-still look instead of paper cut-out")
a = ap.parse_args()
prompt = a.desc + "\n\n" + (REAL if a.real else STYLE).format(side=a.side)
open(a.out, "wb").write(imagegen.generate(prompt, "1024x1536" if a.portrait else "1536x1024"))
print(a.out)
