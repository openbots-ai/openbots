"""Fits the ElevenLabs track to the launch video's cuts: python3 score.py music.mp3 score.wav

Shifting the track 0.47s lines its own moments up with the video: a kick on the logo (0:03), its drop on
"Just text it" (0:15), its chorus on the model logos (~0:29) and its last hit on the end card (0:38).
On top of that: a filtered bloom for the intro, a filtered breakdown for "Private by design", sub booms
and noise risers on the big cuts, and a reverb tail so the end card fades out instead of going silent.
"""
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 44.0
# (video start, video end, track start): the track runs 0.47s ahead so its drop lands on the 0:15 cut; the montage
# borrows the chorus's strongest bar (the track winds down there), then the track's last hit lands on the 0:38 end card
SEGMENTS = [(0.0, 35.0, 0.47), (35.0, 38.0, 31.43), (38.0, DUR, 38.43)]
XFADE = 0.025
src, out = sys.argv[1], sys.argv[2]


def decode(af=None):
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', src] + (['-af', af] if af else []) + ['-ar', str(SR), '-ac', '2', '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2).copy()


dry, muffled = decode(), decode('lowpass=f=380,lowpass=f=380')
n = int(DUR * SR)
t = np.arange(n) / SR


def window(a):
    """Lays the track out on the video timeline, splicing segments with short crossfades so joins don't click."""
    a = np.pad(a, ((0, n), (0, 0)))
    outv = np.zeros((n, 2))
    fade = int(XFADE * SR)
    for v0, v1, t0 in SEGMENTS:
        i0, i1 = int(v0 * SR), int(v1 * SR)
        lo, hi = max(0, i0 - fade), min(n, i1 + fade)
        seg = a[int(t0 * SR) - (i0 - lo):int(t0 * SR) + (hi - i0)].copy()
        env = np.ones(hi - lo)
        if lo < i0: env[:2 * (i0 - lo)] = np.linspace(0, 1, 2 * (i0 - lo))
        if hi > i1: env[-2 * (hi - i1):] = np.linspace(1, 0, 2 * (hi - i1))
        outv[lo:hi] += seg * env[:, None]
    return outv


dry, muffled = window(dry), window(muffled)


def ramp(t0, t1):
    return np.clip((t - t0) / (t1 - t0), 0, 1)


# How muffled the mix is over time: intro blooms open at the logo; breakdown closes over "Private by design"
wet = np.where(t < 3.0, 1.0, 0.0) + np.where((t >= 32.0) & (t < 35.0), ramp(32.0, 32.4), 0.0)
gain = np.where(t < 3.0, ramp(0.2, 2.8) ** 1.5 * 0.85, 1.0) * np.where((t >= 32.0) & (t < 35.0), 0.8, 1.0)
mix = (dry * (1 - wet)[:, None] + muffled * wet[:, None]) * gain[:, None]

rng = np.random.default_rng(7)


def boom(at, level):
    """Sub drop with a short transient: the trailer-style hit on a cut."""
    d = 1.6
    tt = np.arange(int(d * SR)) / SR
    freq = 32 + 58 * np.exp(-tt / 0.18)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-tt / 0.55)
    click = rng.standard_normal(len(tt)) * np.exp(-tt / 0.012) * 0.35
    s = (body + click) * level
    i = int(at * SR)
    mix[i:i + len(s)] += s[:n - i, None]


def riser(t0, t1, level):
    """Bright noise swell that cuts off right at the hit."""
    k = np.arange(int((t1 - t0) * SR))
    env = (k / len(k)) ** 3
    for ch in range(2):
        noise = np.diff(rng.standard_normal(len(k) + 1))  # first difference = brighter noise
        mix[int(t0 * SR):int(t0 * SR) + len(k), ch] += noise * env * level


riser(1.2, 3.0, 0.10); boom(3.0, 0.55)
riser(33.8, 35.0, 0.10); boom(35.0, 0.35)
boom(38.0, 0.7)

# End card: the track's last hit at 0:38 rings out through a long reverb instead of stopping at 0:39.5
ir_len = int(6.0 * SR)
ir_t = np.arange(ir_len) / SR
tail_src = mix[int(37.9 * SR):int(39.6 * SR)].copy()
tail = np.zeros((len(tail_src) + ir_len - 1, 2))
for ch in range(2):
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t / 2.0)
    ir /= np.sqrt((ir ** 2).sum())
    m = 1 << int(np.ceil(np.log2(len(tail))))
    tail[:, ch] = np.fft.irfft(np.fft.rfft(tail_src[:, ch], m) * np.fft.rfft(ir, m), m)[:len(tail)]
i = int(37.9 * SR)
mix[i:] += tail[:n - i] * 1.4

# Fade to silence on the last frames, then write and loudness-normalise with ffmpeg
mix *= (1 - ramp(42.6, 44.0) ** 2)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', out], input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', out)
