"""Self-made sounds (no downloads, no licence questions): musket volleys, a cannon shot and a tanpura-style drone bed.

  .venv/bin/python -I tools/synth_audio.py <out_dir> [--bed-seconds 660] [--sa 138.59]

Writes FLAC files (48 kHz, stereo):
  musket-volley.flac   a ragged line of flintlocks firing within ~0.5 s, with a short echo
  musket-few.flac      a thinner volley (a few pieces)
  melee.flac           12 s of swords and shields clashing over the rumble of feet (ancient battles)
  cannon.flac          one field gun: a deep thump, a crack and a rolling tail
  lyre-bed.flac        (--bed lyre) a slow lyre in D Dorian over a low drone, for the Roman films
  oud-bed.flac         (--bed oud) a slow oud in D Hijaz over a frame drum and drone, for Carthage / North Africa
  tanpura-drone.flac   a four-string drone (Pa, Sa, Sa, low Sa) plucked in a slow cycle under a soft pad,
                       meant as a quiet music bed under the narration (mix it ~20 dB below the voice)
Everything is generated from noise and sine partials with numpy, seeded, so a re-run gives the same files.
"""
import argparse
from pathlib import Path

import subprocess

import imageio_ffmpeg
import numpy as np
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(1765)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def fft_filter(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def echo(x, delays=((0.11, 0.35), (0.23, 0.22), (0.41, 0.12), (0.7, 0.06))):
    out = np.copy(x)
    for d, g in delays:
        k = int(d * SR)
        out[k:] += g * fft_filter(x[: len(x) - k], 80, 3000)
    return out


def shot(length=0.9):
    """One flintlock: sharp crack (band noise), a low thump, a short powder hiss."""
    n = int(length * SR)
    crack = fft_filter(rng.standard_normal(n), 900, 9000) * env(n, 0.001, 0.035)
    thump = np.sin(2 * np.pi * np.cumsum(np.linspace(140, 55, n)) / SR) * env(n, 0.002, 0.09)
    hiss = fft_filter(rng.standard_normal(n), 2000, 12000) * env(n, 0.01, 0.25) * 0.12
    return crack * 0.9 + thump * 0.8 + hiss


def volley(count, spread, length=3.0):
    n = int(length * SR)
    L, R = np.zeros(n), np.zeros(n)
    for _ in range(count):
        s = shot() * rng.uniform(0.4, 1.0)
        at = int(rng.uniform(0, spread) * SR) + int(0.05 * SR)
        pan = rng.uniform(0.2, 0.8)
        L[at : at + len(s)] += s[: n - at] * (1 - pan)
        R[at : at + len(s)] += s[: n - at] * pan
    return echo(L), echo(R)


def cannon(length=4.0):
    n = int(length * SR)
    boom = np.sin(2 * np.pi * np.cumsum(np.linspace(75, 32, n)) / SR) * env(n, 0.004, 0.6)
    crack = fft_filter(rng.standard_normal(n), 400, 6000) * env(n, 0.001, 0.06)
    roll = fft_filter(rng.standard_normal(n), 30, 400) * env(n, 0.05, 1.2) * 0.6
    x = boom * 1.0 + crack * 0.7 + roll
    x = echo(x, ((0.18, 0.4), (0.37, 0.25), (0.6, 0.15), (1.0, 0.08)))
    return x, np.roll(x, int(0.004 * SR))


def tanpura(seconds, sa):
    """Four plucks per cycle (Pa, Sa', Sa', low Sa); each string rings with bright 'jawari' harmonics that slowly
    bloom and fade; a quiet pad on Sa and Pa breathes underneath."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    cycle = 5.2
    strings = [(sa * 1.5 / 2, 0.38), (sa, 0.62), (sa, 0.5), (sa / 2, 0.45)]  # (frequency, pan)
    ring = int(7.0 * SR)
    t = np.arange(ring) / SR

    def pluck(f, seed):
        r = np.random.default_rng(seed)
        x = np.zeros(ring)
        for h in range(1, 24):
            # jawari: upper partials swell a little after the pluck, then die away faster than the fundamental
            bloom = (1 - np.exp(-t / (0.08 + 0.02 * h))) * np.exp(-t / (5.5 / (1 + 0.12 * h)))
            amp = (1 / h**0.9) * (1 + 0.6 * np.sin(h * 0.7)) * bloom
            x += amp * np.sin(2 * np.pi * f * h * (1 + r.uniform(-0.0004, 0.0004)) * t + r.uniform(0, 6.28))
        return x * env(ring, 0.004, 6.0) / 6

    cache = {(i, v): pluck(f, 100 + i * 4 + v) for i, (f, _) in enumerate(strings) for v in range(4)}  # 4 takes per string
    k = 0
    for c in np.arange(0, seconds, cycle):
        for i, (f, pan) in enumerate(strings):
            at = max(0, int((c + i * cycle / 4 + rng.uniform(-0.03, 0.03)) * SR))
            if at >= n:
                break
            x = cache[(i, k % 4)]
            k += 1
            m = min(ring, n - at)
            out[at : at + m, 0] += x[:m] * (1 - pan)
            out[at : at + m, 1] += x[:m] * pan
    # soft pad: Sa and Pa an octave down, slowly breathing
    tt = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * sa / 2 * tt) + 0.6 * np.sin(2 * np.pi * sa * 0.75 * tt) + 0.3 * np.sin(2 * np.pi * sa * tt * 1.0015)) * (0.55 + 0.45 * np.sin(2 * np.pi * tt / 23.0))
    out[:, 0] += pad * 0.05
    out[:, 1] += pad * 0.05 * (0.9 + 0.1 * np.sin(2 * np.pi * tt / 31.0))
    fade = int(4 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out


def clash(length=0.8):
    """One blade or shield blow: a noisy hit plus a few inharmonic metal partials ringing briefly."""
    n = int(length * SR)
    t = np.arange(n) / SR
    hit = fft_filter(rng.standard_normal(n), 1500, 9000) * env(n, 0.0005, 0.02)
    ring = sum(np.sin(2 * np.pi * f * rng.uniform(0.97, 1.03) * t) * np.exp(-t / d) for f, d in ((1240, 0.25), (2710, 0.15), (3930, 0.1), (5600, 0.06)))
    thud = fft_filter(rng.standard_normal(n), 60, 500) * env(n, 0.002, 0.05)
    return hit * 0.8 + ring * 0.25 + thud * 0.6


def melee(seconds, per_second=7):
    """A field of fighting: blows scattered in time and across the stereo field, with a low rumble of feet."""
    n = int(seconds * SR)
    L, R = np.zeros(n), np.zeros(n)
    for _ in range(int(seconds * per_second)):
        c = clash() * rng.uniform(0.25, 1.0)
        at = int(rng.uniform(0, seconds - 0.8) * SR)
        pan = rng.uniform(0.15, 0.85)
        L[at : at + len(c)] += c * (1 - pan)
        R[at : at + len(c)] += c * pan
    rumble = fft_filter(rng.standard_normal(n), 30, 250) * 0.35
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.6 * SR))
    return (L + rumble) * fade, (R + rumble) * fade


def lyre(seconds, root=146.83):
    """A slow lyre over a low drone, in D Dorian: one soft pluck every ~1.6 s, wandering a seeded melody that leans on
    the root and fifth, with a long quiet rest every few phrases; under it a breathing pad on D and A."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    steps = [0, 2, 3, 5, 7, 9, 10, 12, 14]  # D Dorian, a little over an octave
    ring = int(4.0 * SR)
    t = np.arange(ring) / SR

    def pluck(f):
        x = np.zeros(ring)
        for h in range(1, 12):
            x += (1 / h**1.4) * np.exp(-t * (1.1 + 0.55 * h)) * np.sin(2 * np.pi * f * h * t + h)
        return x * env(ring, 0.003, 2.5) / 2.5

    cache = {s: pluck(root * 2 ** (s / 12)) for s in steps}
    r = np.random.default_rng(44)
    i, pos, at = 0, 4, 1.0
    while at < seconds - 4:
        if i % 24 in (20, 21, 22, 23):  # a rest at the end of each phrase
            at += 1.6
            i += 1
            continue
        pos = int(np.clip(pos + r.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(steps) - 1))
        if i % 8 == 0:
            pos = r.choice([0, 4])  # phrases start on D or A
        x = cache[steps[pos]] * r.uniform(0.6, 1.0)
        k = int(at * SR)
        m = min(ring, n - k)
        pan = 0.35 + 0.3 * r.random()
        out[k : k + m, 0] += x[:m] * (1 - pan)
        out[k : k + m, 1] += x[:m] * pan
        at += r.choice([1.6, 1.6, 0.8, 2.4])
        i += 1
    tt = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * root / 2 * tt) + 0.5 * np.sin(2 * np.pi * root * 0.75 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 19.0))
    out[:, 0] += pad * 0.07
    out[:, 1] += pad * 0.07
    fade = int(4 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out


def tranh(seconds, root=196.0):
    """A slow đàn tranh-like zither in a Vietnamese pentatonic (hơi Bắc: do re fa sol la), one soft pluck every ~1.4 s;
    some notes get the nhấn (a bend up to the next step and back) and a light vibrato as the string rings; long rests
    between phrases; a faint low drone on the root and fifth underneath. Seeded, so the same every run."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    steps = [-5, -3, 0, 2, 5, 7, 9, 12, 14]  # sol la | do re fa sol la | do re
    ring = int(3.5 * SR)
    t = np.arange(ring) / SR

    def pluck(f, bend):
        # bend: 0 = plain; >0 = semitones of a nhấn that rises after the attack and falls back
        glide = np.where(t < 0.25, 0, np.where(t < 0.6, (t - 0.25) / 0.35, np.maximum(0, 1 - (t - 0.6) / 0.5))) * bend
        vib = 0.06 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.3) / 0.5, 0, 1)
        ph = 2 * np.pi * np.cumsum(f * 2 ** ((glide + vib) / 12)) / SR
        x = np.zeros(ring)
        for h in range(1, 9):
            x += (1 / h**1.7) * np.exp(-t * (1.4 + 0.8 * h)) * np.sin(h * ph + h)
        return x * env(ring, 0.002, 2.2) / 2.2

    r = np.random.default_rng(27)
    i, pos, at = 0, 4, 0.8
    while at < seconds - 3.5:
        if i % 20 in (16, 17, 18, 19):  # rest at the end of each phrase
            at += 1.4
            i += 1
            continue
        pos = int(np.clip(pos + r.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(steps) - 1))
        if i % 8 == 0:
            pos = r.choice([2, 5])  # phrases start on do or sol
        bend = r.choice([0, 0, 0, 2, 1]) if steps[pos] in (2, 7, 14, -3) else 0
        x = pluck(root * 2 ** (steps[pos] / 12), bend) * r.uniform(0.55, 1.0)
        k = int(at * SR)
        m = min(ring, n - k)
        pan = 0.35 + 0.3 * r.random()
        out[k : k + m, 0] += x[:m] * (1 - pan)
        out[k : k + m, 1] += x[:m] * pan
        at += r.choice([1.4, 1.4, 0.7, 2.1])
        i += 1
    tt = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * root / 2 * tt) + 0.4 * np.sin(2 * np.pi * root * 0.75 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 17.0))
    out += pad[:, None] * 0.05
    fade = int(3 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out


def oud(seconds, root=146.83):
    """A slow oud-like lute in D Hijaz (Phrygian dominant: D Eb F# G A Bb C) for North Africa / Carthage: short woody
    plucks with a soft pick noise, sometimes a quick grace note from below, phrases that fall back to D; a low frame
    drum (doum … tek) every few seconds, very quiet; a drone on D and A. Seeded, so the same every run."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    steps = [-5, -2, 0, 1, 4, 5, 7, 8, 10, 12]  # A Bb | D Eb F# G A Bb C D
    ring = int(2.6 * SR)
    t = np.arange(ring) / SR

    def pluck(f):
        x = np.zeros(ring)
        for h in range(1, 10):
            x += (1 / h**1.2) * np.exp(-t * (2.2 + 1.1 * h)) * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h) + h)
        pick = np.random.default_rng(int(f)).standard_normal(ring) * np.exp(-t * 90) * 0.15
        return (x + pick) * env(ring, 0.002, 1.4) / 2.2

    cache = {s: pluck(root * 2 ** (s / 12)) for s in steps}
    r = np.random.default_rng(91)
    i, pos, at = 0, 2, 1.2
    while at < seconds - 3:
        if i % 22 in (18, 19, 20, 21):
            at += 1.5
            i += 1
            continue
        pos = int(np.clip(pos + r.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(steps) - 1))
        if i % 8 == 0:
            pos = r.choice([2, 6])  # phrases start on D or A
        k = int(at * SR)
        if r.random() < 0.18 and pos > 0:  # a grace note from below
            g = cache[steps[pos - 1]][: int(0.12 * SR)] * 0.5
            kk = max(0, k - len(g))
            out[kk : kk + len(g)] += g[:, None] * 0.5
        x = cache[steps[pos]] * r.uniform(0.6, 1.0)
        m = min(ring, n - k)
        pan = 0.35 + 0.3 * r.random()
        out[k : k + m, 0] += x[:m] * (1 - pan)
        out[k : k + m, 1] += x[:m] * pan
        at += r.choice([0.75, 0.75, 1.5, 1.5, 2.25])
        i += 1
    # frame drum: doum (low, round) on 1, tek (dry) on 3, one bar every 3.2 s
    dl = int(0.6 * SR)
    td = np.arange(dl) / SR
    doum = np.sin(2 * np.pi * 62 * td * (1 - 0.25 * td)) * np.exp(-td * 9)
    tek = fft_filter(rng.standard_normal(dl), 900, 4000) * np.exp(-td * 45) * 0.35
    b = 2.0
    while b < seconds - 2:
        for off, hit, v in ((0, doum, 1.0), (1.6, tek, 0.8), (2.4, tek, 0.5)):
            k = int((b + off) * SR)
            m = min(dl, n - k)
            if m > 0:
                out[k : k + m] += hit[:m, None] * 0.22 * v
        b += 3.2
    tt = np.arange(n) / SR
    pad = (np.sin(2 * np.pi * root / 2 * tt) + 0.45 * np.sin(2 * np.pi * root * 0.75 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 21.0))
    out += pad[:, None] * 0.06
    fade = int(4 * SR)
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return out


def save(path, L, R=None, peak=0.89):
    x = np.stack([L, R if R is not None else L], axis=1)
    x = x / (np.abs(x).max() + 1e-9) * peak
    wav = path.with_suffix(".wav")
    wavfile.write(str(wav), SR, (x * 32767).astype(np.int16))
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), str(path)], check=True)
    wav.unlink()
    print("wrote", path, f"{len(x) / SR:.1f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--bed-seconds", type=float, default=660)
    ap.add_argument("--sa", type=float, default=138.59)  # C#3
    ap.add_argument("--bed", choices=["tanpura", "lyre", "tranh", "oud"], default="tanpura",
                    help="tanpura (India), lyre (Rome), tranh (Vietnam, đàn tranh pentatonic) or oud (Carthage, D Hijaz)")
    ap.add_argument("--bed-only", action="store_true", help="write only the music bed, not the battle sounds")
    ap.add_argument("--root", type=float, default=196.0,
                    help="tranh: pitch of 'do' in Hz (196 = G3; 146.83 = D3 for a lower, calmer bed)")
    ap.add_argument("--name", default="tranh-bed", help="tranh: output file name without extension")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    if a.bed == "tranh":
        bed = tranh(a.bed_seconds, a.root)
        save(out / f"{a.name}.flac", bed[:, 0], bed[:, 1], peak=0.7)
        return
    if not a.bed_only:
        save(out / "musket-volley.flac", *volley(30, 0.55))
        save(out / "musket-few.flac", *volley(8, 0.4))
        save(out / "cannon.flac", *cannon())
        save(out / "melee.flac", *melee(12))
    if a.bed == "oud":
        bed = oud(a.bed_seconds)
        save(out / "oud-bed.flac", bed[:, 0], bed[:, 1], peak=0.7)
    elif a.bed == "lyre":
        bed = lyre(a.bed_seconds)
        save(out / "lyre-bed.flac", bed[:, 0], bed[:, 1], peak=0.7)
    else:
        bed = tanpura(a.bed_seconds, a.sa)
        save(out / "tanpura-drone.flac", bed[:, 0], bed[:, 1], peak=0.7)


if __name__ == "__main__":
    main()
