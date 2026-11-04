"""Battle projects built from the asset library.

  battle.py new <name>          create samples/<name> from templates/battle with a starter battle.json
  battle.py build <project_dir> read battle.json, recolour what is missing, copy the needed library
                                assets into <project>/assets/lib, write assets/lib/library.js + battle.js

Run with the project venv:  .venv/bin/python -I tools/battle.py ...
"""
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset import COLOURS, LIB, ROOT, recolor_image  # noqa: E402

TEMPLATE = ROOT / "templates" / "battle"


def weapon_class(meta):
    text = (meta.get("desc") or "").lower()
    if meta.get("role") == "archer":
        return "crossbow" if "crossbow" in text else "bow"
    if re.search(r"\bmusket\b", text):  # flintlock / matchlock: held like a pike, fires volleys (battle.json "fire")
        return "musket"
    if re.search(r"spear|glaive|polearm|pike|halberd|lance", text):
        return "polearm"
    if re.search(r"\bcrossbow\b", text):  # mounted or foot shooters whose role isn't cung-thu
        return "crossbow"
    if re.search(r"\bbow\b", text):
        return "bow"
    return "blade"


def variant(src_dir, colour):
    """Return the parts folder for a colour, recolouring teal on demand."""
    if colour in (None, "teal", "base"):
        return src_dir / "parts"
    out = src_dir / f"parts-{colour}"
    if not out.exists():
        if colour not in COLOURS:
            sys.exit(f"unknown colour {colour}; choose from {', '.join(COLOURS)}")
        out.mkdir()
        for png in (src_dir / "parts").glob("*.png"):
            recolor_image(png, out / png.name, colour)
        shutil.copy(src_dir / "parts" / "parts.json", out / "parts.json")
        print(f"recoloured {src_dir.name} → {colour}")
    return out


def need(kind_dir, aid):
    d = LIB / kind_dir / aid
    if not (d / "meta.json").exists():
        sys.exit(f"library has no {kind_dir}/{aid}: draw it with tools/asset.py (see templates/battle/README.md), or use an id from `tools/asset.py list`")
    return d


def build(project):
    project = Path(project).resolve()
    cfg = json.loads((project / "battle.json").read_text())
    out = project / "assets" / "lib"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    lib = {"kits": {}, "heads": {}, "props": {}, "mounts": {}, "terrain": None}

    def copy_parts(src, dest_rel):
        dest = out / dest_rel
        shutil.copytree(src, dest)
        return f"assets/lib/{dest_rel}", json.loads((src / "parts.json").read_text())

    for side in cfg["sides"]:
        colour = side.get("colour")
        cavalry = side.get("cavalry", [])
        kits = set(side["ranks"]) | ({side["commander"]} if side.get("commander") else set()) | {c["rider"] for c in cavalry}
        for kid in sorted(kits):
            key = f"{kid}@{colour}"
            if key in lib["kits"]:
                continue
            d = need("kits", kid)
            meta = json.loads((d / "meta.json").read_text())
            path, parts = copy_parts(variant(d, colour), f"kits/{kid}/{colour}")
            lib["kits"][key] = {"dir": path, "parts": parts, "weapon": weapon_class(meta), "role": meta.get("role")}
        for mid in sorted({c["mount"] for c in cavalry}):
            key = f"{mid}@{colour}"
            if key not in lib["mounts"]:
                d = need("mounts", mid)
                meta = json.loads((d / "meta.json").read_text())
                path, parts = copy_parts(variant(d, colour), f"mounts/{mid}/{colour}")
                lib["mounts"][key] = {"dir": path, "parts": parts, "type": "elephant" if "elephant" in meta["desc"].lower() else "horse"}
        if side.get("heads"):
            key = f"{side['heads']}@{colour}"
            if key not in lib["heads"]:
                d = need("heads", side["heads"])
                path, parts = copy_parts(variant(d, colour), f"heads/{side['heads']}/{colour}")
                lib["heads"][key] = {"dir": path, "parts": parts}
        props = cfg.get("props", "battle-props")
        key = f"{props}@{colour}"
        if key not in lib["props"]:
            d = need("props", props)
            path, parts = copy_parts(variant(d, colour), f"props/{props}/{colour}")
            lib["props"][key] = {"dir": path, "parts": parts}

    t = need("terrains", cfg["terrain"])
    shutil.copy(t / "image.jpg", out / "terrain.jpg")
    lib["terrain"] = "assets/lib/terrain.jpg"

    (out / "library.js").write_text("window.LIB = " + json.dumps(lib, separators=(",", ":")) + ";\n")
    html = project / "index.html"
    html.write_text(re.sub(r'(id="root"[^>]*data-duration=")[0-9.]+"', lambda m: f'{m.group(1)}{cfg.get("duration", 10)}"', html.read_text()))
    (project / "battle.js").write_text("window.BATTLE = " + json.dumps(cfg, ensure_ascii=False, indent=1) + ";\n")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) / 1e6
    print(f"built {project.relative_to(ROOT)}: {len(lib['kits'])} kits, {len(lib['mounts'])} mounts, {len(lib['heads'])} head sets, terrain {cfg['terrain']} ({size:.1f} MB)")


def new(name):
    dest = ROOT / "samples" / name
    if dest.exists():
        sys.exit(f"{dest.relative_to(ROOT)} already exists")
    shutil.copytree(TEMPLATE, dest)
    pkg = dest / "package.json"
    pkg.write_text(pkg.read_text().replace('"battle-template"', f'"{name}"'))
    print(f"created {dest.relative_to(ROOT)} — edit battle.json, then: tools/battle.py build {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("new", "build"):
        sys.exit(__doc__)
    (new if sys.argv[1] == "new" else build)(sys.argv[2])
