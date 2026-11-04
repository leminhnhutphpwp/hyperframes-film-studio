"""List the puppets each chapter of a project creates (from the built pages, English build): kit, head set, head.

  .venv/bin/python -I tools/cast_list.py projects/my-channel/my-film/part-1 [--lang en]  → <project>/cast.json
"""
import functools
import glob
import http.server
import json
import os
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

proj = Path(sys.argv[1]).resolve()
lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "en"
ROOT = Path(__file__).resolve().parent.parent
chs = sorted(proj.glob("ch[0-9]*"))
for c in chs:
    subprocess.run([str(ROOT / ".venv/bin/python"), "-I", str(proj / "shared/chapter_build.py"), str(c), f"--lang={lang}"], check=True, capture_output=True)


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(proj)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
exe = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell")))
out = {}
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=exe[-1], args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = br.new_page(viewport={"width": 1920, "height": 1080})
    for c in chs:
        pg.goto(f"http://127.0.0.1:{srv.server_port}/{c.name}/index.html", wait_until="domcontentloaded", timeout=180000)
        pg.wait_for_timeout(6000)  # module scripts load and build the stages (a chapter may have no puppets)
        # play the chapter through (every 0.25 s) and note which poses each puppet takes
        poses = pg.evaluate("""async () => {
          window.__poses = {};
          const dur = Number(document.getElementById('root').dataset.duration);
          for (let t = 0; t < dur; t += 0.25) window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t } }));
          return window.__poses;
        }""")
        for kit, heads, head, size, opts in pg.evaluate("window.__people || []"):
            key = f"{kit}|{heads or ''}|{head or ''}"
            e = out.setdefault(key, {"kit": kit, "heads": heads, "head": head, "chapters": [], "poses": []})
            if c.name not in e["chapters"]:
                e["chapters"].append(c.name)
            e["opts"] = opts
            for k in poses.get(key, {}):
                if k not in e["poses"]:
                    e["poses"].append(k)
    br.close()
srv.shutdown()
(proj / "cast.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out), "puppets")
for k, v in out.items():
    print(f"  {k}  {','.join(v['chapters'])}  {' '.join(sorted(v['poses']))}")
