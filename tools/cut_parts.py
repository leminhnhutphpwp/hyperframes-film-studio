"""Split a 4x2 magenta-keyed parts sheet into transparent PNG parts + pivot metadata.

usage: cut_parts.py <sheet.png> <out_dir> <prefix>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

NAMES = ["head", "torso", "upper", "fore", "thigh", "shin", "weapon", "shield"]

sheet, out_dir, prefix = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
out_dir.mkdir(parents=True, exist_ok=True)
img = np.asarray(Image.open(sheet).convert("RGB")).astype(np.float32)
H, W, _ = img.shape
r, g, b = img[..., 0], img[..., 1], img[..., 2]

# magenta-ness: high red and blue, low green
m = (np.minimum(r, b) - g) / 255.0
alpha = 1.0 - np.clip((m - 0.35) / 0.3, 0, 1)
# despill: pull red/blue toward green on semi-transparent edge pixels
spill = np.clip(m, 0, 1)[..., None] * (1 - alpha[..., None])
rgb = img.copy()
rgb[..., 0] = r - (r - g) * spill[..., 0] * 0.9
rgb[..., 2] = b - (b - g) * spill[..., 0] * 0.9
rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)

meta = {}
cw, ch = W / 4, H / 2
for i, name in enumerate(NAMES):
    cx0, cy0 = int((i % 4) * cw), int((i // 4) * ch)
    cell = rgba[cy0 : int(cy0 + ch), cx0 : int(cx0 + cw)]
    mask = cell[..., 3] > 128
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = 4
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(cell.shape[0], y1 + pad), min(cell.shape[1], x1 + pad)
    part = cell[y0:y1, x0:x1]
    pm = part[..., 3] > 128
    h, w = pm.shape

    def band_center(rows):
        cols = np.nonzero(pm[rows].any(axis=0))[0]
        return float((cols.min() + cols.max()) / 2) if len(cols) else w / 2

    top_rows = slice(0, max(2, int(h * 0.06)))
    bot_rows = slice(int(h * 0.94), h)
    info = {"w": int(w), "h": int(h), "top": [band_center(top_rows), 0.0], "bottom": [band_center(bot_rows), float(h)]}
    if name == "shin":
        # knee at top; ankle a bit above the sole — use the leg's own column, not the toes
        ank = slice(int(h * 0.62), int(h * 0.7))
        info["bottom"] = [band_center(ank), float(h * 0.82)]
    if name == "torso":
        # shoulder socket sits just below the top edge, toward the back of the chest
        info["shoulder"] = [band_center(slice(int(h * 0.08), int(h * 0.14))), float(h * 0.1)]
    Image.fromarray(part).save(out_dir / f"{prefix}_{name}.png")
    meta[name] = info

(out_dir / f"{prefix}_parts.json").write_text(json.dumps(meta, indent=1))
print(json.dumps({k: (v["w"], v["h"]) for k, v in meta.items()}))
