"""Fast puppet rig check: draw figures × poses (stand, walk, arms up, point, sit, kneel, bow, look up, fallen) on one
canvas and screenshot it — seconds, no HyperFrames render. Joint markers with --marks (red neck, blue shoulder/hip,
green elbow/knee).

  .venv/bin/python -I tools/rigtest.py <out.png> [kit[:heads[:headN]] ...] [--marks] [--all]

Figures default to a spread of library kits (each with its own head); --all checks every kit, five per sheet
(out-1.png, out-2.png, …). Uses templates/film/shared (the engine new films are built on) and library/ as it is.
"""
import argparse
import functools
import glob
import http.server
import json
import os
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "templates/film/rigtest"
DEFAULT = ["la-ma-cuoi-cong-hoa-tuong:chinh-khach-la-ma:head1", "nguyen-lao:chinh-khach-la-ma:head4", "cong-dan-la-ma:nguoi-la-ma-cong-hoa:head2",
           "la-ma-cuoi-cong-hoa-le-duong", "thay-boi-la-ma"]
PER_SHEET = 5


def entry(kind, aid, colour=None):
    import sys

    sys.path.insert(0, str(ROOT / "tools"))
    from battle import variant

    d = ROOT / "library" / kind / aid
    meta = json.loads((d / "meta.json").read_text())
    pd = variant(d, colour) if kind in ("kits", "heads") else d / "parts"
    e = {"dir": "/" + str(pd.relative_to(ROOT)), "parts": json.loads((pd / "parts.json").read_text())}
    if kind == "kits":
        import sys

        sys.path.insert(0, str(ROOT / "tools"))
        from battle import weapon_class

        e.update(weapon=weapon_class(meta), role=meta.get("role"))
    return e


COLOUR = {"kit": None, "head": None}


def sheet(specs, marks, poses, mount="ngua-co-dai"):
    lib, figs = {}, []
    me = entry("mounts", mount)
    me["type"] = "elephant" if "elephant" in json.loads((ROOT / "library/mounts" / mount / "meta.json").read_text())["desc"].lower() else "horse"
    lib[f"{mount}@base"] = me
    for s in specs:
        kit, heads, head = (s.split(":") + [None, None])[:3]
        lib[f"{kit}@base"] = entry("kits", kit, COLOUR["kit"])
        if heads:
            lib[f"{heads}@base"] = entry("heads", heads, COLOUR["head"])
        figs.append({"kit": f"{kit}@base", "heads": f"{heads}@base" if heads else None, "head": head or "head1", "label": s})
    (PAGE / "lib.js").write_text(f"window.LIB = {json.dumps(lib)};\nwindow.RIG = {json.dumps({'figures': figs, 'marks': marks, 'poses': poses or None, 'mount': f'{mount}@base'})};\n")


def mount_sheet(mounts, rider, marks, poses=None):
    lib = {}
    for m in mounts:
        e = entry("mounts", m)
        e["type"] = "elephant" if "elephant" in json.loads((ROOT / "library/mounts" / m / "meta.json").read_text())["desc"].lower() else "horse"
        lib[f"{m}@base"] = e
    kit, heads, head = (rider.split(":") + [None, None])[:3]
    lib[f"{kit}@base"] = entry("kits", kit)
    if heads:
        lib[f"{heads}@base"] = entry("heads", heads)
    r = {"kit": f"{kit}@base", "heads": f"{heads}@base" if heads else None, "head": head or "head1"}
    (PAGE / "lib.js").write_text(f"window.LIB = {json.dumps(lib)};\nwindow.RIG = {json.dumps({'mounts': [f'{m}@base' for m in mounts], 'rider': r, 'marks': marks, 'poses': poses or None})};\n")


def anim_sheet(anims, rider, video=False):
    lib = {}
    for m in anims:
        e = {"dir": f"/library/anims/{m}/frames", "frames": json.loads((ROOT / "library/anims" / m / "frames/frames.json").read_text())}
        sp = ROOT / "library/mounts" / m / "parts/parts.json"
        if sp.exists():
            e["saddle"] = {"dir": f"/library/mounts/{m}/parts", "part": json.loads(sp.read_text())["saddle"]}
        lib[f"{m}@anim"] = e
    kit, heads, head = (rider.split(":") + [None, None])[:3]
    lib[f"{kit}@base"] = entry("kits", kit)
    if heads:
        lib[f"{heads}@base"] = entry("heads", heads)
    r = {"kit": f"{kit}@base", "heads": f"{heads}@base" if heads else None, "head": head or "head1"}
    (PAGE / "lib.js").write_text(f"window.LIB = {json.dumps(lib)};\nwindow.RIG = {json.dumps({('animVideo' if video else 'anims'): [f'{m}@anim' for m in anims], 'rider': r})};\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("figures", nargs="*")
    ap.add_argument("--marks", action="store_true")
    ap.add_argument("--colour", default=None, help="faction colour of the kits (red, purple, wool, …)")
    ap.add_argument("--headcolour", default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--mounts", nargs="?", const="all", default="", help="animals instead of people: all, or ids comma-separated")
    ap.add_argument("--anims", nargs="?", const="all", default="", help="drawn animals (library/anims): all, or ids comma-separated")
    ap.add_argument("--video", type=float, default=0, help="with --anims: seconds of a motion check video (out.mp4)")
    ap.add_argument("--rider", default="la-ma-cuoi-cong-hoa-tuong:chinh-khach-la-ma:head1")
    ap.add_argument("--per", type=int, default=PER_SHEET, help="figures per sheet (fewer = bigger)")
    ap.add_argument("--poses", default="", help="only these poses, comma-separated (e.g. đứng,ngồi,quỳ) — bigger cells")
    a = ap.parse_args()
    COLOUR["kit"], COLOUR["head"] = a.colour, a.headcolour
    specs = sorted(p.parent.parent.name for p in (ROOT / "library/kits").glob("*/parts/parts.json")) if a.all else (a.figures or DEFAULT)
    if a.anims:
        specs = sorted(p.parent.parent.name for p in (ROOT / "library/anims").glob("*/frames/frames.json")) if a.anims == "all" else a.anims.split(",")
        a.per = min(a.per, 2)
    if a.mounts:
        specs = sorted(p.parent.parent.name for p in (ROOT / "library/mounts").glob("*/parts/parts.json")) if a.mounts == "all" else a.mounts.split(",")
        a.per = min(a.per, 4)
    groups = [specs[i : i + a.per] for i in range(0, len(specs), a.per)]

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell")))
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=exe[-1] if exe else None, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = br.new_page(viewport={"width": 1920, "height": 1080})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        for i, g in enumerate(groups):
            if a.anims and a.video:
                anim_sheet(specs, a.rider, video=True)
                pg.goto(f"http://127.0.0.1:{srv.server_port}/templates/film/rigtest/index.html")
                pg.wait_for_function("window.__ready === true", timeout=120000)
                import subprocess
                import imageio_ffmpeg

                out = a.out.replace(".png", "") + ".mp4"
                ff = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-y", "-f", "image2pipe", "-framerate", "24", "-i", "-", "-pix_fmt", "yuv420p", "-crf", "20", out], stdin=subprocess.PIPE)
                for i in range(int(a.video * 24)):
                    pg.evaluate(f"window.renderAt({i / 24})")
                    ff.stdin.write(pg.screenshot(type="jpeg", quality=88))
                ff.stdin.close()
                ff.wait()
                print(out)
                break
            if a.anims:
                anim_sheet(g, a.rider)
            elif a.mounts:
                mount_sheet(g, a.rider, a.marks, [x for x in a.poses.split(',') if x])
            else:
                sheet(g, a.marks, [x for x in a.poses.split(',') if x])
            pg.goto(f"http://127.0.0.1:{srv.server_port}/templates/film/rigtest/index.html")
            pg.wait_for_function("window.__ready === true", timeout=120000)
            out = a.out if len(groups) == 1 else a.out.replace(".png", f"-{i + 1}.png")
            pg.screenshot(path=out)
            print(out)
        br.close()
    srv.shutdown()
    for e in errs:
        print("PAGE ERROR", e)


if __name__ == "__main__":
    main()
