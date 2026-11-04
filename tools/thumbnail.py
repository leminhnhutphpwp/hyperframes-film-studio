"""Compose YouTube thumbnails: art (from tools/thumb_art.py) + a short headline + an optional badge -> 1280x720 jpg
("vertical": true -> 1080x1920 for a Short).

Each job picks its own layout (left/right/top/bottom), font (sans/serif), size, colours and crop: the recipe is a set of
principles, not one template (see memory "thumbnails").
  python3 tools/thumbnail.py <project>/publish/thumb/thumb.json [out.jpg ...]

Paths in thumb.json (art, out) are relative to that file. Check the result at feed size (~200 px wide).
"""
import glob
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

CH = glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/chrome-headless-shell-linux64/chrome-headless-shell"))[0]
HERE = Path(".")
FONTS = {"sans": "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf", "serif": "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf"}
SHADE = {"left": "90deg", "right": "270deg", "top": "180deg", "bottom": "0deg"}


def make(j):
    side = j.get("side", "left")
    W, H = (1080, 1920) if j.get("vertical") else (1920, 1080)
    fs, c1, c2 = j.get("fs", 140), j.get("c1", "#fff"), j.get("c2", "#ffcf3a")
    vertical = side in ("top", "bottom")
    box = (f"left:0;right:0;{side}:{j.get('margin', 60)}px;align-items:center;text-align:center" if vertical else
           f"{side}:70px;top:0;bottom:0;width:{W - 140 if j.get('vertical') else 1100}px;justify-content:center;align-items:{'flex-start' if side == 'left' else 'flex-end'};text-align:{side}")
    lines = "".join(f'<div class="l" style="color:{c1 if i == 0 else c2}">{t}</div>' for i, t in enumerate(j["lines"]))
    badge = f'<div class="b">{j["badge"]}</div>' if j.get("badge") else ""
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:H;src:url(file://{FONTS[j.get('font', 'sans')]})}}
@font-face{{font-family:S;src:url(file://{FONTS['sans']})}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#000}}
.bg{{position:absolute;inset:0;background:url(file://{(HERE / j["art"]).resolve()}) {j.get('pos', '50% 40%')}/cover}}
.sh{{position:absolute;inset:0;background:linear-gradient({SHADE[side]},rgba(8,6,12,{j.get('dark', .92)}) 0%,rgba(8,6,12,{j.get('dark', .92) * .75}) 30%,rgba(8,6,12,0) {j.get('fade', 62)}%)}}
.box{{position:absolute;display:flex;flex-direction:column;{box};font-family:H}}
.b{{font-family:S;font-size:44px;letter-spacing:3px;color:#1b1206;background:#f2c14e;padding:6px 22px;border-radius:8px;margin:0 0 22px}}
.l{{white-space:{'normal' if j.get('vertical') else 'nowrap'};font-size:{fs}px;line-height:1.02;letter-spacing:{j.get('ls', -2)}px;text-transform:uppercase;-webkit-text-stroke:5px #120c06;paint-order:stroke fill;text-shadow:0 8px 0 #120c06,0 14px 30px rgba(0,0,0,.8)}}
</style></head><body><div class="bg"></div><div class="sh"></div><div class="box">{badge}{lines}</div></body></html>"""
    tmp, png = Path(tempfile.gettempdir()) / "thumb.html", Path(tempfile.gettempdir()) / "thumb.png"
    tmp.write_text(html)
    subprocess.run([CH, "--headless", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", f"--window-size={W},{H}",
                    f"--screenshot={png}", "--virtual-time-budget=3000", f"file://{tmp}"], capture_output=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-vf", "scale=1080:1920" if j.get("vertical") else "scale=1280:720", "-q:v", "2", str(HERE / j["out"])], check=True)


if __name__ == "__main__":
    spec = Path(sys.argv[1]).resolve()
    HERE = spec.parent
    only = sys.argv[2:]
    for j in json.loads(spec.read_text()):
        if not only or j["out"] in only:
            make(j)
            print(j["out"])
