"""Contact sheets to compare films side by side: one row per film, frames taken at the same relative points.

  .venv/bin/python -I tools/filmsheet.py <out.jpg> <film.mp4> [<film.mp4> ...] [--n 12] [--w 320]

Use it before rendering a new film's final cut: put its sheet next to the last two films. If the rows look like the same
film (same backdrops, same walking puppets, same caption boxes, same map flight), change the new one.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

FF = imageio_ffmpeg.get_ffmpeg_exe()
ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("films", nargs="+")
ap.add_argument("--n", type=int, default=12)
ap.add_argument("--w", type=int, default=320)
a = ap.parse_args()
h = a.w * 9 // 16
sheet = Image.new("RGB", (a.w * a.n, (h + 28) * len(a.films)), "#111")
draw = ImageDraw.Draw(sheet)
with tempfile.TemporaryDirectory() as tmp:
    for r, film in enumerate(a.films):
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", film],
                                   capture_output=True, text=True).stdout)
        draw.text((6, r * (h + 28) + 6), f"{Path(film).name}  {int(dur // 60)}:{int(dur % 60):02d}", fill="#ddd")
        for i in range(a.n):
            t = dur * (i + 0.5) / a.n
            p = Path(tmp) / f"{r}_{i}.png"
            subprocess.run([FF, "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", film, "-frames:v", "1", "-vf", f"scale={a.w}:{h}", str(p)])
            if p.exists():
                sheet.paste(Image.open(p), (i * a.w, r * (h + 28) + 28))
sheet.save(a.out, quality=88)
print(a.out)
