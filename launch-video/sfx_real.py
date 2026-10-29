"""Sound effects for the launch video from real recordings, found through the Openverse API (openverse.org).

    python3 sfx_real.py cues.json sfx-real.wav

Every recording is CC0, CC BY or public domain (no share-alike), listed in SOUNDS with its source and credit; the
CC BY ones are credited in assets/sfx/CREDITS.md. Files are downloaded once into assets/sfx/. Each cue from
index.html (`node render.mjs --cues cues.json`) plays the matching recording, trimmed to its attack and levelled.
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 44.0
HERE = os.path.dirname(os.path.abspath(__file__))
SFX_DIR = os.path.join(HERE, 'assets', 'sfx')

# kind -> Openverse id, file, url, license, creator, title, max seconds, gain (assets/sfx/sounds.json)
SOUNDS = json.load(open(os.path.join(SFX_DIR, 'sounds.json')))


def fetch(entry):
    path = os.path.join(SFX_DIR, entry['file'])
    if not os.path.exists(path):
        subprocess.run(['curl', '-sSfL', '--max-time', '120', '-A', 'openbots-launch-video/1.0', '-o', path, entry['url']], check=True)
    return path


def decode(path, af=None):
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', path] + (['-af', af] if af else []) + ['-ar', str(SR), '-ac', '2', '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2).copy()


def prepare(entry, pitch=1.0):
    """Trim to the first real attack, cap the length with a short fade, and level to a common peak."""
    af = f'asetrate={int(SR * pitch)},aresample={SR}' if pitch != 1.0 else None
    a = decode(fetch(entry), af)
    if entry.get('reverse'):
        a = a[::-1].copy()
    env = np.abs(a).max(1)
    start = entry.get('start')
    if start == 'peak':  # a recording of several hits: start on the loudest one
        i0 = int(np.argmax(env)) - int(0.01 * SR)
    elif start is not None:
        i0 = int(start * SR)
    else:
        i0 = int(np.argmax(env > env.max() * 0.08))
    i0 = max(0, i0 - int(0.004 * SR))
    a = a[i0:i0 + int(entry['max'] * SR)]
    fade = min(len(a), int(0.04 * SR))
    a[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return a / (np.abs(a).max() + 1e-9) * entry.get('gain', 1.0)


def keystrokes(entry, count=12):
    """Slice single keystrokes out of a typing recording, so typing can be laid on any rhythm."""
    a = decode(fetch(entry))
    env = np.convolve(np.abs(a).max(1), np.ones(240) / 240, 'same')
    hits, last = [], -SR
    for i in np.flatnonzero(env > env.max() * 0.25):
        if i - last > int(0.07 * SR):
            hits.append(i)
            last = i
    keys = []
    for i in hits[:count]:
        k = a[max(0, i - int(0.005 * SR)):i + int(0.07 * SR)].copy()
        k[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
        keys.append(k / (np.abs(k).max() + 1e-9) * entry.get('gain', 1.0))
    return keys


cues = json.load(open(sys.argv[1]))
n = int(DUR * SR)
mix = np.zeros((n + 10 * SR, 2))
cache = {}
keys = keystrokes(SOUNDS['key']) if 'key' in SOUNDS else []
rng = np.random.default_rng(3)
for t, kind, gain, extra in cues:
    if kind == 'key':
        if not keys:
            continue
        s = keys[rng.integers(len(keys))] * gain
    elif kind not in SOUNDS:
        continue
    else:
        entry = SOUNDS[kind]
        # Montage ticks climb in pitch; pops step up a third each time
        pitch = 2 ** (extra * 0.6) if kind == 'tick' else 2 ** (extra * 4 / 12) if kind == 'pop' else 1.0
        if kind == 'swell':
            entry = dict(entry, max=extra)  # the riser runs right up to the logo cut
        key = (kind, round(pitch, 3), round(entry['max'], 2))
        if key not in cache:
            cache[key] = prepare(entry, pitch)
        s = cache[key] * gain
        if kind == 'swell':
            t = max(0.0, t + extra - len(s) / SR)  # end the riser exactly on the cut
    i = int(t * SR)
    mix[i:i + len(s)] += s[:len(mix) - i]
mix = mix[:n]
mix *= np.clip((DUR - np.arange(n) / SR) / 0.6, 0, 1)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-16:TP=-1.0:LRA=15,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', sys.argv[2]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', sys.argv[2])
