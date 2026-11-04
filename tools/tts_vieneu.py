"""Read a narration file with VieNeu-TTS (Vietnamese) or Kokoro (English, --engine kokoro), one paragraph per call.

  <vieneu python> tools/tts_vieneu.py <narration.txt> <out_dir> [--voice "Quốc Tuấn"] [--only 2,5]

narration.txt: lines "NNN text"; a blank line ends a paragraph; lines starting with # are notes. Each paragraph is read
in ONE call so the intonation flows across its sentences (reading line by line restarts the voice at every line and
sounds choppy). Line boundaries inside a paragraph are recovered from the pauses: the pause nearest to where the
line should end (by character count) is the cut.
Writes <out_dir>/pNN.wav per paragraph and <out_dir>/lines.json:
  {"paragraphs": [{"file": "p01.wav", "dur": s, "lines": [43, 44]}], "lines": {"43": {"p": 0, "start": s, "end": s}}}
Runs in the studio's own runtimes (git-ignored, see docs/setup.md):
  Vietnamese  runtime/venv-vieneu/bin/python tools/tts_vieneu.py ...            models runtime/models/{vieneu-v3-turbo,moss-codec}
  English     runtime/venv-kokoro/bin/python tools/tts_vieneu.py ... --engine kokoro   model runtime/models/kokoro
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools" / "voice"))


def paragraphs(path):
    paras, cur = [], []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        if raw.startswith("#"):
            continue
        m = re.match(r"(\d+)\s+(.*)", raw)
        if m:
            cur.append((int(m.group(1)), m.group(2).strip()))
        elif not raw.strip() and cur:
            paras.append(cur)
            cur = []
    if cur:
        paras.append(cur)
    return paras


def pauses(x, sr, min_len=0.15):
    """Silent runs (start, end) in seconds: 20 ms frames 40 dB under the loudest frame."""
    import numpy as np

    hop = int(sr * 0.02)
    n = len(x) // hop
    rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    quiet = 20 * np.log10(rms / rms.max()) < -40
    runs, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * 0.02 >= min_len and i > 0 and j < n:
                runs.append((i * 0.02, j * 0.02))
            i = j
        else:
            i += 1
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("narration")
    ap.add_argument("out")
    ap.add_argument("--voice", default=None, help='VieNeu: "Quốc Tuấn" (default); kokoro: "am_fenrir" (default, the channel narrator)')
    ap.add_argument("--engine", choices=["vieneu", "kokoro"], default="vieneu", help="kokoro = English (run with the old pipeline's .venv-kokoro python)")
    ap.add_argument("--only", default="", help="paragraph numbers (1-based) to re-read; others keep their files")
    a = ap.parse_args()
    import numpy as np

    paras = paragraphs(a.narration)
    only = {int(x) for x in a.only.split(",") if x}
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    meta_path = out / "lines.json"
    old = json.loads(meta_path.read_text()) if meta_path.exists() and only else {}
    if a.engine == "kokoro":
        # Kokoro-82M (Apache-2.0) through kokoro-onnx, model files in runtime/models/kokoro
        import soundfile as _sf
        from kokoro_onnx import Kokoro

        mdir = ROOT / "runtime" / "models" / "kokoro"
        _k = Kokoro(str(mdir / "kokoro-v1.0.onnx"), str(mdir / "voices-v1.0.bin"))
        a.voice = a.voice or "am_fenrir"

        class tts:  # the two calls below, kokoro-shaped
            @staticmethod
            def infer(text, voice):
                return _k.create(text, voice=voice, speed=1.0, lang="en-gb" if voice.startswith("b") else "en-us")

            @staticmethod
            def save(audio, path):
                _sf.write(path, audio[0], audio[1])

        voice = a.voice
    else:
        import vieneu_local

        a.voice = a.voice or "Quốc Tuấn"
        tts = vieneu_local.load()
        voices = [v[1] if isinstance(v, (list, tuple)) else v for v in tts.list_preset_voices()]
        voice = next((v for v in voices if a.voice in str(v)), None)
        if voice is None:
            sys.exit(f"voice {a.voice!r} not found; have: {sorted(map(str, voices))}")
    meta = {"voice": a.voice, "paragraphs": [], "lines": {}}
    for pi, para in enumerate(paras):
        f = out / f"p{pi + 1:02d}.wav"
        if only and pi + 1 not in only and f.exists():
            x = None
        else:
            audio = tts.infer(" ".join(t for _, t in para), voice=voice)
            tts.save(audio, str(f))
        import soundfile as sf

        x, fsr = sf.read(str(f), dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        dur = len(x) / fsr
        runs = pauses(x, fsr)
        chars = np.cumsum([len(t) for _, t in para])
        cuts, last = [], 0.0
        for k in range(len(para) - 1):
            want = dur * chars[k] / chars[-1]
            cand = [r for r in runs if r[0] > last + 0.3]
            r = min(cand, key=lambda r: abs((r[0] + r[1]) / 2 - want)) if cand else (want, want)
            cuts.append(r)
            last = r[1]
        starts = [0.0] + [r[1] for r in cuts]
        ends = [r[0] for r in cuts] + [dur]
        meta["paragraphs"].append({"file": f.name, "dur": round(dur, 3), "lines": [n for n, _ in para]})
        for (n, t), s, e in zip(para, starts, ends):
            meta["lines"][str(n)] = {"p": pi, "start": round(s, 3), "end": round(e, 3)}
            print(f"p{pi + 1:02d} {n:03d} {s:6.2f}–{e:6.2f}  {t[:56]}", flush=True)
    meta_path.write_text(json.dumps(meta, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
