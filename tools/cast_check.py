"""Find broken drawings among the drawn people (library/anims/cast): several figures in one picture (a model sheet
instead of one person), a ground strip or a coloured backdrop left under the figure.

  .venv/bin/python -I tools/cast_check.py [--fix]
--fix deletes the broken drawings (and, for a broken master, redraws it from a good frame of the same person) so
tools/cast_draw.py / anim_frames.py draw them again.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from asset import key_magenta  # noqa: E402


def mask(path):
    rgb = np.asarray(Image.open(path).convert("RGB"))
    a = key_magenta(rgb)[..., 3] > 128
    if a.mean() > 0.6:  # not a magenta ground: key off the corners' colour
        bg = np.median(np.concatenate([rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3)]), axis=0)
        a = np.abs(rgb.astype(int) - bg).sum(axis=2) > 40
    return a


def broken(path, lying=False):
    a = mask(path)
    if not a.any():
        return "empty"
    lab, n = ndimage.label(a)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    # another person is a blob nearly as big as the main one (a musket, a stool or a dropped shield is much smaller)
    big = [s for s in sizes if s > 0.45 * sizes.max()]
    ys, xs = np.nonzero(a)
    w, h = xs.max() - xs.min(), ys.max() - ys.min()
    bottom = a[ys.max() - 5 : ys.max() + 1].sum(axis=1).max() / a.shape[1]
    if len(big) > 1:
        return f"{len(big)} figures"
    if not lying and bottom > 0.35:
        return "ground strip"
    if not lying and w / max(h, 1) > 1.1:
        return f"too wide {w / h:.2f}"
    return None


if __name__ == "__main__":
    fix = "--fix" in sys.argv
    found = []
    for d in sorted((ROOT / "library/anims/cast").iterdir()):
        for f in sorted(d.glob("*.png")):
            if f.stem in ("ref",) or f.stem.startswith("_"):
                continue
            why = broken(f, lying=f.stem in ("act3", "act4", "act5"))
            if why:
                found.append((d, f, why))
                print(f"{d.name}/{f.name}: {why}")
    print(len(found), "broken")
    if fix:
        import anim_frames as A

        for d, f, why in found:
            if f.stem == "master":
                good = next((g for g in sorted(d.glob("walk*.png")) + sorted(d.glob("act[12].png")) if g not in [x[1] for x in found]), None)
                if good:
                    pose = "standing upright and relaxed, arms hanging, both feet flat on the ground line"
                    f.write_bytes(A.edit(good.read_bytes(), "Draw ONE single person only. " + A.KEEP_PERSON.format(pose=pose)))
                    print("redrew master from", good.name, d.name, flush=True)
                else:
                    f.unlink()
                    print("deleted master (no good frame)", d.name)
            else:
                f.unlink()
                print("deleted", d.name, f.name)
