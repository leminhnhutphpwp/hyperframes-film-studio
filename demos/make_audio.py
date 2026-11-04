"""Make every sound the demos use: narration with Kokoro TTS, music beds and effects with tools/synth_audio.py.

  runtime/venv-kokoro/bin/python demos/make_audio.py            all demos
  runtime/venv-kokoro/bin/python demos/make_audio.py voices     one demo (voices, daily-life, explainer, animals, stickman,
                                                                battle = samples/battle-paper)

Needs the Kokoro runtime from docs/setup.md (runtime/venv-kokoro with kokoro-onnx, soundfile, numpy, scipy,
imageio-ffmpeg, and the model in runtime/models/kokoro). For each demo it writes
  demos/<demo>/assets/audio/*.m4a      the sounds
  demos/<demo>/assets/audio/timing.js  window.NARRATION: when each line starts and how long it lasts, so captions and
                                       animation follow the voice
and rewrites the <audio> tags between <!-- AUDIO:BEGIN --> and <!-- AUDIO:END --> in demos/<demo>/index.html.

The Vietnamese line in the voices demo was read by VieNeu-TTS (tools/tts_vieneu.py --voice "Hải Đăng") and is kept
as demos/voices/assets/audio/vi-hai-dang.m4a; this script only measures it. Re-record it with VieNeu if you want.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "demos"
sys.path.insert(0, str(ROOT / "tools"))
import synth_audio  # noqa: E402  (music beds and battle sounds, generated from numpy)

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        m = ROOT / "runtime" / "models" / "kokoro"
        _kokoro = Kokoro(str(m / "kokoro-v1.0.onnx"), str(m / "voices-v1.0.bin"))
    return _kokoro


def to_m4a(x, sr, path, peak=0.9):
    """Write mono or stereo float audio as AAC .m4a; return the duration in seconds."""
    x = np.asarray(x, dtype=np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    x = x / (np.abs(x).max() + 1e-9) * peak
    wav = path.with_suffix(".wav")
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(wav), sr, (x * 32767).astype(np.int16))
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-c:a", "aac", "-b:a", "128k", str(path)], check=True)
    wav.unlink()
    return round(len(x) / sr, 3)


def say(text, voice, path, speed=1.0):
    audio, sr = kokoro().create(text, voice=voice, speed=speed, lang="en-gb" if voice.startswith("b") else "en-us")
    # trim the silence Kokoro leaves at both ends so start times are exact
    keep = np.where(np.abs(audio) > 0.01)[0]
    audio = audio[max(0, keep[0] - int(0.03 * sr)): keep[-1] + int(0.08 * sr)]
    return to_m4a(audio, sr, path), envelope(audio, sr)


def envelope(x, sr, per_second=30):
    """Loudness, 30 values a second, scaled 0–1: drawn as the waveform in the voices demo."""
    x = np.asarray(x, dtype=np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    n = int(sr / per_second)
    rms = [float(np.sqrt(np.mean(x[i:i + n] ** 2))) for i in range(0, len(x) - n, n)]
    top = max(rms) or 1
    return [round(v / top, 2) for v in rms]


def read_audio(path):
    raw = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def audio_tag(id, src, start, dur, vol, track, fade=0.3):
    pts = [(0, 0 if fade else vol), (min(fade, dur / 2), vol), (max(dur - fade, dur / 2), vol), (dur, 0 if fade else vol)]
    auto = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": [{"t": round(t, 3), "v": v} for t, v in pts]}]})
    return (f'      <audio id="{id}" src="{src}" data-start="{start:.3f}" data-duration="{dur:.3f}" '
            f"data-track-index=\"{track}\" data-automation='{auto}'></audio>")


def write(demo, narration, tags, extra=None, base=DEMOS):
    d = base / demo
    js = "// written by demos/make_audio.py: when each narrated line starts and how long it lasts (seconds)\n"
    js += f"window.NARRATION = {json.dumps(narration, ensure_ascii=False, indent=1)};\n"
    if extra:
        for k, v in extra.items():
            js += f"window.{k} = {json.dumps(v)};\n"
    (d / "assets/audio/timing.js").write_text(js, encoding="utf-8")
    html = (d / "index.html").read_text(encoding="utf-8")
    block = "<!-- AUDIO:BEGIN -->\n" + "\n".join(tags) + "\n      <!-- AUDIO:END -->"
    html, n = re.subn(r"<!-- AUDIO:BEGIN -->.*?<!-- AUDIO:END -->", block, html, flags=re.S)
    if not n:
        sys.exit(f"{demo}/index.html has no <!-- AUDIO:BEGIN --> … <!-- AUDIO:END --> markers")
    if extra and "DURATION" in extra:  # the composition is as long as its narration
        html = re.sub(r'(data-composition-id="main"[^>]*data-duration=")[\d.]+(")', rf'\g<1>{extra["DURATION"]}\g<2>', html, count=1)
    (d / "index.html").write_text(html, encoding="utf-8")
    print(f"{demo}: {len(tags)} sounds")


def lines(demo, voice, texts, first=0.4, gap=0.35, speed=1.0):
    """Read each line with one voice, back to back; return the narration list and the <audio> tags."""
    out, tags, t = [], [], first
    for i, text in enumerate(texts, 1):
        dur, _ = say(text, voice, DEMOS / demo / f"assets/audio/line{i}.m4a", speed)
        out.append({"text": text, "start": round(t, 3), "dur": dur})
        tags.append(audio_tag(f"line{i}", f"assets/audio/line{i}.m4a", t, dur, 1, 1, fade=0))
        t += dur + gap
    return out, tags, t


def bed(demo, kind, seconds, vol, **kw):
    """A quiet music bed under the whole demo, from tools/synth_audio.py."""
    seconds += 1.0
    if kind == "tranh":
        x = synth_audio.tranh(seconds, kw.get("root", 196.0))
    elif kind == "lyre":
        x = synth_audio.lyre(seconds)
    elif kind == "oud":
        x = synth_audio.oud(seconds)
    else:
        x = synth_audio.tanpura(seconds, kw.get("sa", 138.59))
    path = DEMOS / demo / f"assets/audio/{kind}-bed.m4a"
    dur = to_m4a(x, synth_audio.SR, path, peak=0.7)
    return audio_tag(f"bed-{kind}", f"assets/audio/{kind}-bed.m4a", 0, min(dur, seconds - 1.0), vol, 3, fade=0.8)


# ── demos ───────────────────────────────────────────────────────────────────────────────────────────────────────

VOICES = [  # Kokoro voice id, shown name, accent, line
    ("af_heart", "Heart", "American English · female", "Every picture in this film was drawn once, and animated forever."),
    ("am_fenrir", "Fenrir", "American English · male", "On the Ides of March, Caesar walked into the Senate."),
    ("bf_emma", "Emma", "British English · female", "Long ago, in a quiet village by the river, lived a potter."),
    ("bm_george", "George", "British English · male", "Hannibal led his elephants across the Alps, in winter."),
    ("am_puck", "Puck", "American English · male", "Stick figures? No drawings needed. Every pose is just code."),
]
VI = ("vi-hai-dang", "Hải Đăng", "Vietnamese · male (VieNeu-TTS)",
      "Một chàng trai đang vội. Vài phút nữa, anh phải đứng nói về lòng tốt.",
      "A young man is in a hurry. In a few minutes, he has to give a talk about kindness.")


def voices():
    demo, cards, tags, t = "voices", [], [], 1.2
    for vid, name, accent, text in VOICES:
        path = DEMOS / demo / f"assets/audio/{vid}.m4a"
        dur, env = say(text, vid, path)
        cards.append({"id": vid, "name": name, "accent": accent, "text": text, "start": round(t, 3), "dur": dur, "env": env})
        tags.append(audio_tag(vid, f"assets/audio/{vid}.m4a", t, dur, 1, 1, fade=0))
        t += dur + 0.9
    vid, name, accent, text, english = VI
    path = DEMOS / demo / f"assets/audio/{vid}.m4a"
    x = read_audio(path)
    dur = round(len(x) / SR, 3)
    cards.append({"id": vid, "name": name, "accent": accent, "text": text, "english": english, "start": round(t, 3), "dur": dur, "env": envelope(x, SR)})
    tags.append(audio_tag(vid, f"assets/audio/{vid}.m4a", t, dur, 1, 1, fade=0))
    t += dur + 1.2
    write(demo, cards, tags, {"DURATION": round(t, 2)})


def daily_life():
    narr, tags, end = lines("daily-life", "am_michael", [
        "He was late for a talk about kindness.",
        "On the way, a man sat slumped in a doorway.",
        "Would you stop?",
    ], first=0.5, gap=0.45)
    total = round(end + 0.8, 2)
    tags.append(bed("daily-life", "tranh", total, 0.22, root=146.83))
    write("daily-life", narr, tags, {"DURATION": total})


def explainer():
    narr, tags, end = lines("explainer", "af_heart", [
        "Who stopped to help?",
        "With no hurry, sixty-three percent stopped.",
        "A little late: forty-five percent.",
        "In a hurry, only one in ten.",
    ], first=0.3, gap=0.3)
    total = round(end + 1.2, 2)
    tags.append(bed("explainer", "lyre", total, 0.12))
    write("explainer", narr, tags, {"DURATION": total})


def animals():
    write("animals", [], [bed("animals", "lyre", 7, 0.5)])


def stickman():
    """A plucky pentatonic bed plus four little effects at the moments of the action."""
    rng = np.random.default_rng(7)
    sr = synth_audio.SR
    d = DEMOS / "stickman/assets/audio"

    def burst(sec, lo, hi, attack, decay, gain=1.0):
        n = int(sec * sr)
        return synth_audio.fft_filter(rng.standard_normal(n), lo, hi) * synth_audio.env(n, attack, decay) * gain

    t = np.arange(int(0.5 * sr)) / sr
    whoosh = burst(0.5, 600, 4000, 0.18, 0.12) * np.sin(np.pi * np.clip(t / 0.5, 0, 1))
    kick = np.sin(2 * np.pi * (90 * t - 60 * t * t)) * synth_audio.env(len(t), 0.002, 0.09) + burst(0.5, 1500, 6000, 0.001, 0.02, 0.4)
    bonk = np.sin(2 * np.pi * 420 * t * (1 + 0.6 * np.exp(-t * 30))) * synth_audio.env(len(t), 0.002, 0.12)
    cheer = sum(burst(1.6, lo, lo * 2.2, 0.25, 0.9, g) for lo, g in [(300, 1), (700, 0.7), (1500, 0.4)])
    fx = [("whoosh", whoosh, 1.85, 0.7), ("kick", kick, 3.28, 1), ("bonk", bonk, 4.3, 0.8), ("cheer", cheer, 4.55, 0.6)]
    tags = []
    for name, x, at, vol in fx:
        dur = to_m4a(x, sr, d / f"{name}.m4a")
        tags.append(audio_tag(name, f"assets/audio/{name}.m4a", at, dur, vol, 2, fade=0))
    tags.append(bed("stickman", "tranh", 7, 0.35, root=261.63))
    write("stickman", [], tags)


def battle():
    """samples/battle-paper: an oud bed under the whole battle, swords and shields from the clash (CLASH = 5.2 s)."""
    sr = synth_audio.SR
    d = ROOT / "samples/battle-paper/assets/audio"
    oud = synth_audio.oud(11)
    t_oud = audio_tag("bed-oud", "assets/audio/oud-bed.m4a", 0, to_m4a(oud, sr, d / "oud-bed.m4a", peak=0.7) - 1, 0.45, 3, fade=0.8)
    L, R = synth_audio.melee(6)
    t_melee = audio_tag("melee", "assets/audio/melee.m4a", 4.9, to_m4a(np.stack([L, R], axis=1), sr, d / "melee.m4a"), 0.9, 2, fade=0.4)
    write("battle-paper", [], [t_oud, t_melee], base=ROOT / "samples")


ALL = {"voices": voices, "daily-life": daily_life, "explainer": explainer, "animals": animals, "stickman": stickman, "battle": battle}

if __name__ == "__main__":
    for name in sys.argv[1:] or ALL:
        ALL[name]()
