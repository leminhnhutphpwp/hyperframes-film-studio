"""Check a built chapter for framing slips before rendering: puppets cut by the frame edge, the map's edge in view, props
drawn at a silly size.

  .venv/bin/python -I tools/framecheck.py <chapter_dir> [<chapter_dir> ...] [--step 0.5]

Needs the chapter's shared/ code to expose its frames (window.__frame from main.js, root.userData.figure from makeFigure,
mesh.userData.prop from prop(), map scene.userData.mapSize) — the Caesar part 3 shared code and later copies do.
Seeks through the chapter every --step seconds and prints time ranges:
  CUT    a puppet stands half outside the left or right edge (15–85 % of it visible) — usually a position to pull in
  MAP    a frame corner looks past the edge of the map (the dark table shows) — move the map camera in or over
  BIG    a prop taller or wider than 1.6 m on screen-space terms (e.g. a dagger sized by the wrong side)
Puppets walking in or out are flagged too; ignore ranges that match an entrance or exit.
"""
import argparse
import functools
import glob
import http.server
import os
import re
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

PROBE = r"""
() => {
  const r = window.__frame;
  if (!r || !r.scene || !r.camera) return null;
  const THREE = window.__THREE;
  const out = { cut: [], map: false, big: [] };
  const cam = r.camera;
  cam.updateMatrixWorld();
  const W = 1920, H = 1080;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  r.scene.updateMatrixWorld(true);
  r.scene.traverse((o) => {
    if (o.userData.figure && visible(o)) {
      box.setFromObject(o);
      if (box.isEmpty()) return;
      let x0 = 1e9, x1 = -1e9;
      for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
        v.set(cx, cy, cz).project(cam);
        const sx = ((v.x + 1) / 2) * W;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
      }
      const w = x1 - x0, inside = Math.max(0, Math.min(x1, W) - Math.max(x0, 0));
      const f = w > 0 ? inside / w : 1;
      if (f > 0.15 && f < 0.85) out.cut.push(o.userData.figure);
    }
    if (o.userData.prop && visible(o)) {
      box.setFromObject(o);
      const s = box.getSize(v);
      if (Math.max(s.x, s.y) > 1.6) out.big.push(o.userData.prop + " " + Math.max(s.x, s.y).toFixed(1) + "m");
    }
  });
  const ms = r.scene.userData.mapSize;
  if (ms) {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ray.setFromCamera(new THREE.Vector2(nx, ny), cam);
      const hit = ray.ray.intersectPlane(plane, v);
      if (!hit || Math.abs(hit.x) > ms[0] / 2 || Math.abs(hit.z) > ms[1] / 2) { out.map = true; break; }
    }
  }
  return out;
}
"""


def chrome():
    hits = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell")))
    return hits[-1] if hits else None


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def ranges(times, step):
    out = []
    for t in times:
        if out and t - out[-1][1] <= step * 1.01:
            out[-1][1] = t
        else:
            out.append([t, t])
    return out


def check(chdir, step, browser):
    chdir = Path(chdir).resolve()
    dur = float(re.search(r'id="root"[^>]*data-duration="([\d.]+)"', (chdir / "index.html").read_text()).group(1))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(chdir)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.goto(f"http://127.0.0.1:{srv.server_port}/index.html")
    page.wait_for_timeout(2500)
    # main.js imports THREE as a module; reach it through the engine module for the probe
    page.evaluate("async () => { window.__THREE = (await import('./shared/js/engine.js')).THREE; }")
    found = {"CUT": {}, "MAP": {"": []}, "BIG": {}}
    t = 0.0
    while t < dur:
        page.evaluate(f"window.dispatchEvent(new CustomEvent('hf-seek', {{ detail: {{ time: {t} }} }}))")
        r = page.evaluate(PROBE)
        if r:
            for k in r["cut"]:
                found["CUT"].setdefault(k, []).append(t)
            if r["map"]:
                found["MAP"][""].append(t)
            for k in r["big"]:
                found["BIG"].setdefault(k, []).append(t)
        t = round(t + step, 3)
    page.close()
    srv.shutdown()
    lines = []
    for kind, d in found.items():
        for what, ts in d.items():
            for a, b in ranges(ts, step):
                if b - a >= step:  # ignore one-off frames
                    lines.append(f"  {kind:3} {a:6.1f}–{b:6.1f}s  {what}")
    print(f"{chdir.name}: {'ok' if not lines else str(len(lines)) + ' issue(s)'}")
    print("\n".join(sorted(lines, key=lambda l: float(l.split()[1].split('–')[0]))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chapters", nargs="+")
    ap.add_argument("--step", type=float, default=0.5)
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome(), args=["--use-gl=angle", "--enable-gpu"])
        for c in a.chapters:
            check(c, a.step, b)
        b.close()


if __name__ == "__main__":
    main()
