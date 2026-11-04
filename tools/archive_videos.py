"""Move a project's exported videos and its rebuildable build output to the archive disk.

  archive_videos.py projects/<channel>/<film> [...]          dry run: list what would move
  archive_videos.py projects/<channel>/<film> [...] --apply  move it

What moves is everything git ignores inside the project (renders/, build/, out/, chapter copies of shared/ and
assets/, logs) to  $STUDIO_ARCHIVE/<channel>/<film>/<same path>  (default <studio>/archive). Inside an
`out/` folder only media files move (mp4, m4a, wav, ...); text such as chapters.txt or youtube.json stays.
Each run adds the moved paths to <project>/archived.json (tracked), so an agent can find the video later.
Nothing is deleted: a file already in the archive with another size stops the run.
"""
import argparse
import json
import os
import shutil
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = Path(os.environ.get("STUDIO_ARCHIVE", Path(__file__).resolve().parent.parent / "archive"))
MEDIA = {".mp4", ".m4a", ".wav", ".mov", ".webm", ".mkv", ".mp3", ".aac"}


def ignored(project):
    out = subprocess.run(["git", "status", "--ignored", "--porcelain", "--", str(project)], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [ROOT / line[3:].rstrip("/") for line in out.splitlines() if line.startswith("!! ")]


def plan(project):
    moves = []
    for p in ignored(project):
        if p.is_dir() and p.name == "out":
            moves += [f for f in p.rglob("*") if f.is_file() and f.suffix.lower() in MEDIA]
        else:
            moves.append(p)
    return moves


def size(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.is_dir() else p.stat().st_size


def move(src, dst):
    if src.is_dir():
        for f in sorted(src.rglob("*")):
            if f.is_file() or f.is_symlink():
                move(f, dst / f.relative_to(src))
        shutil.rmtree(src)
        return
    if dst.exists():
        if dst.stat().st_size != src.stat().st_size:
            raise SystemExit(f"stop: {dst} already exists with another size")
        src.unlink()
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("projects", nargs="+")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    for proj in a.projects:
        project = (ROOT / proj).resolve() if not Path(proj).is_absolute() else Path(proj)
        rel = project.relative_to(ROOT / "projects")  # <channel>/<film>[/<part>]
        dest = ARCHIVE / rel
        moves = plan(project)
        total = sum(size(m) for m in moves)
        print(f"{rel}: {len(moves)} paths, {total / 2**30:.2f} GiB -> {dest}")
        if not a.apply:
            for m in moves[:12]:
                print("   ", m.relative_to(project))
            if len(moves) > 12:
                print(f"    ... {len(moves) - 12} more")
            continue
        for m in moves:
            move(m, dest / m.relative_to(project))
        rec = project / "archived.json"
        data = json.loads(rec.read_text()) if rec.exists() else {"archive": str(dest), "moves": []}
        data["moves"].append({"date": date.today().isoformat(),
                              "paths": sorted(str(m.relative_to(project)) for m in moves)})
        rec.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(f"    moved; list in {rec.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
