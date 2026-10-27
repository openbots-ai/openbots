"""Builds the voiceover: one clip per line in script.json, plus vo/timing.json (clip lengths and word timings).

Uses ElevenLabs when ELEVENLABS_API_KEY is set (voice: ELEVENLABS_VOICE_ID), otherwise the local Kokoro model.
Either way the video reads vo/timing.json, so swapping the voice never touches the animation code.
"""
import base64, json, os, re, sys, urllib.request
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
lines = json.load(open(os.path.join(HERE, 'script.json')))['lines']

def trim(x, sr, thresh=0.01, pad=0.04):
    idx = np.where(np.abs(x) > thresh)[0]
    if not len(idx): return x
    a, b = max(0, idx[0] - int(pad * sr)), min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]

def resample(x, sr):
    if sr == SR: return x
    n = int(len(x) * SR / sr)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)

def estimate_words(text, dur):
    words = text.split()
    w = np.array([len(re.sub(r'\W', '', t)) + 2 + (3 if re.search(r'[.,]$', t) else 0) for t in words], float)
    edges = np.concatenate([[0], np.cumsum(w) / w.sum()]) * dur
    return [{'w': t, 's': float(edges[i]), 'e': float(edges[i + 1])} for i, t in enumerate(words)]

def eleven(text):
    key, voice = os.environ['ELEVENLABS_API_KEY'], os.environ.get('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL')
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=pcm_44100',
        data=json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2',
                         'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.35, 'use_speaker_boost': True}}).encode(),
        headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    d = json.load(urllib.request.urlopen(req))
    pcm = np.frombuffer(base64.b64decode(d['audio_base64']), dtype='<i2').astype(np.float32) / 32768
    return pcm, 44100, d.get('alignment')

def kokoro_engine():
    from kokoro_onnx import Kokoro
    k = Kokoro('/tmp/k.onnx', '/tmp/voices.bin')
    voice, speed = os.environ.get('KOKORO_VOICE', 'af_heart'), float(os.environ.get('KOKORO_SPEED', '1.06'))
    return lambda text: (*k.create(text, voice=voice, speed=speed, lang='en-us'), None)

use_eleven = bool(os.environ.get('ELEVENLABS_API_KEY'))
engine = eleven if use_eleven else kokoro_engine()
print('engine:', 'elevenlabs' if use_eleven else 'kokoro', file=sys.stderr)

os.makedirs(os.path.join(HERE, 'vo'), exist_ok=True)
timing = []
for ln in lines:
    audio, sr, _align = engine(ln['text'])
    audio = trim(resample(np.asarray(audio, np.float32), sr), SR)
    sf.write(os.path.join(HERE, 'vo', ln['id'] + '.wav'), audio, SR)
    dur = len(audio) / SR
    timing.append({**ln, 'dur': dur, 'words': estimate_words(ln['text'], dur)})
    print(f"{ln['id']:8s} {dur:5.2f}s", file=sys.stderr)
# Place every line on the video's clock: a short lead-in, then each clip followed by its gap
LEAD, t = 0.5, 0.5
for ln in timing:
    ln['start'] = t
    t += ln['dur'] + ln['gapAfter']
json.dump({'engine': 'elevenlabs' if use_eleven else 'kokoro', 'lead': LEAD, 'total': t, 'lines': timing}, open(os.path.join(HERE, 'vo', 'timing.json'), 'w'), indent=1)
print('total', round(t, 2), file=sys.stderr)
