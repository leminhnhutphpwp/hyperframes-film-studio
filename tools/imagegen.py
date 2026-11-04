"""One image backend for every drawing tool: an OpenAI-compatible Images API.

  IMAGE_API_URL   base URL, default https://api.openai.com/v1 (any server exposing /images/generations and /images/edits)
  IMAGE_API_KEY   API key (falls back to OPENAI_API_KEY); may be empty for a local server that needs none
  IMAGE_MODEL     model name, default gpt-image-1

Values are read from the environment first, then from the studio's git-ignored .env file.
"""
import base64
import json
import os
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


def generate(prompt, size="1536x1024"):
    """PNG bytes for a prompt. size: "1536x1024" (landscape, films) or "1024x1536" (portrait, Shorts)."""
    _, _, model = _config()
    body = {"model": model, "prompt": prompt, "size": size, "n": 1}
    return _post("/images/generations", json.dumps(body).encode(), "application/json")


def edit(ref, prompt, size="1536x1024"):
    """PNG bytes redrawn from the reference image `ref` (PNG bytes) following `prompt`."""
    _, _, model = _config()
    b = uuid.uuid4().hex
    fields = [("model", model), ("prompt", prompt), ("size", size), ("n", "1")]
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields]
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="ref.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + ref + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return _post("/images/edits", b"".join(parts), f"multipart/form-data; boundary={b}")
