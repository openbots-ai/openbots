"""Mixes out/audio.wav: the voiceover, a synthesized music bed (ducked under the voice) and UI sound effects.
Every cue is placed from vo/timing.json, so the sound tracks the picture whatever voice is used."""
import json, os
import numpy as np, soundfile as sf
from scipy.signal import butter, lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
timing = json.load(open(os.path.join(HERE, 'vo/timing.json')))
L = {l['id']: l for l in timing['lines']}
wt = lambda i, k: L[i]['start'] + L[i]['words'][k]['s']
TOTAL = timing['total'] + 0.4
N = int(TOTAL * SR)
rng = np.random.default_rng(7)
tt = lambda d: np.arange(int(d * SR)) / SR

def put(buf, t, x, gain=1.0):
    a = int(t * SR)
    if a < 0 or a >= len(buf): return
    x = x[: len(buf) - a]
    buf[a:a + len(x)] += x * gain

def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype='band'); return lfilter(b, a, x)
def lp(x, f, order=2):
    b, a = butter(order, f / (SR / 2), btype='low'); return lfilter(b, a, x)

# ---------- scene starts (same offsets as main.js) ----------
T = {'B1': L['meet']['start'] - 0.1, 'B2': L['own']['start'] - 0.12, 'C': L['text']['start'] - 0.12, 'D': L['models']['start'] - 0.12,
     'E': L['local']['start'] - 0.12, 'F': L['use']['start'] - 0.12, 'G': L['allow']['start'] - 0.12, 'H': L['setup']['start'] - 0.12, 'I': L['close']['start'] - 0.12}

# ---------- voiceover ----------
vo = np.zeros(N)
for l in timing['lines']:
    x, sr = sf.read(os.path.join(HERE, 'vo', l['id'] + '.wav')); assert sr == SR
    put(vo, l['start'], x if x.ndim == 1 else x[:, 0])
vo /= max(1e-6, np.abs(vo).max()); vo *= 0.9

# ---------- sfx ----------
sfx = np.zeros(N)
def whoosh(t, d=0.7, g=0.35):
    n = rng.standard_normal(int(d * SR)); u = tt(d) / d
    lowb = bp(n, 250, 900) * np.sin(np.pi * np.clip(u * 1.4, 0, 1)) ** 2
    highb = bp(n, 1500, 4500) * np.sin(np.pi * np.clip((u - 0.15) * 1.3, 0, 1)) ** 2
    put(sfx, t, (lowb * 0.9 + highb * 0.35), g * 0.8)
def pop(t, f=620, g=0.16):
    d = 0.11; x = np.sin(2 * np.pi * (f + 260 * (1 - np.exp(-tt(d) * 60))) * tt(d)) * np.exp(-tt(d) * 38); put(sfx, t, x, g)
def tick(t, f=1250, g=0.07):
    d = 0.05; put(sfx, t, np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * 90), g)
def ding(t, g=0.16):
    d = 0.9; x = (np.sin(2 * np.pi * 880 * tt(d)) + 0.35 * np.sin(2 * np.pi * 1320 * tt(d))) * np.exp(-tt(d) * 6); put(sfx, t, x, g * 0.6)
def thunk(t, g=0.4):
    d = 0.35; x = np.sin(2 * np.pi * (90 - 35 * (1 - np.exp(-tt(d) * 20))) * tt(d)) * np.exp(-tt(d) * 14) + lp(rng.standard_normal(int(d * SR)), 600) * np.exp(-tt(d) * 40) * 0.6; put(sfx, t, x, g)
def impact(t, g=0.5):
    d = 1.4; x = np.sin(2 * np.pi * (55 + 90 * np.exp(-tt(d) * 9)) * tt(d)) * np.exp(-tt(d) * 3.2) + lp(rng.standard_normal(int(d * SR)), 1500) * np.exp(-tt(d) * 6) * 0.35; put(sfx, t, x, g)
def riser(t0, t1, g=0.28):
    d = t1 - t0; n = rng.standard_normal(int(d * SR)); u = tt(d) / d
    put(sfx, t0, bp(n, 500, 9000) * u ** 2.2, g)
def typing(t0, t1, step=0.075):
    for t in np.arange(t0, t1, step): tick(t + rng.uniform(0, 0.02), f=rng.uniform(1000, 1500), g=0.04)

for k in ['B1', 'B2', 'C', 'D', 'E', 'F', 'G', 'H', 'I']: whoosh(T[k] + 0.05)
riser(T['B1'] - 1.0, T['B1'] + 0.35); impact(T['B1'] + 0.38)
for i in [0, 1, 2, 3, 4, 5, 6, 8]: pop(wt('hook', i), 520 + 40 * i, 0.07)
for i in range(9): pop(wt('own', i), 560 + 25 * i, 0.06)
typing(T['C'] + 0.55, wt('text', 2) - 0.1)
pop(wt('text', 2) + 0.12, 700, 0.18); pop(wt('text', 4) + 0.1, 560, 0.16); pop(wt('text', 8), 560, 0.16)
for i in [4, 5, 8]: tick(wt('text', i), 1400, 0.1)
for i in [6, 7, 8, 9, 12]: tick(wt('models', i) - 0.05, 1500 + 250 * [6, 7, 8, 9, 12].index(i), 0.12)
for i in range(3): tick(wt('local', 6) + i * 0.1 - 0.15, 1100, 0.1)
thunk(wt('local', 8), 0.2); tick(wt('local', 8) + 0.05, 2400, 0.1); thunk(wt('local', 10) + 0.35, 0.45)
pop(wt('use', 5) + 0.05, 520, 0.16); pop(wt('use', 8) + 0.1, 760, 0.2); ding(wt('use', 8) + 0.45, 0.1)
typing(wt('use', 8) + 0.45, wt('use', 8) + 2.0, 0.07)
thunk(wt('allow', 2), 0.3)
for tt_ in [wt('allow', 4) - 0.1, wt('allow', 7), wt('allow', 9) - 0.12]: pop(tt_, 640, 0.15)
for i in range(4): tick(wt('setup', 1) + 0.2 + i * 0.36, 1700 + 200 * i, 0.14)
ding(wt('setup', 1) + 0.2 + 3 * 0.36 + 0.3, 0.2)
for i, f in enumerate([523, 659, 784, 1047]): ding(wt('close', 3) + i * 0.09, 0.07)
for i in range(3): pop(wt('close', 3 + i), 600 + 60 * i, 0.08)

# ---------- music ----------
from music import make_music, make_trap
STYLE = os.environ.get('MUSIC_STYLE', 'trapA')
HARD = STYLE.startswith('trap')
# stereo; the drop lands on the logo hit, the stinger on "Own"
music = (make_trap if HARD else make_music)(TOTAL, T['B1'] + 0.38, wt('close', 3), STYLE)
# A finished track can replace the synthesized one: MUSIC_FILE=path MUSIC_START=seconds-into-the-track (to line its
# drop up with the logo reveal at T['B1'] + 0.38, set MUSIC_START to (drop time in the track) - that moment).
if os.environ.get('MUSIC_FILE'):
    import subprocess, tempfile
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.environ['MUSIC_FILE'], '-ar', str(SR), '-ac', '2', tmp], check=True)
    ext, _ = sf.read(tmp); os.remove(tmp)
    a = int(float(os.environ.get('MUSIC_START', '0')) * SR)
    seg = ext[a:a + N]
    music = np.zeros((N, 2)); music[:len(seg)] = seg
    fade = np.ones(N); f0 = int((TOTAL - 1.3) * SR); fade[f0:] = np.linspace(1, 0, N - f0); music *= fade[:, None]
    music /= max(1e-6, np.abs(music).max()); HARD = True

# duck the music under the voice
env = np.abs(vo); k = int(0.12 * SR)
env = np.convolve(env, np.ones(k) / k, mode='same'); env = lp(env, 6); env = np.clip(env / (np.percentile(env, 97) + 1e-9), 0, 1)
duck = 1 - (0.38 if HARD else 0.5) * env
# set the music's level from the voice: about 11 dB under the speech when nobody is talking, ducked a few dB more under it
active = np.abs(vo) > 0.05; vo_rms = np.sqrt((vo[active] ** 2).mean())
m_rms = np.sqrt((music[int(T['B1'] * SR):] ** 2).mean())
music = music * ((0.42 if HARD else 0.28) * vo_rms / m_rms) * duck[:, None]
# the logo-hit impact and the sfx stay un-ducked
sfx *= 0.9 / np.abs(sfx).max() if np.abs(sfx).max() > 0.9 else 1
print('peaks vo %.2f music %.2f sfx %.2f' % (np.abs(vo).max(), np.abs(music).max(), np.abs(sfx).max()))
mix = np.stack([vo, vo], 1) * 0.95 + music + np.stack([sfx, sfx], 1) * 0.75
mix *= 0.8 / np.abs(mix).max()   # headroom; loudness is normalized when encoding
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out/audio.wav'), mix, SR)
print('audio ok', round(TOTAL, 2), 'peak', round(float(np.abs(mix).max()), 2))
