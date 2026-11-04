"""Render stills (and optionally a quick MP4) of a HyperFrames battle without the HyperFrames CLI.

  frames.py <project_dir> <out_dir> [--times 0,2.5,5] [--video FPS] [--scale 0.5]

Serves the project over HTTP, opens it in headless Chrome (HyperFrames' cached chrome-headless-shell, or Playwright's),
seeks with the `hf-seek` event the composition listens to, and screenshots. Timed <video> clips are shown only inside
their window and seeked to the matching source time (HyperFrames' job in a real render). --video writes
<out_dir>/preview.mp4 with imageio-ffmpeg and mixes every timed <audio> (data-start / data-duration / data-media-start,
volume automation as a piecewise-linear envelope). Run with the project venv:  .venv/bin/python -I tools/frames.py ...
"""
import argparse
import functools
import glob
import http.server
import os
import shutil
import subprocess
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright


def chrome():
    hits = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell")))
    return hits[-1] if hits else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("out")
    ap.add_argument("--times", default="0,2,4,6,8")
    ap.add_argument("--video", type=float, default=0)
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--gpu", action="store_true", help="use the hardware GPU instead of SwiftShader (faster)")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        """Static files with HTTP Range support, which the browser needs to seek <video>."""

        def log_message(self, *args):
            pass

        def send_head(self):
            rng = self.headers.get("Range")
            path = self.translate_path(self.path)
            if not rng or not os.path.isfile(path):
                return super().send_head()
            size = os.path.getsize(path)
            a, _, b = rng.replace("bytes=", "").partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = min(int(b), size - 1) if a and b else size - 1
            f = open(path, "rb")
            f.seek(start)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(path))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.end_headers()
            self._remaining = end - start + 1
            return f

        def copyfile(self, source, outputfile):
            left = getattr(self, "_remaining", None)
            try:
                if left is None:
                    return super().copyfile(source, outputfile)
                while left > 0:
                    buf = source.read(min(65536, left))
                    if not buf:
                        break
                    outputfile.write(buf)
                    left -= len(buf)
            except (ConnectionResetError, BrokenPipeError):
                pass

    handler = functools.partial(Quiet, directory=a.project)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        gl = ["--enable-gpu", "--use-angle=gl", "--ignore-gpu-blocklist"] if a.gpu else ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        b = p.chromium.launch(executable_path=chrome(), args=gl)
        pg = b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=a.scale)
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.goto(f"http://127.0.0.1:{srv.server_port}/index.html")
        pg.wait_for_timeout(2500)
        dur = pg.evaluate("+document.querySelector('[data-composition-id]').dataset.duration || (window.BATTLE && window.BATTLE.duration) || 10")
        times = [i / a.video for i in range(int(dur * a.video))] if a.video else [float(x) for x in a.times.split(",")]
        audios = pg.evaluate("""() => [...document.querySelectorAll('audio[id][src][data-start]')].map(a => ({
            src: a.getAttribute('src'), start: +a.dataset.start, dur: +a.dataset.duration || 0, media: +a.dataset.mediaStart || 0,
            vol: a.dataset.volume ? +a.dataset.volume : 1,
            pts: a.dataset.automation ? (JSON.parse(a.dataset.automation).lanes.find(l => l.target === 'volume') || {points: []}).points : []}))""")
        for i, t in enumerate(times):
            pg.evaluate("""async (t) => {
              await Promise.all([...document.querySelectorAll('video[data-start]')].map(v => {
                const s = +v.dataset.start, d = +v.dataset.duration || 1e9, on = t >= s && t < s + d;
                v.style.visibility = on ? 'visible' : 'hidden';
                if (!on) return null;
                const want = t - s + (+v.dataset.mediaStart || 0);
                return (async () => {
                  if (v.readyState < 2) { v.preload = 'auto'; v.load(); await new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 15000); }); }
                  await new Promise((r) => { v.addEventListener('seeked', () => r(), { once: true }); setTimeout(r, 10000); v.currentTime = want; });
                })();
              }));
            }""", t)
            pg.evaluate(f"window.dispatchEvent(new CustomEvent('hf-seek', {{detail: {{time: {t}}}}}))")
            name = f"f{i:04d}.jpg" if a.video else f"t{t:05.2f}.jpg"
            pg.screenshot(path=str(out / name), type="jpeg", quality=85)
        b.close()
    srv.shutdown()
    for e in errors[:10]:
        print("page error:", e)
    if a.video:
        import imageio_ffmpeg
        cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-framerate", str(a.video), "-i", str(out / "f%04d.jpg")]
        chains, labels = [], []
        for j, au in enumerate(audios):
            cmd += ["-ss", f"{au['media']:.3f}"] + (["-t", f"{au['dur']:.3f}"] if au["dur"] else []) + ["-i", str(Path(a.project) / au["src"])]
            pts = au["pts"] or [{"t": 0, "v": 1}]
            expr = f"{pts[-1]['v'] * au['vol']}"
            for p0, p1 in reversed(list(zip(pts, pts[1:]))):
                v0, v1 = p0["v"] * au["vol"], p1["v"] * au["vol"]
                seg_ = f"{v0}+({v1}-{v0})*(t-{p0['t']})/{max(1e-6, p1['t'] - p0['t'])}"
                expr = f"if(lt(t,{p1['t']}),{seg_},{expr})"
            ms = int(au["start"] * 1000)
            chains.append(f"[{j + 1}:a]aresample=48000,volume='{expr}':eval=frame,adelay={ms}|{ms}[a{j}]")
            labels.append(f"[a{j}]")
        if audios:
            fc = ";".join(chains) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest[mix]"
            cmd += ["-filter_complex", fc, "-map", "0:v", "-map", "[mix]", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", f"{len(times) / a.video:.3f}"]
        cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(out / "preview.mp4")]
        subprocess.run(cmd, check=True)
        for f in out.glob("f*.jpg"):
            f.unlink()
        print("wrote", out / "preview.mp4")
    else:
        print("wrote", len(times), "stills to", out)


if __name__ == "__main__":
    main()
