"""Asset library for paper cut-out history videos.

Look up before drawing; draw only what is missing. Drawing goes through an image model, then sheets are
cut into transparent parts with pivots. The image backend (the Codex CLI on this machine, or an
OpenAI-compatible Images API) is chosen in tools/imagegen.py with IMAGE_BACKEND.

  asset.py list   [--kind K] [--era E] [--region R] [--role X] [--text WORDS]
  asset.py draw kit     <id> --era E --region R --role X --desc "costume, headwear, weapon, shield"
  asset.py draw heads   <id> --era E --region R --desc "8 varied faces wearing ... headwear"
  asset.py draw mount   <id> --names body,head,... --desc "animal + parts"
  asset.py draw props   <id> --names a,b,c,d,e,f,g,h --desc "what each prop is"
  asset.py draw cutout  <id> --desc "one large standalone piece (ship, tower, city skyline) in side view"
  asset.py draw terrain <id> --desc "top-down ..."
  asset.py draw backdrop <id> --desc "side-view distant ..."
  asset.py cut    <kind> <id>             re-cut an existing sheet
  asset.py recolor <id> <colour>...       make faction colour variants of a kit/heads (teal → colour)
  asset.py catalog                         rebuild library/catalog.json

Run with the project venv:  .venv/bin/python -I tools/asset.py ...
"""
import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import imagegen  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "library"
KIND_DIR = {"kit": "kits", "heads": "heads", "props": "props", "mount": "mounts", "cutout": "cutouts", "terrain": "terrains", "backdrop": "backdrops"}
KIT_PARTS = ["head", "torso", "upper", "fore", "thigh", "shin", "weapon", "shield"]
COLOURS = {  # faction dye targets: hue (0–1), saturation, value multiplier
    "red": (0.0, 0.72, 0.92),
    "yellow": (0.13, 0.8, 1.55),
    "blue": (0.6, 0.6, 0.95),
    "green": (0.3, 0.55, 0.85),
    "purple": (0.78, 0.45, 0.85),
    "white": (0.1, 0.08, 1.7),
    "black": (0.0, 0.05, 0.45),
    "orange": (0.075, 0.95, 1.7),
    "wool": (0.1, 0.28, 1.45),  # undyed wool: pale beige for commoners
}

GRID = (
    "Background: perfectly flat solid magenta #FF00FF everywhere, no shadows, no gradients, no texture on the background. "
    "Layout: an invisible 4 columns x 2 rows grid of equal cells; put exactly ONE item centred in each cell, fully inside its cell "
    "with wide magenta margins, items never touching. No grid lines, no labels, no text."
)

PROMPTS = {
    "kit": (
        "a CHARACTER PARTS SHEET for paper cut-out puppet animation. Character: {desc}. "
        "All body parts in strict SIDE PROFILE for a character facing RIGHT, same scale across parts. "
        "Row 1, left to right: (1) HEAD in profile facing right with short neck at the bottom, wearing the headwear; "
        "(2) TORSO only, upright, side view facing right, shoulders at top and hips at bottom, no head, no arms, no legs; "
        "(3) UPPER ARM only, hanging straight down, shoulder end at top, sleeve as the costume; "
        "(4) FOREARM with closed fist, hanging straight down, elbow at top, fist at bottom. "
        "Row 2, left to right: (5) THIGH only, vertical, hip at top, knee at bottom; "
        "(6) LOWER LEG with foot or footwear, vertical, knee at top, foot at bottom pointing right; "
        "(7) the main WEAPON drawn vertically; (8) the SHIELD seen from the front (if the role has no shield, draw a quiver of arrows instead)."
    ),
    "heads": (
        "a HEADS SHEET for paper cut-out puppet animation: eight different HEADS, each in strict side profile facing RIGHT, "
        "each with a short neck at the bottom, same scale. {desc}. Vary age, face shape, facial hair and expression; keep the same art style."
    ),
    "props": "a PROPS SHEET for paper cut-out animation with eight separate props, in this order left-to-right, top row then bottom row: {names}. {desc}",
    "terrain": (
        "a straight overhead (orthographic, top-down) hand-painted terrain texture, landscape 3:2, for a history documentary battle map. {desc}. "
        "No people, no buildings unless asked, no text, no borders, no horizon."
    ),
    "mount": (
        "an ANIMAL PARTS SHEET for paper cut-out puppet animation: {desc}. The animal is in strict SIDE PROFILE facing RIGHT, "
        "every part at the same scale as the others. Parts in this order, left-to-right, top row then bottom row: {names}. "
        "Leg parts are drawn hanging straight down with the joint end at the top. Each part is a separate piece with clean edges, "
        "slightly overlapping shapes at the joints (rounded ends), never attached to another part."
    ),
    "cutout": (
        "ONE single large paper cut-out piece for puppet animation: {desc}. Strict side view, the piece centred and filling "
        "most of the frame with wide flat magenta margins on every side, nothing else in the image."
    ),
    "backdrop": "a wide side-view background painting, landscape 3:2, for a paper cut-out history animation. {desc}. No people, no text.",
}


MAGENTA_RETRY = (
    "IMPORTANT: the previous attempt used a dark or lit background. The ENTIRE background must be one flat pure magenta "
    "#FF00FF colour edge to edge: no black, no vignette, no glow, no spotlight, no gradient, no paper texture."
)


def magenta_share(path):
    """Fraction of pixels that are flat magenta — a sheet the cutter can key cleanly is mostly background."""
    im = np.asarray(Image.open(path).convert("RGB").resize((300, 200))).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    return float(((r > 200) & (b > 200) & (g < 90)).mean())


def generate(prompt, d):
    """Draw one landscape 3:2 image into d/sheet.png; return an error string or None."""
    try:
        (d / "sheet.png").write_bytes(imagegen.generate(prompt, "1536x1024"))
    except Exception as e:  # noqa: BLE001 — report any transport/format failure to the caller
        detail = e.read().decode(errors="replace")[:2000] if hasattr(e, "read") else ""
        return f"{type(e).__name__}: {e} {detail}"
    return None


def style():
    return (LIB / "style.prompt.txt").read_text().strip()


def asset_dir(kind, aid):
    return LIB / KIND_DIR[kind] / aid


# ---------- cutting ----------
def key_magenta(img):
    img = img.astype(np.float32)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    m = (np.minimum(r, b) - g) / 255.0
    alpha = 1.0 - np.clip((m - 0.35) / 0.3, 0, 1)
    spill = np.clip(m, 0, 1) * (1 - alpha) * 0.9
    out = img.copy()
    out[..., 0] = r - (r - g) * spill
    out[..., 2] = b - (b - g) * spill
    return np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)


def items_by_blob(rgba, count):
    """Find the sheet's items as separate blobs (wide parts may cross grid cells); order them in reading order.

    Returns one RGBA crop per item with everything outside that item cleared, or None when the sheet
    does not split into `count` items laid out as two rows of count/2.
    """
    H, W, _ = rgba.shape
    solid = rgba[..., 3] > 40
    if count == 1:
        ys, xs = np.nonzero(solid)
        return [rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].copy()] if len(ys) else None
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=6))
    if n < count:
        return None
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    main = [int(i) + 1 for i in order[:count]]
    if sizes[order[count - 1]] < sizes[order[0]] * 0.01:
        return None
    centres = {k: ndimage.center_of_mass(solid, lab, k) for k in main}
    # fold leftover fragments of a fair size into the nearest item; drop specks
    owner = np.zeros(n + 1, int)
    for k in main:
        owner[k] = k
    for i in order[count:]:
        k = int(i) + 1
        if sizes[i] >= sizes[order[0]] * 0.002:
            cy, cx = ndimage.center_of_mass(solid, lab, k)
            owner[k] = min(main, key=lambda m: (centres[m][0] - cy) ** 2 + (centres[m][1] - cx) ** 2)
    item = owner[lab]
    rows = [sorted((k for k in main if (centres[k][0] < H / 2) == top), key=lambda k: centres[k][1]) for top in (True, False)]
    if len(rows[0]) != count // 2 + count % 2 and len(rows[0]) != count // 2:
        return None
    cells = []
    for k in rows[0] + rows[1]:
        ys, xs = np.nonzero(item == k)
        crop = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].copy()
        crop[..., 3] = np.where(item[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1] == k, crop[..., 3], 0)
        cells.append(crop)
    return cells


def _runs(row):
    """Contiguous [start, end] runs of True in a 1-D mask."""
    xs = np.nonzero(row)[0]
    if not len(xs):
        return []
    cuts = np.nonzero(np.diff(xs) > 1)[0]
    starts = np.r_[xs[0], xs[cuts + 1]]
    ends = np.r_[xs[cuts], xs[-1]]
    return list(zip(starts, ends))


def neck_pivot(pm):
    """For a head in profile with a short neck at the bottom: where the neck meets the skull (the pivot the head turns
    on) and the neck stump's length, from the opaque mask pm. The neck is the widest run in the bottom rows (a beard
    or a hanging lock beside it is a separate run); going up, the skull base is where the outline grows past 1.6× the
    neck's width. Returns {"neck": [x, y], "neckLen": px} in image pixels."""
    h, w = pm.shape
    ys = np.nonzero(pm.any(axis=1))[0]
    yb = ys.max()
    band = [max(_runs(pm[y]), key=lambda r: r[1] - r[0]) for y in range(yb, max(yb - max(3, h // 40), 0), -1) if _runs(pm[y])]
    nw = float(np.median([e - s for s, e in band])) + 1
    cx = float(np.median([(s + e) / 2 for s, e in band]))
    top = yb
    for y in range(yb, int(h * 0.45), -1):
        rs = _runs(pm[y])
        # the run that holds the neck's centre line (or the nearest one)
        r = min(rs, key=lambda r: 0 if r[0] <= cx <= r[1] else min(abs(r[0] - cx), abs(r[1] - cx))) if rs else None
        if r is None or (r[1] - r[0] + 1) > 1.6 * nw:
            break
        top = y
    length = max(4.0, float(yb - top))
    return {"neck": [round(cx, 1), round(top + 0.25 * length, 1)], "neckLen": round(length, 1)}


def torso_neck(pm):
    """The neck socket on a torso: centre of the widest run in the top rows (not the middle of everything there, which a
    cloak flap or a raised collar at the back would pull aside)."""
    h, w = pm.shape
    ys = np.nonzero(pm.any(axis=1))[0]
    y0 = ys.min()
    band = [max(_runs(pm[y]), key=lambda r: r[1] - r[0]) for y in range(y0, min(h, y0 + max(3, int(h * 0.05))))]
    return [round(float(np.median([(s + e) / 2 for s, e in band])), 1), float(y0)]


def stirrup_point(pm):
    """A saddle seen from the side: the near stirrup's tread, or None for a saddle without stirrups (ancient pads).
    Stirrups hang well below the saddle's main mass; the lowest runs of pixels are their treads (two when both are
    drawn) — take the one nearest the saddle's middle, where the rider's foot falls."""
    h, w = pm.shape
    widths = pm.sum(axis=1)
    wide = np.nonzero(widths > 0.45 * w)[0]
    main_bottom = int(wide.max()) if len(wide) else int(h * 0.6)
    ys = np.nonzero(pm.any(axis=1))[0]
    yb = int(ys.max())
    if yb - main_bottom < 0.15 * h:
        return None
    runs = []
    for y in range(yb, yb - 4, -1):
        runs += _runs(pm[y])
    if not runs:
        return None
    s, e = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - w * 0.5))
    return [round(float((s + e) / 2), 1), float(yb)]


def roof_bottom(pm):
    """A howdah with a canopy: the y (px) where the roof ends above the open space the riders sit in, else None.
    Down the middle of the picture: an opaque roof, then an open gap of a good height, then the rail and floor."""
    h, w = pm.shape
    mid = pm[:, int(w * 0.3) : int(w * 0.7)].mean(axis=1) > 0.5
    ys = np.nonzero(mid)[0]
    if not len(ys):
        return None
    y = int(ys[0])
    while y < h and mid[y]:
        y += 1
    roof_end = y
    while y < h and not mid[y]:
        y += 1
    if roof_end < 0.45 * h and y - roof_end >= 0.15 * h and y < h:
        return float(roof_end)
    return None


def underline(pm):
    """An animal's body seen from the side: its lowest opaque row at 21 points along it (x = 0, 0.05 … 1), as fractions
    of the picture's height — where the belly is, so the legs can hang from the belly line."""
    h, w = pm.shape
    out = []
    for i in range(21):
        x = min(w - 1, int(i / 20 * (w - 1)))
        ys = np.nonzero(pm[:, max(0, x - 2) : x + 3].any(axis=1))[0]
        out.append(round(float(ys.max()) / h, 3) if len(ys) else 0.5)
    return out


def repivot(parts_dir):
    """Add the neck and stirrup measures to an existing parts.json (heads, kit heads and torsos, mount saddles)."""
    pj = parts_dir / "parts.json"
    meta = json.loads(pj.read_text())
    for name, info in meta.items():
        f = parts_dir / f"{name}.png"
        if not f.exists():
            continue
        if not (name.startswith("head") or name in ("torso", "saddle", "body")):
            continue
        pm = np.asarray(Image.open(f).convert("RGBA"))[..., 3] > 128
        if name == "saddle":
            info["stirrup"] = stirrup_point(pm)
            info["roof"] = roof_bottom(pm)
        if name == "body":
            info["underline"] = underline(pm)
        elif name == "torso":
            info["neckSocket"] = torso_neck(pm)
        else:
            info.update(neck_pivot(pm))
    pj.write_text(json.dumps(meta, indent=1))


def cut_sheet(sheet, out_dir, names, kind):
    rgba = key_magenta(np.asarray(Image.open(sheet).convert("RGB")))
    H, W, _ = rgba.shape
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {}
    cells = items_by_blob(rgba, len(names[:8]))
    if cells is None:
        print(f"{sheet.parent.name}: items not cleanly separated — cutting on the fixed 4x2 grid", flush=True)
        cw, ch = W / 4, H / 2
        cells = [rgba[int((i // 4) * ch) : int((i // 4 + 1) * ch), int((i % 4) * cw) : int((i % 4 + 1) * cw)].copy() for i in range(len(names[:8]))]
    for name, cell in zip(names[:8], cells):
        # drop stray specks (bits of a neighbouring item, noise) so they don't widen the crop or shift pivots
        lab, n = ndimage.label(cell[..., 3] > 40)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            keep = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.03)[0])
            cell[..., 3] = np.where(keep, cell[..., 3], 0)
        ys, xs = np.nonzero(cell[..., 3] > 128)
        if not len(ys):
            continue
        y0, y1 = max(0, ys.min() - 4), min(cell.shape[0], ys.max() + 5)
        x0, x1 = max(0, xs.min() - 4), min(cell.shape[1], xs.max() + 5)
        part = cell[y0:y1, x0:x1]
        pm = part[..., 3] > 128
        h, w = pm.shape

        def centre(rows):
            cols = np.nonzero(pm[rows].any(axis=0))[0]
            return float((cols.min() + cols.max()) / 2) if len(cols) else w / 2

        info = {"w": int(w), "h": int(h), "top": [centre(slice(0, max(2, int(h * 0.06)))), 0.0], "bottom": [centre(slice(int(h * 0.94), h)), float(h)], "center": [w / 2, h / 2]}
        if kind == "kit" and name == "shin":
            info["bottom"] = [centre(slice(int(h * 0.62), int(h * 0.7))), float(h * 0.82)]
        if kind == "kit" and name == "torso":
            info["shoulder"] = [centre(slice(int(h * 0.08), int(h * 0.14))), float(h * 0.1)]
            info["neckSocket"] = torso_neck(pm)
        if (kind == "kit" and name == "head") or kind == "heads":
            info.update(neck_pivot(pm))
        if kind == "mount" and name == "saddle":
            info["stirrup"] = stirrup_point(pm)
            info["roof"] = roof_bottom(pm)
        if kind == "mount" and name == "body":
            info["underline"] = underline(pm)
        Image.fromarray(part).save(out_dir / f"{name}.png")
        meta[name] = info
    (out_dir / "parts.json").write_text(json.dumps(meta, indent=1))
    return meta


def part_names(kind, meta):
    if kind == "kit":
        return KIT_PARTS
    if kind == "heads":
        return [f"head{i + 1}" for i in range(8)]
    if kind == "cutout":
        return ["piece"]
    return meta.get("names", [f"prop{i + 1}" for i in range(8)])


# ---------- recolour teal faction cloth ----------
def recolor_image(path_in, path_out, colour):
    hue, sat, val = COLOURS[colour]
    im = np.asarray(Image.open(path_in).convert("RGBA")).astype(np.float32) / 255
    rgb = im[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, d / (mx + 1e-6), 0)
    # teal ≈ hue 0.5; some kits come out greener (≈0.45), so recolour fully within ±0.05 and fade out by ±0.12
    w = np.clip(1 - (np.abs(h - 0.5) - 0.05) / 0.07, 0, 1) * np.clip((s - 0.15) / 0.15, 0, 1)
    # keep the painted shading (value) and scale saturation; swap only the hue
    hh = np.full(h.shape, hue)
    ss = np.clip(s * sat / 0.6, 0, 1)
    vv = np.clip(mx * val, 0, 1)
    new = np.zeros_like(rgb)
    i = np.floor(hh * 6).astype(int) % 6
    f = hh * 6 - np.floor(hh * 6)
    p, q, t = vv * (1 - ss), vv * (1 - f * ss), vv * (1 - (1 - f) * ss)
    choices = [(vv, t, p), (q, vv, p), (p, vv, t), (p, q, vv), (t, p, vv), (vv, p, q)]
    for k, (cr, cg, cb) in enumerate(choices):
        sel = i == k
        new[..., 0] = np.where(sel, cr, new[..., 0])
        new[..., 1] = np.where(sel, cg, new[..., 1])
        new[..., 2] = np.where(sel, cb, new[..., 2])
    out = rgb * (1 - w[..., None]) + new * w[..., None]
    Image.fromarray((np.dstack([out, im[..., 3]]) * 255).astype(np.uint8)).save(path_out)


# ---------- catalog ----------
def rebuild_catalog():
    items = []
    for kind, sub in KIND_DIR.items():
        for m in sorted((LIB / sub).glob("*/meta.json")):
            items.append(json.loads(m.read_text()))
    (LIB / "catalog.json").write_text(json.dumps(items, indent=1, ensure_ascii=False))
    return items


def cmd_list(a):
    items = rebuild_catalog()
    for it in items:
        if a.kind and it["kind"] != a.kind:
            continue
        if any(getattr(a, k) and it.get(k) != getattr(a, k) for k in ("era", "region", "role")):
            continue
        if a.text and not all(w.lower() in json.dumps(it, ensure_ascii=False).lower() for w in a.text.split()):
            continue
        tags = " ".join(f"{k}={it[k]}" for k in ("era", "region", "role") if it.get(k))
        colours = ",".join(it.get("colours", []))
        print(f"{it['kind']:9} {it['id']:32} {tags:50} {colours:20} {it.get('desc', '')[:70]}")


def cmd_draw(a):
    d = asset_dir(a.kind, a.id)
    if (d / "sheet.png").exists() and not a.force:
        sys.exit(f"{a.kind}/{a.id} already exists — reuse it, or pass --force to redraw")
    d.mkdir(parents=True, exist_ok=True)
    names = a.names.split(",") if a.names else None
    body = PROMPTS[a.kind].format(desc=a.desc, names=", ".join(names or []))
    grid = GRID if a.kind in ("kit", "heads", "props", "mount") else (
        "Background: perfectly flat solid magenta #FF00FF everywhere, no shadows, no gradients, no texture on the background." if a.kind == "cutout" else "")
    prompt = f"Create ONE image, landscape 3:2. It is {body} {grid}\n\n{style()}"
    keyed = a.kind in ("kit", "heads", "props", "mount", "cutout")
    for attempt in (1, 2):
        (d / "sheet.png").unlink(missing_ok=True)
        print(f"drawing {a.kind}/{a.id} via {imagegen.backend()} (about a minute, try {attempt})…", flush=True)
        err = generate(prompt, d)
        if err:
            sys.exit(f"{imagegen.backend()} did not produce sheet.png:\n{err}")
        share = magenta_share(d / "sheet.png") if keyed else 1.0
        if share >= 0.4:
            break
        print(f"background is only {share:.0%} magenta — redrawing with a stricter background rule", flush=True)
        prompt = prompt + "\n\n" + MAGENTA_RETRY
    else:
        sys.exit(f"{a.kind}/{a.id}: background still not magenta after a retry; check {d / 'sheet.png'}")
    meta = {"kind": a.kind, "id": a.id, "era": a.era, "region": a.region, "role": a.role, "desc": a.desc, "prompt": prompt, "drawn": date.today().isoformat(), "colours": []}
    if names:
        meta["names"] = names
    if keyed:
        cut_sheet(d / "sheet.png", d / "parts", part_names(a.kind, meta), a.kind)
    else:
        Image.open(d / "sheet.png").convert("RGB").save(d / "image.jpg", quality=90)
    (d / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    rebuild_catalog()
    print(f"saved {d.relative_to(ROOT)}")


def cmd_cut(a):
    d = asset_dir(a.kind, a.id)
    meta = json.loads((d / "meta.json").read_text())
    cut_sheet(d / "sheet.png", d / "parts", part_names(a.kind, meta), a.kind)
    print("re-cut", d.relative_to(ROOT))


def cmd_recolor(a):
    for kind in ("kit", "heads", "mount", "props"):
        d = asset_dir(kind, a.id)
        if d.exists():
            break
    else:
        sys.exit(f"no kit or heads named {a.id}")
    meta = json.loads((d / "meta.json").read_text())
    for colour in a.colours:
        if colour not in COLOURS:
            sys.exit(f"unknown colour {colour}; choose from {', '.join(COLOURS)}")
        out = d / f"parts-{colour}"
        out.mkdir(exist_ok=True)
        for png in (d / "parts").glob("*.png"):
            recolor_image(png, out / png.name, colour)
        (out / "parts.json").write_text((d / "parts" / "parts.json").read_text())
        if colour not in meta["colours"]:
            meta["colours"].append(colour)
        print(f"{kind}/{a.id} → {colour}")
    (d / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    rebuild_catalog()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list")
    for k in ("kind", "era", "region", "role", "text"):
        p.add_argument(f"--{k}")
    p.set_defaults(fn=cmd_list)
    p = sub.add_parser("draw")
    p.add_argument("kind", choices=list(KIND_DIR))
    p.add_argument("id")
    p.add_argument("--desc", required=True)
    p.add_argument("--era")
    p.add_argument("--region")
    p.add_argument("--role")
    p.add_argument("--names")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_draw)
    p = sub.add_parser("cut")
    p.add_argument("kind", choices=list(KIND_DIR))
    p.add_argument("id")
    p.set_defaults(fn=cmd_cut)
    p = sub.add_parser("recolor")
    p.add_argument("id")
    p.add_argument("colours", nargs="+")
    p.set_defaults(fn=cmd_recolor)
    p = sub.add_parser("catalog")
    p.set_defaults(fn=lambda a: print(f"{len(rebuild_catalog())} assets"))
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
