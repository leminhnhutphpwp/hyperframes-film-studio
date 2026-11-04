"""Parchment maps from real coastlines (world-atlas TopoJSON, Natural Earth, public domain).

  map_render.py <spec.json> <out_dir>

spec.json:
  {"land": "assets/map/land-50m.json", "lon": [-11, 26], "lat": [30.3, 47.8], "width": 5760,
   "mountains": [[lon, lat], ...],                      # small hand-drawn peaks
   "layers": {"rome-264": {"colour": "#b5332a", "areas": [AREA, ...], "minus": [AREA, ...]}, ...}}
  ("layer_scale": 0.5 saves the layers at half size — they are soft tints, and full-size RGBA layers eat GPU memory)
  (a layer may add "fade": degrees — the tint thins out that far inland, for coastal powers; "opacity" sets its strength)
  AREA = {"poly": [[lon, lat], ...]}  — that polygon, clipped to land
       | {"island": [lon, lat]}       — the whole land mass containing that point (Sicily, Sardinia ...)

Writes <out_dir>/base.jpg (sea, land, coast, mountains, paper grain), one transparent <layer>.png per layer
(soft-edged tint clipped to land) and projection.json so the composition can place labels and routes:
  x = (lon - lon0) * cos(lat_mid) * k,   y = (lat1 - lat) * k
Run with the project venv:  .venv/bin/python -I tools/map_render.py ...
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SEA, SEA_DEEP, LAND, COAST = (184, 199, 186), (160, 180, 172), (230, 214, 172), (92, 70, 46)


def decode_topojson(path):
    topo = json.loads(Path(path).read_text())
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out

    polys = []
    for obj in topo["objects"].values():
        geoms = obj["geometries"] if obj["type"] == "GeometryCollection" else [obj]
        for g in geoms:
            if g["type"] == "Polygon":
                polys.append([ring(r) for r in g["arcs"]])
            elif g["type"] == "MultiPolygon":
                polys.extend([[ring(r) for r in p] for p in g["arcs"]])
    return polys


def main():
    spec_path, out = Path(sys.argv[1]), Path(sys.argv[2])
    spec = json.loads(spec_path.read_text())
    out.mkdir(parents=True, exist_ok=True)
    lon0, lon1 = spec["lon"]
    lat0, lat1 = spec["lat"]
    c = math.cos(math.radians((lat0 + lat1) / 2))
    W = spec.get("width", 5760)
    k = W / ((lon1 - lon0) * c)
    H = int(round((lat1 - lat0) * k))
    proj = lambda lon, lat: ((lon - lon0) * c * k, (lat1 - lat) * k)

    # land mask (holes = lakes drawn as sea)
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    for poly in decode_topojson(spec_path.parent / spec["land"]):
        xs = [p[0] for p in poly[0]]
        ys = [p[1] for p in poly[0]]
        if max(xs) < lon0 - 5 or min(xs) > lon1 + 5 or max(ys) < lat0 - 5 or min(ys) > lat1 + 5:
            continue
        for i, r in enumerate(poly):
            d.polygon([proj(*p) for p in r], fill=0 if i else 255)
    land = np.asarray(mask) > 127

    rng = np.random.default_rng(7)
    grain = ndimage.gaussian_filter(rng.normal(0, 1, (H // 4, W // 4)), 1.2)
    grain = np.asarray(Image.fromarray(((grain - grain.min()) / np.ptp(grain) * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)) / 255.0
    dist_sea = ndimage.distance_transform_edt(~land)
    img = np.zeros((H, W, 3))
    deep = np.clip(dist_sea / (0.9 * k), 0, 1)[..., None]
    img[:] = np.array(SEA) * (1 - deep) + np.array(SEA_DEEP) * deep
    img[land] = LAND
    # ripple lines offshore and a darker shore band inland, like an engraved chart
    for r, a in ((0.06, 0.35), (0.13, 0.22), (0.22, 0.12)):
        band = np.abs(dist_sea - r * k) < 1.6
        img[band & ~land] = img[band & ~land] * (1 - a) + np.array(COAST) * a
    dist_land = ndimage.distance_transform_edt(land)
    shore = np.clip(1 - dist_land / (0.12 * k), 0, 1)[..., None] * land[..., None]
    img = img * (1 - 0.18 * shore) + np.array((168, 140, 96)) * 0.18 * shore
    coast = land & (ndimage.binary_dilation(~land, iterations=2))
    img[coast] = COAST
    img *= (0.9 + 0.2 * grain)[..., None]
    yy, xx = np.mgrid[0:H, 0:W]
    vig = 1 - 0.28 * (((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2.2)
    img *= vig[..., None]
    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(base)
    s = 0.3 * k  # mountain glyph size
    for lon, lat in spec.get("mountains", []):
        x, y = proj(lon, lat)
        d.polygon([(x - s * 0.6, y + s * 0.35), (x, y - s * 0.45), (x + s * 0.6, y + s * 0.35)], fill=(206, 186, 146))
        d.line([(x - s * 0.6, y + s * 0.35), (x, y - s * 0.45), (x + s * 0.6, y + s * 0.35)], fill=COAST, width=max(2, int(s * 0.07)))
        d.line([(x, y - s * 0.45), (x + s * 0.18, y + s * 0.35)], fill=(150, 120, 84), width=max(1, int(s * 0.05)))
    base.save(out / "base.jpg", quality=90)

    # territory layers
    lab, _ = ndimage.label(land)

    def area_mask(a):
        m = Image.new("L", (W, H), 0)
        if "poly" in a:
            ImageDraw.Draw(m).polygon([proj(*p) for p in a["poly"]], fill=255)
            return (np.asarray(m) > 127) & land
        x, y = proj(*a["island"])
        i = lab[int(y), int(x)]
        if not i:
            sys.exit(f"island point {a['island']} is in the sea")
        return lab == i

    for name, L in spec.get("layers", {}).items():
        m = np.zeros((H, W), bool)
        for a in L["areas"]:
            m |= area_mask(a)
        for a in L.get("minus", []):
            m &= ~area_mask(a)
        soft = ndimage.gaussian_filter(m.astype(float), 0.05 * k) * land
        if L.get("fade"):
            # coastal powers: the tint thins out inland over "fade" degrees
            soft *= np.clip(1.15 - dist_land / (L["fade"] * k), 0, 1)
        rgb = tuple(int(L["colour"][i : i + 2], 16) for i in (1, 3, 5))
        alpha = np.clip(soft * L.get("opacity", 0.55), 0, 1)
        edge = m & ndimage.binary_dilation(~m, iterations=3) & land & (soft > 0.35)
        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., :3] = rgb
        rgba[..., 3] = (alpha * 255).astype(np.uint8)
        rgba[edge, 3] = 210
        im = Image.fromarray(rgba)
        if spec.get("layer_scale", 1) != 1:  # tints are soft: half resolution saves a lot of GPU memory
            im = im.resize((int(W * spec["layer_scale"]), int(H * spec["layer_scale"])), Image.LANCZOS)
        im.save(out / f"{name}.png", optimize=True)
        print("layer", name)
    (out / "projection.json").write_text(json.dumps({"lon": [lon0, lon1], "lat": [lat0, lat1], "cos": c, "k": k, "width": W, "height": H, "layers": list(spec.get("layers", {}))}, indent=1))
    print(f"map {W}x{H}, {k:.1f} px per degree latitude")


if __name__ == "__main__":
    main()
