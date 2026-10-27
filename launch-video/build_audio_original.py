"""The original soundtrack (the cut from commit 04f29b0), kept as its own script. Env: KEEP_PLUCK=1 keeps the
plucked arpeggio (the xylophone-like line); MUSIC_DB lowers the remaining music (pad, bass, kick, hats) in dB.
Writes out/audio_original.wav.

Mixes out/audio.wav: the voiceover, a synthesized music bed (ducked under the voice) and UI sound effects.
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
    highb = bp(n, 1800, 7000) * np.sin(np.pi * np.clip((u - 0.15) * 1.3, 0, 1)) ** 2
    put(sfx, t, (lowb * 0.9 + highb * 0.8), g)
def pop(t, f=620, g=0.16):
    d = 0.11; x = np.sin(2 * np.pi * (f + 260 * (1 - np.exp(-tt(d) * 60))) * tt(d)) * np.exp(-tt(d) * 38); put(sfx, t, x, g)
def tick(t, f=1900, g=0.09):
    d = 0.05; put(sfx, t, np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * 90), g)
def ding(t, g=0.16):
    d = 0.9; x = (np.sin(2 * np.pi * 1318 * tt(d)) + 0.5 * np.sin(2 * np.pi * 1976 * tt(d)) + 0.2 * np.sin(2 * np.pi * 2637 * tt(d))) * np.exp(-tt(d) * 5); put(sfx, t, x, g)
def thunk(t, g=0.4):
    d = 0.35; x = np.sin(2 * np.pi * (90 - 35 * (1 - np.exp(-tt(d) * 20))) * tt(d)) * np.exp(-tt(d) * 14) + lp(rng.standard_normal(int(d * SR)), 600) * np.exp(-tt(d) * 40) * 0.6; put(sfx, t, x, g)
def impact(t, g=0.5):
    d = 1.4; x = np.sin(2 * np.pi * (55 + 90 * np.exp(-tt(d) * 9)) * tt(d)) * np.exp(-tt(d) * 3.2) + lp(rng.standard_normal(int(d * SR)), 1500) * np.exp(-tt(d) * 6) * 0.35; put(sfx, t, x, g)
def riser(t0, t1, g=0.28):
    d = t1 - t0; n = rng.standard_normal(int(d * SR)); u = tt(d) / d
    put(sfx, t0, bp(n, 500, 9000) * u ** 2.2, g)
def typing(t0, t1, step=0.075):
    for t in np.arange(t0, t1, step): tick(t + rng.uniform(0, 0.02), f=rng.uniform(1500, 2400), g=0.05)

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
BPM = 104; beat = 60 / BPM; bar = beat * 4
music = np.zeros(N)
plk = np.zeros(N)   # the plucked arpeggio, kept apart so it can be dropped
note = lambda m: 440 * 2 ** ((m - 69) / 12)
chords = [[48, 55, 59, 64], [43, 50, 59, 62], [45, 52, 60, 64], [41, 48, 57, 60]]   # Cmaj7, G, Am7, Fmaj7 (voicings)
def pad(t, d, notes, g):
    x = np.zeros(int(d * SR)); u = tt(d)
    for m in notes:
        for det in (-0.004, 0.004):
            f = note(m) * (1 + det)
            for h in range(1, 7): x += np.sin(2 * np.pi * f * h * u) / h ** 1.4
    env = np.minimum(1, u / 0.5) * np.minimum(1, (d - u) / 0.7); put(music, t, lp(x, 1800) * env, g)
def pluck(t, m, g):
    d = 0.38; u = tt(d); f = note(m)
    x = (np.sin(2 * np.pi * f * u) + 0.35 * np.sin(2 * np.pi * 2 * f * u) + 0.12 * np.sin(2 * np.pi * 3 * f * u)) * np.exp(-u * 11); put(plk, t, x, g)
def bass(t, m, d, g):
    u = tt(d); x = np.sin(2 * np.pi * note(m) * u) * np.exp(-u * 3.5); put(music, t, x, g)
def kick(t, g):
    d = 0.22; u = tt(d); x = np.sin(2 * np.pi * (46 + 95 * np.exp(-u * 32)) * u) * np.exp(-u * 17); put(music, t, x, g)
def hat(t, g):
    d = 0.045; u = tt(d); x = bp(rng.standard_normal(len(u)), 6500, 12000) * np.exp(-u * 85); put(music, t, x, g)

t, ci = 0.0, 0
while t < TOTAL:
    pad(t, bar * 2 + 0.6, chords[ci % 4], 0.030); t += bar * 2; ci += 1
t_main = T['C']
t, ci = 0.0, 0
while t < TOTAL - 0.5:
    ch = chords[ci % 4]
    if t + bar * 2 > T['B2']:
        # arpeggio across the two bars of this chord, 8th notes
        for k in range(16):
            tn = t + k * beat / 2
            if tn >= T['B2'] and tn < TOTAL - 0.8:
                m = ch[[0, 1, 2, 3, 2, 1, 3, 2][k % 8]] + 24
                pluck(tn, m, 0.050 if tn < T['C'] else 0.060)
    if t + bar * 2 > t_main:
        for k in range(8):
            tn = t + k * beat
            if tn >= t_main - 0.01 and tn < TOTAL - 0.8: bass(tn, ch[0] - 12 if k % 2 == 0 else ch[0], beat * 0.9, 0.16)
    t += bar * 2; ci += 1
# drums: a soft kick on every beat from the first real scene, hats on the off-beats
tn = 0.0
while tn < TOTAL - 0.8:
    if tn >= t_main: kick(tn, 0.20 if int(round(tn / beat)) % 2 == 0 else 0.14); hat(tn + beat / 2, 0.045)
    tn += beat
kick(T['B1'] + 0.38, 0.35)

# duck the music under the voice
env = np.abs(vo); k = int(0.12 * SR)
env = np.convolve(env, np.ones(k) / k, mode='same'); env = lp(env, 6); env = np.clip(env / (np.percentile(env, 97) + 1e-9), 0, 1)
duck = 1 - 0.62 * env
k_ref = 0.55 / max(1e-6, np.abs((music + plk) * duck).max())   # the original level, set with the arpeggio in
music = (music + (plk if os.environ.get('KEEP_PLUCK') == '1' else 0)) * duck * k_ref * 10 ** (float(os.environ.get('MUSIC_DB', '0')) / 20)
sfx *= 0.9 / max(1e-6, np.abs(sfx).max()) if np.abs(sfx).max() > 0.9 else 1
fade = np.ones(N); f0 = int((TOTAL - 1.4) * SR); fade[f0:] = np.linspace(1, 0, N - f0); music *= fade
mix = vo * 0.95 + music * 0.8 + sfx * 0.75
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 0.89 / np.abs(mix).max()
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out/audio_original.wav'), np.stack([mix, mix], 1), SR)
print('audio ok', round(TOTAL, 2), 'peak', round(float(np.abs(mix).max()), 2))
