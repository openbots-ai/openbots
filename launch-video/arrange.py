"""Re-arranges a track so its sections follow the video's cuts: python3 arrange.py score-fit.wav [--stems DIR --start SEC [--keep-lead]]

By default it uses the groovy ElevenLabs track. With --stems, it uses another 124 BPM track's Demucs stems (drums,
bass, other; the vocals stem is left out, so nothing is sung) played straight through from the downbeat at --start,
with the same treatments on each cut.

Uses Demucs' stems of music.mp3 (assets/music/groovy-stems/). The track is 124 BPM, first beat at 0.02 s, the same grid
as the video, so it can be cut and re-joined on beats. Video beats are counted from the logo (the drop):

  opening lines     silent
  logo, word swaps  the groove comes in filtered down (muffled drums and melody: quiet, tension)
  builder           the groove slams back in, full
  text / computer   full groove
  any model         the lift (the bars with the synth chords)
  private           breakdown: drums out
  montage           drums back in, full
  end card          one last hit that rings out
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
B = 60 / 124
args = sys.argv[1:]
STEMS = os.path.join(HERE, 'assets', 'music', 'groovy-stems')
SRC0 = 0.02  # the track's first beat
if '--stems' in args:
    STEMS, SRC0 = args[args.index('--stems') + 1], float(args[args.index('--start') + 1])
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
DUR, SC = TL['duration'], TL['scenes']


def load(name, af=None):
    path = next(os.path.join(STEMS, name + e) for e in ('.flac', '.wav') if os.path.exists(os.path.join(STEMS, name + e)))
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', path]
    cmd += (['-af', af] if af else []) + ['-ar', str(SR), '-ac', '2', '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)


stems = {k: load(k) for k in ('drums', 'bass', 'other')}
low = {k: load(k, 'lowpass=f=350,lowpass=f=350') for k in ('drums', 'other')}  # filtered-down versions
if '--keep-lead' in args:
    # For a track tagged instrumental: what Demucs calls "vocals" is its lead (synth, guitar), so it stays, with the melody
    m = min(len(stems['other']), len(load('vocals')))
    stems['other'] = stems['other'][:m] + load('vocals')[:m]
    low['other'] = low['other'][:m] + load('vocals', 'lowpass=f=350,lowpass=f=350')[:m]


def beat(scene):
    return round((SC[scene] - SC['s-logo']) / B)


# (from video beat, to video beat, source beat, gains for drums / bass / other, filtered?)
END = beat('s-end')
PLAN = [
    (0, beat('s-kinetic'), 32, (1, 1, 1), True),
    (beat('s-kinetic'), beat('s-build'), 38, (1, 1, 1), True),
    (beat('s-build'), beat('s-computer'), 36, (1, 1, 1), False),
    (beat('s-computer'), beat('s-models'), 40, (1, 1, 1), False),
    (beat('s-models'), beat('s-private'), 60, (1, 1, 1), False),
    (beat('s-private'), beat('s-montage'), 66, (0, 0.7, 1), False),
    (beat('s-montage'), END, 65, (1, 1, 1), False),
    (END, END + 1, 36, (1, 1, 1), False),
]

if '--stems' in args:  # another track: play it straight through, keeping only the treatments and the end hit
    PLAN = [(v0, v1, 0 if v0 == END else v0, g, f) for v0, v1, _, g, f in PLAN]

n = int(DUR * SR)
mix = np.zeros((n + 8 * SR, 2))
fade = int(0.006 * SR)
for v0, v1, s0, gains, filt in PLAN:
    a, length = int((SC['s-logo'] + v0 * B) * SR), int((v1 - v0) * B * SR)
    s = int((SRC0 + s0 * B) * SR)
    seg = np.zeros((length + fade, 2))
    for (k, src), g in zip(stems.items(), gains):
        src = low[k] if filt and k in low else src
        seg += src[s:s + length + fade] * g
    seg[:fade] *= np.linspace(0, 1, fade)[:, None]
    seg[-fade:] *= np.linspace(1, 0, fade)[:, None]
    if v0 == END:  # the last hit: shorten it to a stab and let it ring out through a long reverb
        stab = seg * np.exp(-np.arange(len(seg)) / (0.18 * SR))[:, None]
        rng = np.random.default_rng(7)
        ir_t = np.arange(int(4.0 * SR)) / SR
        size = 1 << int(np.ceil(np.log2(len(stab) + len(ir_t))))
        tail = np.zeros((len(stab) + len(ir_t) - 1, 2))
        for ch in range(2):
            ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 1.1)
            ir /= np.sqrt((ir ** 2).sum())
            tail[:, ch] = np.fft.irfft(np.fft.rfft(stab[:, ch], size) * np.fft.rfft(ir, size), size)[:len(tail)]
        seg = np.pad(stab, ((0, len(tail) - len(stab)), (0, 0))) + tail * 1.6
    mix[a:a + len(seg)] += seg[:len(mix) - a]

mix = mix[:n]
t = np.arange(n) / SR
mix *= (1 - np.clip((t - (DUR - 1.4)) / 1.4, 0, 1) ** 2)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', args[0]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', args[0])
