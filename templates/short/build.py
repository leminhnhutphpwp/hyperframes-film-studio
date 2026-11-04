"""Build a vertical Short (1080x1920) from painted portrait tableaux, the narration and its timing.

  .venv/bin/python -I templates/short/build.py projects/<channel>/<short>            -> <short>/build/index.html
  cd <short>/build && npx --yes hyperframes@0.8.152 render --output ../out/<name>.mp4

<short>/short.json (example values are Vietnamese, the language of the narration they must match):
  {"kicker": "LỊCH SỬ ÍT NGƯỜI BIẾT",               small line over the title (top band, the whole Short) — "LITTLE-KNOWN HISTORY"
   "title": "Ai *ghép* chữ quốc ngữ đầu tiên?",      *word* = yellow — "Who first put together the Vietnamese alphabet?"
   "highlight": ["Francisco de Pina", "1617"],       words painted yellow in the captions (never split across two captions)
   "keep": ["Bồ Đào Nha", "Hà Nội"],                  other phrases never split across two captions
   "tail": 2.5,                                      seconds after the last line (end card)
   "end": "Tên Kênh Của Bạn",                      small line on the end card ("Your Channel Name")
   "bed": ["audio/sfx/tranh-bed.flac", 0.16],        music under everything [file, volume]
   "scenes": [{"img": "tableaux/s01/bg.jpg", "line": 1, "move": "in"}, ...],
        a scene starts at its narration line and lasts until the next scene; move: in | out | up | down | left | right
   "stamps": [{"line": 3, "year": "1617", "place": "Hội An"}, ...],     year card when that line starts
   "sfx": [{"id": "<library/sfx id> or path", "from": 1, "to": 3, "vol": 0.25, "at": 0}, ...]}
        from/to: narration lines (to = until that line ends; no "to" = to the end); at: seconds into the sound file

Narration: <short>/narration.vi.txt (lines "NNN text") and audio/vi-story/{loi-ke-toan-bo.m4a, timing.json} from
tools/tts_vieneu.py + tools/assemble_narration.py. Captions are cut from the narration text, a few words at a time,
timed by character count inside each line (Shorts carry burnt-in captions; long films do not).
"""
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
FONTS = ROOT / "templates/film/shared/fonts"
FADE = 0.6  # crossfade between scenes
MOVES = {  # (from, to) of scale / x / y on the picture
    "in": ({"scale": 1.04}, {"scale": 1.16}),
    "out": ({"scale": 1.16}, {"scale": 1.04}),
    "up": ({"scale": 1.14, "y": 70}, {"scale": 1.14, "y": -70}),
    "down": ({"scale": 1.14, "y": -70}, {"scale": 1.14, "y": 70}),
    "left": ({"scale": 1.14, "x": 50}, {"scale": 1.14, "x": -50}),
    "right": ({"scale": 1.14, "x": -50}, {"scale": 1.14, "x": 50}),
}


def lines_text(path):
    out = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"(\d+)\s+(.*)", raw)
        if m and not raw.startswith("#"):
            out[int(m.group(1))] = m.group(2).strip()
    return out


# never end a caption on these words (the phrase would hang: "của / Rhodes", "ngoài ba / mươi").
# Data: Vietnamese function words (of, numbers, articles, prepositions, auxiliaries) matched against the narration text.
NO_END = {"của", "ba", "hai", "bốn", "năm", "những", "các", "một", "là", "ở", "và", "tên", "khép", "bằng", "cho", "với",
          "người", "nhiều", "vài", "mấy", "đã", "đang", "sẽ", "không", "rất", "thì", "mà", "nhưng", "có", "ngoài", "trong", "trên", "dưới"}


def chunks(text, keep=(), most=48):
    """Cut a line into caption pieces of at most ~`most` characters (2–3 lines on screen): at , . : ; ? ! first (not at
    "…", which only marks a spoken pause), then the longest parts in two or three at the most balanced word break that
    does not end on a hanging word. Phrases in `keep` (names, places) are never split."""
    parts = [p.strip() for p in re.split(r"(?<=[,.:;?!])\s+", text) if p.strip()]
    out = []
    for p in parts:
        words = p.split()
        for ph in sorted(keep, key=len, reverse=True):  # glue protected phrases into one token
            n = len(ph.split())
            i = 0
            while n > 1 and i <= len(words) - n:
                if " ".join(words[i : i + n]).rstrip(",.:;?!…") == ph:
                    words[i : i + n] = [" ".join(words[i : i + n])]
                i += 1
        pieces = max(1, -(-len(p) // most))
        while pieces > 1 and len(words) > 1:
            target = len(" ".join(words)) / pieces
            best, score = 1, 1e9
            for i in range(1, len(words)):
                left = len(" ".join(words[:i]))
                sc = abs(left - target) + (40 if words[i - 1].lower().strip(",.") in NO_END else 0)
                if sc < score:
                    best, score = i, sc
            out.append(" ".join(words[:best]))
            words = words[best:]
            pieces -= 1
        out.append(" ".join(words))
    # a lone tiny piece ("ở Rome," = "in Rome,") joins the next one when both still fit
    merged = []
    for c in out:
        if merged and len(merged[-1]) < 12 and len(merged[-1]) + len(c) < most:
            merged[-1] += " " + c
        else:
            merged.append(c)
    return merged


def paint(text, words):
    s = html.escape(text)
    for w in sorted(words, key=len, reverse=True):
        s = re.sub(rf"(?<![\w>]){re.escape(html.escape(w))}(?![\w<])", f"<em>{html.escape(w)}</em>", s)
    return s


def title_html(t):
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", html.escape(t))


def cut_sound(src, dst, at, dur, fade=0.8):
    fo = max(0.0, dur - fade)
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at:.2f}", "-t", f"{dur:.2f}", "-i", str(src),
                    "-af", f"afade=t=in:d={fade},afade=t=out:st={fo:.2f}:d={fade}", "-ac", "2", "-ar", "48000",
                    "-c:a", "aac", "-b:a", "160k", str(dst)], check=True)


def main(short):
    short = Path(short).resolve()
    spec = json.loads((short / "short.json").read_text())
    timing = json.loads((short / "audio/vi-story/timing.json").read_text())
    L = {int(k): v for k, v in timing["lines"].items()}
    text = lines_text(short / "narration.vi.txt")
    last = max(L)
    total = round(timing["total"] + spec.get("tail", 2.5), 2)
    build = short / "build"
    if build.exists():
        shutil.rmtree(build)
    (build / "assets/img").mkdir(parents=True)
    (build / "assets/audio").mkdir(parents=True)
    shutil.copytree(FONTS, build / "assets/fonts")
    shutil.copy(short / "audio/vi-story/loi-ke-toan-bo.m4a", build / "assets/audio/voice.m4a")
    sfx_lib = {it["id"]: ROOT / "library/sfx" / it["file"] for it in json.loads((ROOT / "library/sfx/library.json").read_text())["items"]}

    body, tl = [], []
    # scenes
    sc = spec["scenes"]
    for i, s in enumerate(sc):
        start = 0.0 if i == 0 else L[s["line"]]["t"] - FADE / 2
        end = total if i == len(sc) - 1 else L[sc[i + 1]["line"]]["t"] + FADE / 2
        name = f"s{i + 1:02d}{Path(s['img']).suffix}"
        shutil.copy(short / s["img"], build / "assets/img" / name)
        body.append(f'<div class="clip scene" id="scene{i}" data-start="{start:.2f}" data-duration="{end - start:.2f}" '
                    f'data-track-index="0" style="z-index:{i + 1}"><div class="fade" id="fade{i}"><img id="img{i}" data-layout-allow-overflow '
                    f'src="assets/img/{name}" alt=""></div></div>')
        a, b = MOVES[s.get("move", "in")]
        tl.append(f'tl.fromTo("#img{i}", {json.dumps(a)}, {{...{json.dumps(b)}, duration: {end - start:.2f}, ease: "none"}}, {start:.2f});')
        if i:
            tl.append(f'tl.fromTo("#fade{i}", {{opacity: 0}}, {{opacity: 1, duration: {FADE}, ease: "none"}}, {start:.2f});')
    # captions: a few words at a time; each holds until the next one starts (never two on screen)
    hl = spec.get("highlight", [])
    caps = []
    for n in sorted(text):
        if n not in L:
            continue
        pieces = [text[n]] if n == last else chunks(text[n], hl + spec.get("keep", []))
        t0, d = L[n]["t"], L[n]["d"]
        weights = [len(p) + 4 for p in pieces]
        acc = t0
        for j, p in enumerate(pieces):
            dur = d * weights[j] / sum(weights)
            caps.append([acc, dur + (0.35 if j == len(pieces) - 1 else 0), p])
            acc += dur
    caps[-1][1] = total - caps[-1][0]  # the closing question stays on the end card
    for k, (at, hold, p) in enumerate(caps):
        if k + 1 < len(caps):
            hold = min(hold, caps[k + 1][0] - at)
        body.append(f'<div class="clip cap" id="cap{k}" data-start="{at:.2f}" data-duration="{hold:.2f}" data-track-index="3">'
                    f'<div class="cap-in" id="capin{k}">{paint(p, hl)}</div></div>')
        tl.append(f'tl.fromTo("#capin{k}", {{y: 18, opacity: 0}}, {{y: 0, opacity: 1, duration: 0.18, ease: "power2.out"}}, {at:.2f});')
    k = len(caps)
    # year stamps
    stamps = spec.get("stamps", [])
    for i, st in enumerate(stamps):
        t = L[st["line"]]["t"] + st.get("delay", 0)  # "delay": seconds after the line starts (a number said late in a long line)
        # a stamp lasts 3.4 s, or ends just before the next one (stamps on two short lines in a row would overlap)
        nxt = L[stamps[i + 1]["line"]]["t"] + stamps[i + 1].get("delay", 0) if i + 1 < len(stamps) else None
        dur = min(3.4, nxt - t - 0.05) if nxt is not None else 3.4
        body.append(f'<div class="clip stamp" id="stamp{i}" data-start="{t:.2f}" data-duration="{dur:.2f}" data-track-index="2">'
                    f'<div class="stamp-in" id="stampin{i}"><div class="year">{html.escape(st["year"])}</div>'
                    f'<div class="place">{html.escape(st.get("place", ""))}</div></div></div>')
        tl.append(f'tl.fromTo("#stampin{i}", {{x: -40, opacity: 0}}, {{x: 0, opacity: 1, duration: 0.35, ease: "power3.out"}}, {t:.2f});')
        tl.append(f'tl.to("#stampin{i}", {{opacity: 0, duration: 0.4}}, {t + dur - 0.4:.2f});')
    # end card line
    if spec.get("end"):
        t = timing["total"] - 0.2
        body.append(f'<div class="clip endline" id="endline" data-start="{t:.2f}" data-duration="{total - t:.2f}" data-track-index="2">'
                    f'<div id="endin">{html.escape(spec["end"])}</div></div>')
        tl.append(f'tl.fromTo("#endin", {{opacity: 0}}, {{opacity: 1, duration: 0.6}}, {t:.2f});')
    # sound
    audio = [f'<audio id="voice" src="assets/audio/voice.m4a" data-start="0" data-duration="{timing["total"]:.2f}" data-track-index="10" data-volume="1"></audio>']
    if spec.get("bed"):
        f, vol = spec["bed"]
        cut_sound(short / f, build / "assets/audio/bed.m4a", 0, total, fade=1.5)
        audio.append(f'<audio id="bed" src="assets/audio/bed.m4a" data-start="0" data-duration="{total:.2f}" data-track-index="11" data-volume="{vol}"></audio>')
    for i, s in enumerate(spec.get("sfx", [])):
        src = sfx_lib.get(s["id"]) or short / s["id"]
        t0 = L[s["from"]]["t"] - 0.3
        t1 = (L[s["to"]]["t"] + L[s["to"]]["d"] + 0.6) if s.get("to") else total  # no "to": until the end
        t1 = min(t1, total)
        cut_sound(src, build / f"assets/audio/sfx{i}.m4a", s.get("at", 0), t1 - t0)
        audio.append(f'<audio id="sfx{i}" src="assets/audio/sfx{i}.m4a" data-start="{t0:.2f}" data-duration="{t1 - t0:.2f}" '
                     f'data-track-index="{12 + i}" data-volume="{s.get("vol", 0.3)}"></audio>')

    head = (f'<div class="clip" id="head" data-start="0" data-duration="{total:.2f}" data-track-index="4">'
            f'<div class="kicker">{html.escape(spec.get("kicker", ""))}</div><div class="title">{title_html(spec["title"])}</div></div>')
    fontcss = (FONTS / "lora.css").read_text().replace("url(", "url(assets/fonts/")
    page = (HERE / "template.html").read_text()
    page = (page.replace("{{FONTCSS}}", fontcss).replace("{{DURATION}}", f"{total:.2f}")
            .replace("{{TITLE}}", html.escape(re.sub(r"\*", "", spec["title"])))
            .replace("{{BODY}}", "\n      ".join(body + [head] + audio)).replace("{{TIMELINE}}", "\n      ".join(tl)))
    (build / "index.html").write_text(page)
    shutil.copy(HERE / "hyperframes.json", build / "hyperframes.json")
    print(f"built {build.relative_to(ROOT)}: {total:.1f} s, {len(sc)} scenes, {k} captions, {len(spec.get('sfx', []))} sounds")


if __name__ == "__main__":
    main(sys.argv[1])
