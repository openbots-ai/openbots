"""Voiceover for the launch video, voiced with Kokoro (open-source TTS, Apache-2.0) and mixed over the sound effects.

    python vo.py MODEL_DIR sfx.wav mix.wav

MODEL_DIR holds kokoro-v1.0.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx releases); run it with a
Python that has kokoro-onnx and soundfile installed. Each line is synthesised on its own and placed on its scene
(times in seconds, from VOICEOVER.md); the sound effects dip a little under the voice.
"""
import subprocess
import sys

import numpy as np
from kokoro_onnx import Kokoro

SR = 48000
DUR = 44.0
VOICE = 'af_heart'

# (start, line, speed). Scene cuts: logo 2.90, words 6.77, builder 10.65, text 15.48, computer 21.29,
# models 29.03, private 31.94, montage 34.84, end card 37.26
LINES = [
    (0.6, 'Introducing…', 1.0),
    (2.95, 'OpenBots.', 1.0),
    (4.0, "A personal AI that's actually yours, and designed for your workflows.", 1.15),
    (7.95, 'Your models. Your rules.', 1.0),
    (10.9, 'Build it piece by piece. Pick every model, set every rule.', 1.0),
    (15.6, 'Then just text it.', 1.0),
    (17.3, 'You pick what it knows, how it talks, and its guardrails.', 1.0),
    (21.6, "It can use your computer, where you're already logged in. And it checks with you before anything big.", 1.0),
    (29.15, 'Choose your specific model for each layer of the stack.', 1.0),
    (32.2, 'Your conversations stay on your machine, by design.', 1.0),
    (37.6, 'Make it yours. OpenBots.', 1.0),
]

model_dir, sfx_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
kokoro = Kokoro(f'{model_dir}/kokoro-v1.0.onnx', f'{model_dir}/voices-v1.0.bin')


def to48k(audio, sr):
    """Resample a mono clip to 48 kHz with ffmpeg, and clean it up: rumble filter and gentle compression."""
    proc = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-',
                           '-af', 'highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2',
                           '-ar', str(SR), '-f', 'f32le', '-'], input=audio.astype(np.float32).tobytes(), capture_output=True, check=True)
    clip = np.frombuffer(proc.stdout, dtype=np.float32)
    # Trim the engine's leading and trailing silence so each line starts exactly on its time
    loud = np.flatnonzero(np.abs(clip) > 0.01)
    return clip[max(0, loud[0] - int(0.02 * SR)):loud[-1] + int(0.12 * SR)] if len(loud) else clip


n = int(DUR * SR)
voice = np.zeros(n)
for start, text, speed in LINES:
    audio, sr = kokoro.create(text, voice=VOICE, speed=speed, lang='en-us')
    clip = to48k(audio, sr)
    i = int(start * SR)
    voice[i:i + len(clip)] += clip[:n - i]
    print(f'{start:6.2f}–{start + len(clip) / SR:6.2f}  {text}')

sfx = np.frombuffer(subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', sfx_path, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'],
                                   capture_output=True, check=True).stdout, dtype=np.float32).reshape(-1, 2)[:n]
sfx = np.pad(sfx, ((0, n - len(sfx)), (0, 0)))

# Duck the effects ~6 dB while the voice is talking, easing in and out over ~150 ms
talking = np.convolve((np.abs(voice) > 0.01).astype(float), np.ones(int(0.15 * SR)) / int(0.15 * SR), 'same')
duck = 1 - 0.5 * np.clip(talking * 4, 0, 1)
voice_level = 1.6 / max(1e-6, np.sqrt(np.mean(voice[np.abs(voice) > 0.01] ** 2)) * 10)
mix = sfx * duck[:, None] * 0.8 + (voice * voice_level)[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.98)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                '-af', 'loudnorm=I=-16:TP=-1.0:LRA=11,alimiter=limit=0.89:level=false', '-ar', str(SR), '-c:a', 'pcm_s16le', out],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', out)
