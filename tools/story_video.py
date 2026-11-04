"""Biến ảnh tin dọc (1080×1920) thành video tin có nhạc nền: ảnh zoom vào thật chậm, nhạc vào/ra êm.

    .venv/bin/python -I tools/story_video.py <nhạc.flac> <ảnh1.jpg> [ảnh2.jpg …] [--seconds 15]

Mỗi ảnh ra <ảnh>.mp4 cạnh ảnh gốc (H.264 + AAC 48 kHz stereo, 30 fps). Dùng chung MỘT bài nhạc cho cả đợt; mỗi tin
lấy một đoạn khác nhau, chia đều khắp bài, để xem liền mấy tin không bị nghe lại đúng câu mở đầu.
Nhạc: bài bạn có quyền dùng (ví dụ nhạc Pixabay không có Content ID) hoặc tools/synth_audio.py.
"""
import argparse
import subprocess

import imageio_ffmpeg


def duration(path):
    r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-i', path], capture_output=True, text=True)
    h, m, s = r.stderr.split('Duration: ')[1].split(',')[0].split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('music')
    ap.add_argument('images', nargs='+')
    ap.add_argument('--seconds', type=float, default=15)
    a = ap.parse_args()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    total = duration(a.music)
    fps, n = 30, int(a.seconds * 30)
    for i, img in enumerate(a.images):
        # bỏ 3 giây đầu, rồi chia đều các tin ra khắp bài (mỗi tin một đoạn khác nhau)
        step = max(7, int((total - a.seconds - 6) / len(a.images)))
        start = 3 + (step * i) % max(1, int(total - a.seconds - 6))
        out = img.rsplit('.', 1)[0] + '.mp4'
        vf = (f'scale=2160:3840,zoompan=z=\'1+0.025*on/{n}\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\''
              f':d={n}:s=1080x1920:fps={fps},format=yuv420p')
        af = f'afade=t=in:d=1.2,afade=t=out:st={a.seconds - 2}:d=2'
        subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-i', img,
                        '-ss', str(start), '-t', str(a.seconds), '-i', a.music,
                        '-vf', vf, '-af', af, '-t', str(a.seconds), '-r', str(fps),
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out],
                       check=True)
        print(out, f'nhạc từ giây {start}')


if __name__ == '__main__':
    main()
