"""Puts the ElevenLabs track under the launch video: python3 score.py music.mp3 score.wav

The track plays as it is, from its first beat at 0:00; the video's cuts are timed to its 124 BPM grid (see
SCENES in index.html). The only additions: a reverb tail so the end card rings out instead of going silent
when the track stops (~0:39.5), a fade to silence on the last frames, and loudness normalisation.
"""
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 44.0
src, out = sys.argv[1], sys.argv[2]

cmd = ['ffmpeg', '-loglevel', 'error', '-i', src, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-']
track = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)
n = int(DUR * SR)
mix = np.zeros((n, 2))
mix[:min(n, len(track))] = track[:n]
t = np.arange(n) / SR


def ramp(t0, t1):
    return np.clip((t - t0) / (t1 - t0), 0, 1)


# A few milliseconds of fade-in so the first sample doesn't click
mix *= ramp(0, 0.01)[:, None]

# End card: the track's last hit (~0:38.4) rings out through a long reverb instead of stopping at ~0:39.5
rng = np.random.default_rng(7)
ir_len = int(6.0 * SR)
ir_t = np.arange(ir_len) / SR
start = int(37.9 * SR)
tail_src = mix[start:int(39.6 * SR)].copy()
tail = np.zeros((len(tail_src) + ir_len - 1, 2))
size = 1 << int(np.ceil(np.log2(len(tail))))
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t / 2.0)
    ir /= np.sqrt((ir ** 2).sum())
    tail[:, ch] = np.fft.irfft(np.fft.rfft(tail_src[:, ch], size) * np.fft.rfft(ir, size), size)[:len(tail)]
mix[start:] += tail[:n - start] * 1.4

# Fade to silence with the picture, then loudness-normalise (-14 LUFS) with a limiter so nothing clips
mix *= (1 - ramp(42.6, 44.0) ** 2)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', out],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', out)
