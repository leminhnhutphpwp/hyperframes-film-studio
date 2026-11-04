"""Contact sheet of library assets for a quick visual check after drawing.

  .venv/bin/python -I tools/review_assets.py <out.jpg> <asset_dir> [<asset_dir> ...]

Each row: the drawn sheet (magenta background) beside its cut parts on grey, so bad keying or a part bleeding into its
neighbour is easy to spot. Backdrops and terrains (image.jpg) are shown as a thumbnail; cutouts show their single piece.
"""
import json
import sys
from pathlib import Path

from PIL import Image

out, dirs = Path(sys.argv[1]), [Path(d) for d in sys.argv[2:]]
canvas = Image.new("RGB", (1240, len(dirs) * 300), (150, 150, 150))
for r, d in enumerate(dirs):
    y = r * 300 + 5
    if (d / "image.jpg").exists():
        im = Image.open(d / "image.jpg").convert("RGB")
        im.thumbnail((440, 290))
        canvas.paste(im, (0, y))
        continue
    sh = Image.open(d / "sheet.png").convert("RGB")
    sh.thumbnail((440, 290))
    canvas.paste(sh, (0, y))
    parts = json.loads((d / "parts/parts.json").read_text())
    for i, n in enumerate(parts):
        im = Image.open(d / "parts" / f"{n}.png")
        im.thumbnail((95, 140) if len(parts) > 1 else (700, 290))
        canvas.paste(im, (450 + (i % 8) * 98, y + (i // 8) * 145), im)
canvas.save(out, quality=82)
print(out)
