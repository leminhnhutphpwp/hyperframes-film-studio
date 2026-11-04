"""One image backend for every drawing tool.

  IMAGE_BACKEND   codex | api. When unset: api if an API key is configured, otherwise codex if the Codex CLI is
                  installed.
    codex         draws with the Codex CLI on this machine (`codex exec` and its image tool), signed in with your
                  own account. No API key needed.
    api           any OpenAI-compatible Images API (/images/generations and /images/edits):
                    IMAGE_API_URL   base URL, default https://api.openai.com/v1
                    IMAGE_API_KEY   API key (falls back to OPENAI_API_KEY)
                    IMAGE_MODEL     model name, default gpt-image-1

Values are read from the environment first, then from the studio's git-ignored .env file.
"""
import base64
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env():
    env = {}
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith(("IMAGE_", "OPENAI_"))})
    return env


def _config():
    env = _env()
    url = env.get("IMAGE_API_URL", "https://api.openai.com/v1").rstrip("/")
    key = env.get("IMAGE_API_KEY") or env.get("OPENAI_API_KEY", "")
    return url, key, env.get("IMAGE_MODEL", "gpt-image-1")


def backend():
    """The backend in use: "codex" or "api"."""
    chosen = _env().get("IMAGE_BACKEND", "").strip().lower()
    if chosen in ("codex", "api"):
        return chosen
    if chosen:
        raise SystemExit(f"IMAGE_BACKEND={chosen!r} is not supported; use codex or api")
    if _config()[1]:
        return "api"
    if shutil.which("codex"):
        return "codex"
    raise SystemExit("No image backend: install the Codex CLI and sign in (IMAGE_BACKEND=codex), "
                     "or set IMAGE_API_KEY in .env for an OpenAI-compatible Images API (IMAGE_BACKEND=api).")


def _post(path, body, ctype, timeout=900):
    url, key, _ = _config()
    headers = {"Content-Type": ctype}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{url}{path}", body, headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())["data"][0]
    if d.get("b64_json"):
        return base64.b64decode(d["b64_json"])
    with urllib.request.urlopen(d["url"], timeout=300) as r:
        return r.read()


def _codex(prompt, size, ref=None, timeout=900):
    shape = "portrait 2:3, 1024x1536" if size == "1024x1536" else "landscape 3:2, 1536x1024"
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        cmd = ["codex", "exec"]
        if ref is not None:
            (d / "ref.png").write_bytes(ref)
            cmd += ["-i", str(d / "ref.png")]
        task = (f"Use your image generation tool to create ONE image ({shape}) and save it in the current directory as out.png. "
                + ("Use the attached image ref.png as the reference, as described below. " if ref is not None else "")
                + f"{prompt}\n\nAfter saving, reply only with the file path.")
        # -i takes several values, so a flag must follow it before the task text
        r = subprocess.run(cmd + ["--skip-git-repo-check", "-s", "workspace-write", task], cwd=d,
                           capture_output=True, text=True, timeout=timeout)
        out = d / "out.png"
        if not out.exists():
            raise RuntimeError("codex did not save out.png: " + (r.stdout[-1500:] + r.stderr[-1500:]).strip())
        return out.read_bytes()


def generate(prompt, size="1536x1024"):
    """PNG bytes for a prompt. size: "1536x1024" (landscape, films) or "1024x1536" (portrait, Shorts)."""
    if backend() == "codex":
        return _codex(prompt, size)
    _, _, model = _config()
    body = {"model": model, "prompt": prompt, "size": size, "n": 1}
    return _post("/images/generations", json.dumps(body).encode(), "application/json")


def edit(ref, prompt, size="1536x1024"):
    """PNG bytes redrawn from the reference image `ref` (PNG bytes) following `prompt`."""
    if backend() == "codex":
        return _codex(prompt, size, ref)
    _, _, model = _config()
    b = uuid.uuid4().hex
    fields = [("model", model), ("prompt", prompt), ("size", size), ("n", "1")]
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="ref.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + ref + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return _post("/images/edits", b"".join(parts), f"multipart/form-data; boundary={b}")
