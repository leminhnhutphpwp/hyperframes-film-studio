"""List every piece of on-screen text a film shows, so it can be translated for another language version.

  .venv/bin/python -I tools/collect_strings.py <project_dir> --lang en [--step 0.25]

Builds nothing itself: run it after shared/chapter_build.py has built the chapters (Vietnamese build). Seeks through
every chapter in headless Chrome; overlay.js's tr() records each text in window.__trSeen. Adds the chapter.json title
lines, then merges into <project>/strings.<lang>.json: texts already translated keep their translation, new ones get
an empty string, texts no longer shown are dropped. Prints how many still need a translation.
"""
import argparse
import functools
import glob
import http.server
import json
import os
import re
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--lang", default="en")
    ap.add_argument("--step", type=float, default=0.25)
    a = ap.parse_args()
    proj = Path(a.project).resolve()
    seen = set()
    exe = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell")))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe[-1] if exe else None, args=["--use-gl=angle", "--enable-gpu"])
        for ch in sorted(proj.glob("ch[0-9]*")):
            cfg = json.loads((ch / "chapter.json").read_text())
            seen.update(x for x in (cfg.get("title") or []) if x)
            dur = float(re.search(r'id="root"[^>]*data-duration="([\d.]+)"', (ch / "index.html").read_text()).group(1))
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ch)))
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            page = b.new_page(viewport={"width": 1920, "height": 1080})
            page.goto(f"http://127.0.0.1:{srv.server_port}/index.html")
            page.wait_for_timeout(2000)
            t = 0.0
            while t < dur:
                page.evaluate(f"window.dispatchEvent(new CustomEvent('hf-seek', {{ detail: {{ time: {t} }} }}))")
                t = round(t + a.step, 3)
            seen.update(page.evaluate("Array.from(window.__trSeen || [])"))
            page.close()
            srv.shutdown()
            print(f"{ch.name}: {len(seen)} texts so far")
        b.close()
    out = proj / f"strings.{a.lang}.json"
    old = json.loads(out.read_text()) if out.exists() else {}
    merged = {s: old.get(s, "") for s in sorted(seen)}
    out.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + "\n")
    todo = sum(1 for v in merged.values() if not v)
    print(f"{out}: {len(merged)} texts, {todo} without a translation")


if __name__ == "__main__":
    main()
