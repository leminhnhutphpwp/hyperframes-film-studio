"""Turn vertical story images (1080×1920) into story videos with background music: a very slow zoom in, soft music fade in/out.

    .venv/bin/python -I tools/story_video.py <music.flac> <image1.jpg> [image2.jpg …] [--seconds 15]

Each image becomes <image>.mp4 next to the original (H.264 + AAC 48 kHz stereo, 30 fps). One track is shared by the whole
batch; each story takes a different section, spread evenly across the track, so watching several in a row never repeats
the same opening. Music: a track you have the rights to (e.g. Pixabay music without Content ID) or tools/synth_audio.py.
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
        # skip the first 3 seconds, then spread the stories evenly across the track (a different section each)
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
        print(out, f'music from {start} s')


if __name__ == '__main__':
    main()
