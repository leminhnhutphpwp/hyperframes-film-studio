#!/usr/bin/env python3
# ============================================================
#  src/transcribe.py — STT (bóc băng) bằng faster-whisper
#
#  Dùng để HỌC phong cách video mẫu: bóc lời đọc + mốc thời gian từng câu để
#  đo nhịp/wording. KHÔNG nằm trong pipeline dựng video; chỉ là công cụ phân
#  tích tư liệu tham chiếu (data/reference/<name>/).
#
#  Chạy trong venv:  runtime/venv-kokoro/bin/python tools/voice/transcribe.py <audio> [--model small] [--lang en]
#  Xuất cạnh file audio:  <base>.transcript.txt · <base>.srt · <base>.segments.json
# ============================================================
import sys, os, json, argparse

def fmt_ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    ap.add_argument("--lang", default="en")
    ap.add_argument("--out", default=None, help="tiền tố file xuất (mặc định = cạnh audio)")
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    base = args.out or os.path.splitext(args.audio)[0]
    print(f"[transcribe] model={args.model} lang={args.lang} audio={args.audio}", flush=True)
    # CPU + int8: nhẹ RAM, đủ nhanh cho bóc băng tư liệu.
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        args.audio, language=args.lang, vad_filter=True,
        beam_size=5, condition_on_previous_text=True,
    )

    segs = []
    srt_blocks = []
    txt_parts = []
    for i, seg in enumerate(segments, 1):
        text = seg.text.strip()
        segs.append({"i": i, "start": round(seg.start, 3), "end": round(seg.end, 3), "text": text})
        srt_blocks.append(f"{i}\n{fmt_ts(seg.start)} --> {fmt_ts(seg.end)}\n{text}\n")
        txt_parts.append(text)
        print(f"  [{fmt_ts(seg.start)}] {text}", flush=True)

    with open(base + ".transcript.txt", "w", encoding="utf-8") as f:
        f.write(" ".join(txt_parts).strip() + "\n")
    with open(base + ".srt", "w", encoding="utf-8") as f:
        f.write("\n".join(srt_blocks))
    with open(base + ".segments.json", "w", encoding="utf-8") as f:
        json.dump({
            "audio": os.path.basename(args.audio),
            "model": args.model,
            "language": info.language,
            "duration": round(info.duration, 2),
            "segments": segs,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n[transcribe] {len(segs)} câu · {round(info.duration,1)}s → {base}.transcript.txt / .srt / .segments.json", flush=True)

if __name__ == "__main__":
    main()
