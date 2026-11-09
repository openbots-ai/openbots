"""Voiceover with ElevenLabs, mixed over the sound effects: python3 el_vo.py timeline.json sfx-real.wav vo-mix.wav [score.wav]

The script is voiced as continuous passages rather than line by line, so it flows like one read: each passage is
sent with the text before and after it, and the settings keep the delivery steady. Clips and their word timings are
saved in assets/vo/<voice>/ (delete one to voice it again). timeline.json holds the scene starts
(`node render.mjs --timeline timeline.json`). The API key isn't read here: in this project's cloud environment the
network proxy adds it to requests to api.elevenlabs.io. Elsewhere, set ELEVENLABS_API_KEY.

    python3 el_vo.py --times     voice the passages (if needed) and print when each phrase is spoken
"""
import base64
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
VO_DIR = os.path.join(HERE, 'assets', 'vo')
VOICE_ID = 'cgSgspJ2msm6clMCkdW9'  # Jessica - Playful, Bright, Warm
MODEL = 'eleven_multilingual_v2'
# Steady, even delivery: near-maximum stability, no added style and a slightly slower pace keep it from sounding performed
SETTINGS = {'stability': 0.9, 'similarity_boost': 0.75, 'style': 0.0, 'use_speaker_boost': True, 'speed': 0.95}

# (scene, anchor word or None, seconds after the scene starts, passage). With an anchor, the passage is placed so
# that word lands at that moment; otherwise the passage starts there.
PASSAGES = [
    # Capitals are how ElevenLabs is asked to stress a word: "YOUR" carries the line
    ('s-hook', None, 0.3, "Everyone's building YOUR personal AI assistant. But what if you could build your own in just a few clicks."),
    # A presenter's beat after "Introducing", and a little more life (lower stability) so the name lands
    # (the pause inside this take was shortened to 0.35s by hand so it fits the short "Introducing" screen; "OpenBots"
    # lands just after the logo pops in)
    ('s-logo', 'OpenBots', 0.26, 'Introducing… OpenBots.', {'stability': 0.75}),
    ('s-kinetic', None, 0.05, 'Your AI, your models, your rules.'),
    ('s-build', None, 0.15, 'Build your AI piece by piece. Pick the model behind every part.'),
    ('s-text', None, 0.15, 'Just text it. iMessage or SMS. No new app.'),
    ('s-computer', None, 0.25, 'On your Mac. Signed into everything. Ask it to send your forms, and it takes care of the rest.'),
    ('s-models', None, 0.15, 'Bring any model. Even local ones.'),
    ('s-private', None, 0.15, 'Private by design. Encrypted on your machine.'),
    ('s-montage', None, 0.4, 'And so much more.'),
    ('s-end', None, 0.25, 'OpenBots.'),
]


def paths(i, text):
    slug = ''.join(c if c.isalnum() else '-' for c in text.lower()).strip('-')[:40]
    base = os.path.join(VO_DIR, VOICE_ID, f'p{i:02d}-{slug}')
    return base + '.mp3', base + '.json'


def voice(i):
    """Voice passage i (once), returning its audio at 48 kHz and the start time of every word in it."""
    text = PASSAGES[i][3]
    settings = dict(SETTINGS, **(PASSAGES[i][4] if len(PASSAGES[i]) > 4 else {}))
    mp3, timing = paths(i, text)
    if not os.path.exists(mp3):
        body = {'text': text, 'model_id': MODEL, 'voice_settings': settings,
                'previous_text': ' '.join(p[3] for p in PASSAGES[:i])[-500:],
                'next_text': ' '.join(p[3] for p in PASSAGES[i + 1:])[:500]}
        # ElevenLabs occasionally rejects a request in a burst; retry a couple of times before giving up
        out = subprocess.run(['curl', '-sSf', '--retry', '3', '--retry-all-errors', '--retry-delay', '3', '--max-time', '120', '-X', 'POST',
                              '-H', f"xi-api-key: {os.environ.get('ELEVENLABS_API_KEY', 'proxy-injected')}",
                              '-H', 'Content-Type: application/json', '-d', json.dumps(body),
                              f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_128'],
                             capture_output=True, check=True).stdout
        d = json.loads(out)
        open(mp3, 'wb').write(base64.b64decode(d['audio_base64']))
        json.dump(d['alignment'], open(timing, 'w'))
    al = json.load(open(timing))
    a = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', mp3, '-af', 'highpass=f=70',
                                      '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout, dtype=np.float32)
    # Words and when they start, from the character timings
    words, cur, t0 = [], '', None
    for ch, t in zip(al['characters'], al['character_start_times_seconds']):
        if ch.isspace():
            if cur:
                words.append((cur, t0))
            cur, t0 = '', None
        elif ch in '—…':  # a pause mark ends a word too
            if cur:
                words.append((cur, t0))
            cur, t0 = '', None
        else:
            cur, t0 = cur + ch, t if t0 is None else t0
    if cur:
        words.append((cur, t0))
    # Trim the silence before the first word, keeping the word times in step
    loud = np.flatnonzero(np.abs(a) > 0.01)
    cut = max(0, loud[0] - int(0.02 * SR)) if len(loud) else 0
    end = loud[-1] + int(0.15 * SR) if len(loud) else len(a)
    return a[cut:end], [(w, t - cut / SR) for w, t in words]


os.makedirs(os.path.join(VO_DIR, VOICE_ID), exist_ok=True)
if sys.argv[1] == '--times':
    for i, p in enumerate(PASSAGES):
        a, words = voice(i)
        print(f'{p[0]:11s} {len(a) / SR:5.2f}s  ' + '  '.join(f'{w}@{t:.2f}' for w, t in words))
    sys.exit()

timeline = json.load(open(sys.argv[1]))
starts, DUR = timeline['scenes'], timeline['duration']
n = int(DUR * SR)
vo = np.zeros(n)
for i, (scene, anchor, offset, text, *_) in enumerate(PASSAGES):
    a, words = voice(i)
    at = starts[scene] + offset
    if anchor:
        at -= next(t for w, t in words if w.strip('.,!?…').lower() == anchor.lower())
    s = int(at * SR)
    vo[s:s + len(a)] += a[:n - s]
    print(f'{at:6.2f}-{at + len(a) / SR:6.2f}  {text}')

sfx = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', sys.argv[2], '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'],
                                   capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)[:n]
sfx = np.pad(sfx, ((0, n - len(sfx)), (0, 0)))

# The effects dip ~6 dB while the voice talks, easing over ~150 ms
win = int(0.15 * SR)
talking = np.convolve((np.abs(vo) > 0.01).astype(float), np.ones(win) / win, 'same')
duck = 1 - 0.5 * np.clip(talking * 4, 0, 1)
speech = vo[np.abs(vo) > 0.01]
vo *= 0.16 / max(1e-6, np.sqrt(np.mean(speech ** 2)))
mix = sfx * duck[:, None] * 0.8 + vo[:, None]
if len(sys.argv) > 4:
    # Music bed (score.py output): low and relaxed, dipping ~10 dB under the voice
    music = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', sys.argv[4], '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'],
                                         capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)[:n]
    music = np.pad(music, ((0, n - len(music)), (0, 0)))
    music *= 0.12 / max(1e-6, np.sqrt(np.mean(music ** 2)))
    mix += music * (1 - 0.68 * np.clip(talking * 4, 0, 1))[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-16:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', sys.argv[3]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', sys.argv[3])
