"""Re-arranges a track so its sections follow the video's cuts: python3 arrange.py score-fit.wav [--stems DIR --start SEC [--keep-lead]]

By default it uses the groovy ElevenLabs track. With --stems, it uses another 124 BPM track's Demucs stems (drums,
bass, other; the vocals stem is left out, so nothing is sung) played straight through from the downbeat at --start,
with the same treatments on each cut.

Uses Demucs' stems of music.mp3 (assets/music/groovy-stems/). The track is 124 BPM, first beat at 0.02 s, the same grid
as the video, so it can be cut and re-joined on beats. Video beats are counted from the logo (the drop):

  opening lines     silent
  logo, word swaps  the groove comes in filtered down (muffled drums and melody: quiet, tension)
  builder           the groove with the track's opening melody on top
  text it           a bar of hats only, then the groove with the melody an octave up
  computer          the bars with the synth chords
  any model         the lift: the opening melody an octave up
  (each of these ends on a quick drum roll into the next)
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
sparkle = load('other', 'rubberband=pitch=2,highpass=f=600')  # the melody an octave up
no_kick = load('drums', 'highpass=f=180,highpass=f=180')  # hats and claps only
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
    # The chorus changes a little each time it comes round, so it doesn't loop the same bars:
    (beat('s-build'), beat('s-text'), 36, (1, 1, 1), False),
    (beat('s-text'), beat('s-computer'), 46, (1, 1, 1), False),
    (beat('s-computer'), beat('s-models'), 60, (1, 1, 1), False),
    (beat('s-models'), beat('s-private'), 32, (1, 1, 1), False),
    (beat('s-private'), beat('s-montage'), 66, (0, 0.7, 1), False),
    (beat('s-montage'), END, 65, (1, 1, 1), False),
    (END, END + 1, 36, (1, 1, 1), False),
]

if '--stems' in args:  # another track: play it straight through, keeping only the treatments and the end hit
    PLAN = [(v0, v1, 0 if v0 == END else v0, g, f) for v0, v1, _, g, f in PLAN]

n = int(DUR * SR)
mix = np.zeros((n + 8 * SR, 2))
fade = int(0.006 * SR)


def piece(s0, beats, gains, filt):
    """`beats` beats of the track from source beat s0, as the stems mixed with `gains` (filtered down if `filt`)."""
    s, length = int((SRC0 + s0 * B) * SR), int(beats * B * SR)
    seg = np.zeros((length + fade, 2))
    for (k, src), g in zip(stems.items(), gains):
        src = low[k] if filt and k in low else src
        part = src[s:s + length + fade] * g
        seg[:len(part)] += part
    return seg


def at(t):
    return int((SC['s-logo'] + t * B) * SR)


def src(stem, s0, length):
    i = int((SRC0 + s0 * B) * SR)
    out = np.zeros((length, 2))
    part = stem[i:i + length]
    out[:len(part)] = part
    return out


def drum_fill(seg, beats):
    """The last half beat's drums become a quick roll: their first 32nd note, four times, getting louder."""
    g, k = int((beats - 0.5) * B * SR), int(B / 8 * SR)
    hit = seg[g:g + k].copy()
    hit[-fade:] *= np.linspace(1, 0, fade)[:, None]
    seg[g:g + 4 * k] = 0
    for i in range(4):
        seg[g + i * k:g + (i + 1) * k] += hit[:len(seg) - g - i * k] * (0.6 + 0.15 * i)
    return seg


def vary(v0, v1, s0, seg):
    """The main groove is mostly drums and bass, so each pass gets something of its own (the track's opening melody,
    in the same key, laid over the groove; hats only for a bar; the bars with chords; the melody an octave up) and
    a drum roll into the next section."""
    L, beats = len(seg), v1 - v0
    if v0 == beat('s-build'):  # the groove, now with the opening melody on top
        seg += src(stems['other'], 0, L) * 0.85
    elif v0 == beat('s-text'):  # kick drops out for a bar (hats and claps only), then everything plus the sparkle
        bar = int(4 * B * SR)
        seg[:bar] -= src(stems['drums'], s0, L)[:bar] - src(no_kick, s0, L)[:bar]
        seg += src(stems['other'], 10, L) * 0.6
        seg[bar:] += src(sparkle, s0, L)[bar:] * 0.5
    elif v0 == beat('s-models'):  # the lift: the opening melody an octave up over the groove
        seg += src(sparkle, 0, L) * 0.7 + src(stems['other'], 0, L) * 0.5
    if v1 in (beat('s-text'), beat('s-computer'), beat('s-models')):
        seg = drum_fill(seg, beats)
    return seg


for v0, v1, s0, gains, filt in PLAN:
    a = at(v0)
    seg = piece(s0, v1 - v0, gains, filt)
    if '--stems' not in args:
        seg = vary(v0, v1, s0, seg)
    if v1 == beat('s-build'):
        # Into the drop, the way launch videos do it: the muffled groove opens up over two beats (a filter sweep)...
        full = piece(s0, v1 - v0, gains, False)
        u = np.clip((np.arange(len(seg)) / SR - (v1 - v0 - 2.5) * B) / (2 * B), 0, 1)[:, None] ** 2
        seg = seg * (1 - u) + full * u
    if v1 in (beat('s-build'), END):
        # ...then half a beat of silence right before the hit
        g = int((v1 - v0 - 0.5) * B * SR)
        seg[g - fade:g] *= np.linspace(1, 0, fade)[:, None]
        seg[g:] = 0
    if v1 == beat('s-montage'):
        # Out of the breakdown: a stutter (the montage's first sixteenth, repeated and climbing) over the last beat
        hit = piece(s0 + v1 - v0, 0.25, (1, 1, 1), False)[:int(B / 4 * SR)]
        hit[-fade:] *= np.linspace(1, 0, fade)[:, None]
        g = int((v1 - v0 - 1) * B * SR)
        seg[g:] = 0
        for i in range(4):
            j = g + i * len(hit)
            seg[j:j + len(hit)] += hit[:len(seg) - j] * (0.5 + 0.17 * i)
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

# A deep hit on each drop (the builder, the montage, the end card)
sys.path.insert(0, HERE)
import sfx as synth  # noqa: E402
boom = synth.sound('impact', 0)
for v in (beat('s-build'), beat('s-montage'), END):
    mix[at(v):at(v) + len(boom)] += boom * 0.45

mix = mix[:n]
t = np.arange(n) / SR
mix *= (1 - np.clip((t - (DUR - 1.4)) / 1.4, 0, 1) ** 2)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', args[0]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', args[0])
