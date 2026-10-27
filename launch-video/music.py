"""Original upbeat track (120 BPM, A minor): intro build into a drop on the logo reveal, then a sidechained groove with
warm keys, bass, soft shaker/clap and a simple melody; ends on a stinger. Everything is synthesized here, so there is
no licensing to worry about. Voices are deliberately round (sines and low-passed tones, no bright saws or cymbals) so
nothing sounds harsh. make_music() returns a stereo array."""
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
S16 = BEAT / 4
note = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def _f(x, kind, f, order=2):
    nyq = SR / 2
    if kind == 'bp': b, a = butter(order, [f[0] / nyq, min(f[1], nyq - 100) / nyq], btype='band')
    else: b, a = butter(order, min(f, nyq - 100) / nyq, btype=kind)
    return lfilter(b, a, x)


def make_music(total, t_drop, t_hit, seed=11):
    rng = np.random.default_rng(seed)
    N = int(total * SR)
    tt = lambda d: np.arange(int(d * SR)) / SR
    g0 = t_drop % BAR
    bus = {k: np.zeros((N, 2)) for k in ('sc', 'dry', 'rev')}

    def put(name, t, x, gl=1.0, gr=None):
        gr = gl if gr is None else gr
        a = int(t * SR)
        if a >= N or a + len(x) <= 0: return
        if a < 0: x = x[-a:]; a = 0
        x = x[: N - a]
        bus[name][a:a + len(x), 0] += x * gl; bus[name][a:a + len(x), 1] += x * gr

    def tone(f, d, harm=(1.0, 0.4, 0.15), det=0.0):
        u = tt(d); x = np.zeros_like(u)
        for k, a in enumerate(harm, 1):
            if f * k < 5000: x += a * np.sin(2 * np.pi * f * (1 + det) * k * u)
        return x

    def kick(t, g=1.0):
        u = tt(0.4)
        body = np.sin(2 * np.pi * np.cumsum(46 + 95 * np.exp(-u * 34)) / SR) * np.exp(-u * 8.5)
        put('dry', t, _f(body, 'lowpass', 4000) * g)
    def clap(t, g=1.0):
        u = tt(0.25); env = np.exp(-u * 26) + 0.6 * np.exp(-np.clip(u - 0.012, 0, None) * 60) * (u >= 0.012)
        x = _f(rng.standard_normal(len(u)), 'bp', (700, 2600)) * env
        put('dry', t, x * 0.30 * g); put('rev', t, x * 0.12 * g)
    def shaker(t, g=1.0, pan=0.5):
        u = tt(0.05); x = _f(rng.standard_normal(len(u)), 'bp', (4000, 8000)) * np.exp(-u * 60) * np.minimum(1, u / 0.004)
        put('dry', t, x * 0.12 * g, 1 - 0.4 * pan, 0.6 + 0.4 * pan)
    def bass(t, m, d, g=1.0):
        u = tt(d); x = np.sin(2 * np.pi * note(m) * u) + 0.35 * np.sin(2 * np.pi * 2 * note(m) * u) + 0.12 * np.sin(2 * np.pi * 3 * note(m) * u)
        x = _f(x, 'lowpass', 600) * np.minimum(1, u / 0.008) * np.exp(-u * 3.2) * np.minimum(1, (d - u) / 0.03)
        put('sc', t, x * g * 0.32)
    def keys(t, notes, d=0.5, g=1.0):
        u = tt(d); x = np.zeros_like(u)
        for m in notes:
            for det in (-0.0025, 0.0025): x += tone(note(m), d, (1.0, 0.38, 0.12, 0.05), det)
        x = _f(x, 'lowpass', 3200) * np.minimum(1, u / 0.004) * np.exp(-u * 6.5)
        put('sc', t, x * g * 0.085, 1.0, 0.85); put('sc', t + 0.012, x * g * 0.085, 0.85, 1.0); put('rev', t, x * g * 0.02)
    def pad(t, d, notes, g=1.0):
        u = tt(d); x = np.zeros_like(u)
        for m in notes:
            for det in (-0.004, 0.004): x += tone(note(m), d, (1.0, 0.25, 0.08), det)
        env = np.minimum(1, u / 0.8) * np.minimum(1, (d - u) / 0.9)
        x = _f(x, 'lowpass', 1100) * env
        put('sc', t, x * g * 0.011, 1.0, 0.85); put('sc', t + 0.02, x * g * 0.011, 0.85, 1.0)
    def melody(t, m, d=0.34, g=1.0, pan=0.5):
        u = tt(d); x = tone(note(m), d, (1.0, 0.22, 0.06)) * np.exp(-u * 7.5) * np.minimum(1, u / 0.004)
        x = _f(x, 'lowpass', 4000)
        put('dry', t, x * g * 0.14, 1 - 0.5 * pan, 0.5 + 0.5 * pan); put('rev', t, x * g * 0.03)
        put('dry', t + BEAT * 0.75, _f(x, 'lowpass', 1800) * g * 0.14 * 0.22, 0.4 + 0.4 * pan, 1 - 0.4 * pan)  # one soft echo
    def riser(t0, t1, g=1.0):
        d = t1 - t0; u = tt(d) / d; x = _f(rng.standard_normal(len(u)), 'bp', (250, 3200)) * (u ** 2.0)
        put('dry', t0, x * 0.10 * g); put('rev', t0, x * 0.05 * g)
    def snare(t, g=1.0):
        u = tt(0.16); x = _f(rng.standard_normal(len(u)), 'bp', (900, 3500)) * np.exp(-u * 30) + np.sin(2 * np.pi * 185 * u) * np.exp(-u * 32) * 0.5
        put('dry', t, x * 0.20 * g); put('rev', t, x * 0.08 * g)

    prog = [
        dict(root=45, keys=[57, 60, 64], mel=[69, 72, 76, 72], pad=[57, 60, 64]),
        dict(root=41, keys=[57, 60, 65], mel=[69, 72, 77, 72], pad=[53, 57, 60]),
        dict(root=48, keys=[55, 60, 64], mel=[67, 72, 76, 72], pad=[55, 60, 64]),
        dict(root=43, keys=[55, 59, 62], mel=[67, 71, 74, 71], pad=[55, 59, 62]),
    ]

    # ---- intro: a held chord, soft shaker, a gentle riser and a snare roll into the drop ----
    pad(0.0, t_drop - 0.05, prog[0]['pad'], 1.8)
    t = g0
    while t < t_drop - 0.01:
        if t >= g0 + BAR: shaker(t, 0.8); shaker(t + BEAT / 2, 1.0)
        t += BEAT
    riser(t_drop - 2.4, t_drop)
    for k in range(8): snare(t_drop - BEAT + k * (BEAT / 8), 0.35 + 0.65 * k / 7)

    # ---- groove ----
    sc_hits = []
    for b in range(int((t_hit - t_drop) / BAR) + 2):
        tb = t_drop + b * BAR
        if tb >= t_hit - 0.02: break
        ch = prog[b % 4]
        pad(tb, BAR + 0.2, ch['pad'])
        for s in range(16):
            ts = tb + s * S16
            if ts >= t_hit - 0.02: break
            if s % 4 == 0: kick(ts); sc_hits.append(ts)
            if s in (4, 12): clap(ts)
            shaker(ts, 1.0 if s % 4 == 2 else (0.55 if s % 2 == 0 else 0.3), pan=(s % 8) / 7)
            if s in (2, 6, 10, 14): bass(ts, ch['root'] + (12 if s == 14 else 0), BEAT * 0.42)
            if s in (3, 6, 10, 13): keys(ts, [n + 12 for n in ch['keys']], g=1.0 if s != 13 else 0.8)
            # melody from the model-picker scene onward: one note per 8th, a simple repeating contour
            if tb >= 12.0 and s % 2 == 0:
                idx = [0, 1, 2, 1, 0, 1, 3, 2][(s // 2) % 8]
                melody(ts, ch['mel'][idx % 4] + (12 if tb >= 28.0 and s % 8 == 6 else 0), g=1.0 if s % 8 == 0 else 0.8, pan=(s % 8) / 7)
        if b % 4 == 3 and tb + 3.5 * BEAT < t_hit:
            for k in range(4): snare(tb + 3.5 * BEAT + k * (S16 / 2), 0.3 + 0.1 * k)

    # ---- final stinger on the closing line: a warm major chord and a soft low boom ----
    kick(t_hit); sc_hits.append(t_hit)
    for m, d in ((48, 2.6), (60, 2.2), (64, 2.2), (67, 2.2), (72, 2.0)):
        pad(t_hit, d, [m], 5.0)
    keys(t_hit, [60, 64, 67, 72], d=1.8, g=3.2)
    u = tt(1.3); put('dry', t_hit, np.sin(2 * np.pi * (58 - 18 * (1 - np.exp(-u * 6))) * u) * np.exp(-u * 3.2) * 0.7)

    # sidechain pump on bass, keys and pad
    sc = np.ones(N)
    for tk in sc_hits:
        a = int(tk * SR); n = min(int(0.32 * SR), N - a)
        if n > 0: sc[a:a + n] = np.minimum(sc[a:a + n], 1 - 0.78 * np.exp(-np.arange(n) / SR / 0.1))
    pumped = bus['sc'] * sc[:, None]

    # a dark, short reverb
    u = np.arange(int(1.2 * SR)) / SR
    ir = _f(_f(rng.standard_normal(len(u)), 'highpass', 300), 'lowpass', 3000) * np.exp(-u * 4.2); ir[0] = 0
    wet = np.stack([fftconvolve(bus['rev'][:, c], ir)[:N] for c in range(2)], 1)
    wet[:, 1] = np.roll(wet[:, 1], int(0.011 * SR))
    mix = pumped + bus['dry'] + wet * 0.5
    mix = np.stack([_f(mix[:, c], 'lowpass', 9000) for c in range(2)], 1)   # take the fizz off the top
    mix = np.tanh(mix * 0.9)
    fade = np.ones(N); f0 = int((total - 1.3) * SR); fade[f0:] = np.linspace(1, 0, N - f0)
    mix *= fade[:, None]
    return mix / max(1e-6, np.abs(mix).max())
