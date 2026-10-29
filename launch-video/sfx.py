"""Sound effects for the launch video, synthesised from scratch: python3 sfx.py cues.json sfx.wav

Cues come from index.html (`node render.mjs --cues cues.json`), built from the same timings as the animation, so
every whoosh, tick, pop and click lands on the frame it belongs to. Nothing here is a sample: each sound is
shaped noise, short tones and transients.
"""
import json
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 44.0
rng = np.random.default_rng(11)


def secs(d):
    return np.arange(int(d * SR)) / SR


def shaped_noise(dur, fc, bw, env, pan=None):
    """Noise through a moving band-pass: fc(u) and env(u) take u in 0..1 over the sound. Returns stereo."""
    n = int(dur * SR)
    win, hop = 1024, 256
    x = rng.standard_normal(n + win)
    w = np.hanning(win)
    f = np.fft.rfftfreq(win, 1 / SR)
    f[0] = 1
    out = np.zeros(n + win)
    norm = np.zeros(n + win)
    for start in range(0, n, hop):
        u = start / max(1, n)
        mask = np.exp(-0.5 * (np.log2(f / fc(u)) / bw) ** 2)
        seg = np.fft.irfft(np.fft.rfft(x[start:start + win] * w) * mask, win) * w
        out[start:start + win] += seg
        norm[start:start + win] += w ** 2
    y = out[:n] / np.maximum(norm[:n], 1e-3)
    u = np.arange(n) / n
    y = y * env(u) / (np.abs(y).max() + 1e-9)
    p = pan(u) if pan else np.zeros(n)  # -1 left .. 1 right
    return np.stack([y * np.sqrt((1 - p) / 2), y * np.sqrt((1 + p) / 2)], 1) * np.sqrt(2)


def tone(dur, f0, f1=None, decay=0.1, attack=0.002):
    """Sine gliding from f0 to f1 with an exponential decay."""
    t = secs(dur)
    f = f0 if f1 is None else f1 + (f0 - f1) * np.exp(-t / 0.03)
    y = np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR)
    return y * np.minimum(1, t / attack) * np.exp(-t / decay)


def burst(dur, lo, hi, decay):
    """Short band-limited noise transient (clicks, keys, the bite of a hit)."""
    y = shaped_noise(dur, lambda u: np.sqrt(lo * hi), np.log2(hi / lo) / 2.2, lambda u: 1)[:, 0]
    return y * np.exp(-secs(dur) / decay)


def layer(*parts):
    """Sum mono sounds of different lengths."""
    y = np.zeros(max(len(p) for p in parts))
    for p in parts:
        y[:len(p)] += p
    return y


def stereo(y, pan=0.0):
    return np.stack([y * np.sqrt((1 - pan) / 2), y * np.sqrt((1 + pan) / 2)], 1) * np.sqrt(2)


def rise_fall(peak):
    return lambda u: np.where(u < peak, (u / peak) ** 2, ((1 - u) / (1 - peak)) ** 1.5)


def sound(kind, extra):
    if kind == 'whoosh':
        d = max(0.3, extra or 0.6)
        return shaped_noise(d, lambda u: 350 * 2 ** (3.2 * np.sin(np.pi * min(1, u * 1.1))), 0.55, rise_fall(0.55), lambda u: -0.6 + 1.2 * u) * 0.8
    if kind == 'swish':
        return shaped_noise(0.24, lambda u: 900 * 2 ** (2.4 * u), 0.5, rise_fall(0.4), lambda u: 0.5 - u) * 0.7
    if kind == 'slide':
        return shaped_noise(0.38, lambda u: 700 * 2 ** (1.8 * u), 0.5, rise_fall(0.35), lambda u: 0.7 - 1.0 * u) * 0.6
    if kind == 'flick':
        return shaped_noise(max(0.1, extra), lambda u: 2200 * 2 ** (1.0 * u), 0.45, rise_fall(0.5)) * 0.35
    if kind == 'zoom':
        d = 0.75
        air = shaped_noise(d, lambda u: 300 * 2 ** (3.5 * u), 0.6, lambda u: u ** 1.5 * (1 - u ** 8))
        hum = stereo(tone(d, 90, 220, decay=10) * secs(d) / d * (1 - (secs(d) / d) ** 8)) * 0.35
        return air * 0.7 + hum
    if kind == 'swell':
        d = extra
        return shaped_noise(d, lambda u: 220 * 2 ** (3.6 * u ** 1.4), 0.7, lambda u: u ** 2.4 * np.minimum(1, (1 - u) * 60)) * 0.8
    if kind == 'swell-out':
        return shaped_noise(1.2, lambda u: 2400 * 2 ** (-3.3 * u), 0.7, lambda u: (1 - u) ** 2 * np.minimum(1, u * 10)) * 0.6
    if kind == 'impact':
        d = 0.9
        t = secs(d)
        thump = tone(d, 120, 38, decay=0.32)
        return stereo(layer(thump * 0.9, burst(0.06, 200, 2500, 0.015) * 0.35))
    if kind == 'tick':
        f = 1900 * 2 ** (extra * 0.9)  # montage ticks climb with each word
        return stereo(layer(tone(0.05, f, decay=0.012) * 0.6, burst(0.012, 3000, 9000, 0.003) * 0.4))
    if kind == 'pop':
        f = 520 * 2 ** (extra * 4 / 12)  # each successive pop a third higher
        y = tone(0.12, f * 1.7, f, decay=0.045)
        return stereo(layer(y * 0.8, burst(0.006, 1500, 6000, 0.0015) * 0.25), pan=0.15 * (extra - 1.5))
    if kind == 'click':
        down = layer(burst(0.008, 2000, 7000, 0.0015), tone(0.008, 1700, decay=0.002) * 0.4)
        up = burst(0.006, 2500, 8000, 0.001) * 0.45
        y = np.zeros(int(0.09 * SR))
        y[:len(down)] += down
        y[int(0.07 * SR):int(0.07 * SR) + len(up)] += up
        return stereo(y)
    if kind == 'tap':
        return stereo(layer(burst(0.02, 900, 3500, 0.004), tone(0.03, 320, decay=0.008) * 0.5))
    if kind == 'key':
        g = 0.75 + 0.5 * rng.random()
        return stereo(layer(burst(0.025, 1400, 4500, 0.004), tone(0.025, 170 + 40 * rng.random(), decay=0.006) * 0.5) * g, pan=rng.uniform(-0.3, 0.3))
    if kind == 'dots':
        return stereo(tone(0.08, 700, decay=0.02) * 0.3)
    if kind == 'send':
        air = shaped_noise(0.28, lambda u: 900 * 2 ** (2.6 * u), 0.45, rise_fall(0.6), lambda u: -0.3 + 0.9 * u)
        return air * 0.6 + stereo(tone(0.28, 520, 1100, decay=0.08)) * 0.2
    if kind == 'receive':
        a = tone(0.5, 880, decay=0.14)
        b = np.pad(tone(0.43, 1320, decay=0.14), (int(0.07 * SR), 0))
        return stereo((a + b) * 0.45)
    if kind == 'ding':
        f = [1319, 1568][int(extra)]
        return stereo(layer(tone(0.6, f, decay=0.16), tone(0.6, f * 2, decay=0.07) * 0.3) * 0.5)
    if kind == 'lock':
        snap = burst(0.004, 3000, 10000, 0.0008)
        ring = tone(0.08, 2300, decay=0.018) * 0.35 + tone(0.08, 3600, decay=0.012) * 0.25
        thunk = tone(0.07, 160, decay=0.02) * 0.6
        y = np.zeros(int(0.12 * SR))
        y[:len(snap)] += snap
        y[:len(ring)] += ring
        y[:len(thunk)] += thunk
        second = burst(0.003, 3000, 9000, 0.0006) * 0.5
        y[int(0.035 * SR):int(0.035 * SR) + len(second)] += second
        return stereo(y)
    if kind == 'shimmer':
        d = 1.8
        t = secs(d)
        y = sum(np.sin(2 * np.pi * (f * (1 + 0.002 * rng.standard_normal())) * t + rng.random() * 6) for f in (1047, 1319, 1568, 2093))
        env = np.minimum(1, t / 0.08) * np.exp(-t / 0.6) * (1 + 0.25 * np.sin(2 * np.pi * 7 * t))
        return stereo(y * env * 0.18)
    raise ValueError(kind)


cues = json.load(open(sys.argv[1]))
n = int(DUR * SR)
mix = np.zeros((n + 4 * SR, 2))
for t, kind, gain, extra in cues:
    s = sound(kind, extra) * gain
    i = int(t * SR)
    mix[i:i + len(s)] += s[:len(mix) - i]
mix = mix[:n]

# A short room reverb glues the separate sounds together
ir_t = secs(0.7)
size = 1 << int(np.ceil(np.log2(n + len(ir_t))))
for ch in range(2):
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.18)
    ir /= np.sqrt((ir ** 2).sum())
    mix[:, ch] += np.fft.irfft(np.fft.rfft(mix[:, ch], size) * np.fft.rfft(ir, size), size)[:n] * 0.18

fade = np.clip((DUR - np.arange(n) / SR) / 0.6, 0, 1)
mix *= fade[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-16:TP=-1.0:LRA=15,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', sys.argv[2]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', sys.argv[2])
