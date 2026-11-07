"""Voiceover with ElevenLabs, mixed over the sound effects: python3 el_vo.py sfx-real.wav vo-mix.wav

Each line is voiced once and saved in assets/vo/ (delete a clip to voice it again). The API key isn't read here:
in this project's cloud environment the network proxy adds it to requests to api.elevenlabs.io. Elsewhere, set
ELEVENLABS_API_KEY.
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 97 * 60 / 124  # the video: 97 beats at 124 BPM (see SCENES in index.html)
HERE = os.path.dirname(os.path.abspath(__file__))
VO_DIR = os.path.join(HERE, 'assets', 'vo')
VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'  # Sarah - Mature, Reassuring, Confident
MODEL = 'eleven_multilingual_v2'

# (start, line). Scene starts: opening lines 0 / 2.9 / 5.8, Introducing 8.23, logo 11.13, words 14.03 / 15.0 / 15.97,
# builder 16.94, phone 21.77, computer 26.61, models 34.35, private 37.26, montage 40.16, end card 42.58
LINES = [
    (0.3, "Everyone's building your personal AI assistant."),
    (3.25, 'But what if you could build your own?'),
    (5.9, 'In just a few clicks.'),
    (8.5, 'Introducing…'),
    (11.2, 'OpenBots.'),
    (14.08, 'Your AI.'),
    (15.03, 'Your models.'),
    (16.0, 'Your rules.'),
    (17.1, 'Build your AI piece by piece. Pick the model behind every part.'),
    (21.9, 'Just text it. iMessage or SMS. No new app.'),
    (26.85, 'On your Mac. Signed into everything. Ask it to send your forms, and it takes care of the rest.'),
    (34.5, 'Bring any model. Even local ones.'),
    (37.4, 'Private by design. Encrypted on your machine.'),
    (40.5, 'And so much more.'),
    (42.8, 'OpenBots. Available now.'),
]


def clip_path(i, text):
    slug = ''.join(c if c.isalnum() else '-' for c in text.lower()).strip('-')[:40]
    return os.path.join(VO_DIR, VOICE_ID, f'{i:02d}-{slug}.mp3')


def voice(i, text):
    path = clip_path(i, text)
    if not os.path.exists(path):
        body = json.dumps({'text': text, 'model_id': MODEL,
                           'voice_settings': {'stability': 0.4, 'similarity_boost': 0.75, 'style': 0.15, 'use_speaker_boost': True}})
        subprocess.run(['curl', '-sSf', '--max-time', '120', '-X', 'POST',
                        '-H', f"xi-api-key: {os.environ.get('ELEVENLABS_API_KEY', 'proxy-injected')}",
                        '-H', 'Content-Type: application/json', '-d', body, '-o', path,
                        f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128'], check=True)
    a = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-af', 'highpass=f=70',
                                      '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout, dtype=np.float32)
    # Trim the leading and trailing silence so each line starts right on its time
    loud = np.flatnonzero(np.abs(a) > 0.01)
    return a[max(0, loud[0] - int(0.02 * SR)):loud[-1] + int(0.12 * SR)] if len(loud) else a


os.makedirs(os.path.join(VO_DIR, VOICE_ID), exist_ok=True)
n = int(DUR * SR)
vo = np.zeros(n)
for i, (start, text) in enumerate(LINES):
    a = voice(i, text)
    s = int(start * SR)
    vo[s:s + len(a)] += a[:n - s]
    print(f'{start:6.2f}-{start + len(a) / SR:6.2f}  {text}')

sfx = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', sys.argv[1], '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'],
                                   capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)[:n]
sfx = np.pad(sfx, ((0, n - len(sfx)), (0, 0)))

# The effects dip ~6 dB while the voice talks, easing over ~150 ms
win = int(0.15 * SR)
talking = np.convolve((np.abs(vo) > 0.01).astype(float), np.ones(win) / win, 'same')
duck = 1 - 0.5 * np.clip(talking * 4, 0, 1)
speech = vo[np.abs(vo) > 0.01]
vo *= 0.16 / max(1e-6, np.sqrt(np.mean(speech ** 2)))
mix = sfx * duck[:, None] * 0.8 + vo[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-16:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', sys.argv[2]],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', sys.argv[2])
