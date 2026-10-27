"""Original upbeat track (120 BPM, A minor): intro build into a drop on the logo reveal, then a sidechained groove with
stabs, bass, hats, claps and an arpeggio lead; ends on a stinger. Everything is synthesized here, so there is no
licensing to worry about. make_music() returns a stereo array."""
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
S16 = BEAT / 4
note = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def _bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype='band'); return lfilter(b, a, x)
def _lp(x, f, order=2):
    b, a = butter(order, min(f, SR / 2 - 100) / (SR / 2), btype='low'); return lfilter(b, a, x)
def _hp(x, f, order=2):
    b, a = butter(order, f / (SR / 2), btype='high'); return lfilter(b, a, x)


def make_music(total, t_drop, t_hit, seed=11):
    rng = np.random.default_rng(seed)
    N = int(total * SR)
    tt = lambda d: np.arange(int(d * SR)) / SR
    g0 = t_drop % BAR            # grid origin: a bar line falls exactly on the drop
    bus = {k: np.zeros((N, 2)) for k in ('sc', 'dry', 'rev')}   # sc: sidechained, dry: punchy, rev: reverb send

    def put(name, t, x, gl=1.0, gr=None):
        gr = gl if gr is None else gr
        a = int(t * SR)
        if a >= N or a + len(x) <= 0: return
        if a < 0: x = x[-a:]; a = 0
        x = x[: N - a]
        bus[name][a:a + len(x), 0] += x * gl; bus[name][a:a + len(x), 1] += x * gr

    # ---- voices ----
    def saw(f, d, h=14, det=0.0):
        u = tt(d); x = np.zeros_like(u)
        for k in range(1, h + 1):
            if f * k * (1 + det) < SR / 2 - 1000: x += np.sin(2 * np.pi * f * (1 + det) * k * u + k) / k
        return x
    def kick(t, g=1.0):
        u = tt(0.4); body = np.sin(2 * np.pi * np.cumsum(46 + 110 * np.exp(-u * 38)) / SR) * np.exp(-u * 9)
        click = _hp(rng.standard_normal(len(u)), 2500) * np.exp(-u * 160) * 0.18
        put('dry', t, (body + click) * g)
    def clap(t, g=1.0):
        u = tt(0.35); env = np.zeros_like(u)
        for off in (0, 0.011, 0.023): env += np.exp(-np.clip(u - off, 0, None) * 300) * (u >= off)
        env += np.exp(-u * 18) * 0.35
        x = _bp(rng.standard_normal(len(u)), 900, 3800) * env
        put('dry', t, x * 0.5 * g); put('rev', t, x * 0.5 * g)
    def hat(t, g=1.0, open_=False):
        d = 0.16 if open_ else 0.045; u = tt(d)
        x = _hp(rng.standard_normal(len(u)), 7000) * np.exp(-u * (22 if open_ else 95))
        put('dry', t, x * g * 0.30, 0.9 * (1 if open_ else 0.7), 0.7 * (1 if open_ else 0.9))
    def bass(t, m, d, g=1.0):
        x = _lp(saw(note(m), d, 10), 700) * 0.55 + np.sin(2 * np.pi * note(m) * tt(d)) * 0.9
        u = tt(d); x *= np.minimum(1, u / 0.006) * np.exp(-u * 4.5) * np.minimum(1, (d - u) / 0.02)
        put('sc', t, x * g * 0.55)
    def stab(t, notes, d=0.26, g=1.0):
        u = tt(d); x = np.zeros_like(u)
        for m in notes:
            for det, pan in ((-0.006, 0), (0.006, 1)):
                x += saw(note(m), d, 9, det) * (1 if pan == 0 else 1)
        x = _lp(x, 3400) * np.exp(-u * 11) * np.minimum(1, u / 0.003)
        put('sc', t, x * g * 0.050, 1.0, 0.8); put('sc', t + 0.013, x * g * 0.050, 0.8, 1.0)
        put('rev', t, x * g * 0.03)
    def pad(t, d, notes, g=1.0, cutoff=1400):
        u = tt(d); x = np.zeros_like(u)
        for m in notes:
            for det in (-0.007, 0.007): x += saw(note(m), d, 8, det)
        env = np.minimum(1, u / 0.7) * np.minimum(1, (d - u) / 0.8)
        put('sc', t, _lp(x, cutoff) * env * g * 0.020, 1.0, 0.85); put('sc', t + 0.02, _lp(x, cutoff) * env * g * 0.020, 0.85, 1.0)
    def pluck(t, m, g=1.0, pan=0.5):
        d = 0.3; u = tt(d); f = note(m)
        x = (np.sin(2 * np.pi * f * u) + 0.42 * np.sin(2 * np.pi * 2 * f * u) + 0.2 * np.sin(2 * np.pi * 3 * f * u) + 0.08 * np.sin(2 * np.pi * 5 * f * u)) * np.exp(-u * 14) * np.minimum(1, u / 0.002)
        put('dry', t, x * g * 0.11, 1 - pan * 0.6, 0.4 + pan * 0.6); put('rev', t, x * g * 0.08)
        # dotted-eighth ping-pong delay
        for k in range(1, 4):
            put('dry', t + k * BEAT * 0.75, x * g * 0.11 * 0.45 ** k, (0.2 if k % 2 else 1.0), (1.0 if k % 2 else 0.2))
    def riser(t0, t1, g=1.0):
        d = t1 - t0; u = tt(d) / d; n = rng.standard_normal(len(u))
        x = _bp(n, 400, 11000, 2) * (u ** 2.4)
        put('dry', t0, x * 0.22 * g); put('rev', t0, x * 0.1 * g)
    def snare(t, g=1.0):
        u = tt(0.2); x = (_bp(rng.standard_normal(len(u)), 1500, 8000) * np.exp(-u * 28) + np.sin(2 * np.pi * 190 * u) * np.exp(-u * 30) * 0.5)
        put('dry', t, x * 0.35 * g); put('rev', t, x * 0.2 * g)
    def crash(t, g=1.0):
        d = 1.8; u = tt(d); x = _hp(rng.standard_normal(len(u)), 4500) * np.exp(-u * 2.2)
        put('dry', t, x * 0.3 * g); put('rev', t, x * 0.15 * g)

    # ---- progression: Am | F | C | G, one bar each ----
    prog = [
        dict(root=45, stab=[57, 60, 64], arp=[69, 72, 76, 81], pad=[57, 60, 64]),
        dict(root=41, stab=[57, 60, 65], arp=[65, 69, 72, 77], pad=[53, 57, 60]),
        dict(root=48, stab=[55, 60, 64], arp=[67, 72, 76, 79], pad=[55, 60, 64]),
        dict(root=43, stab=[55, 59, 62], arp=[67, 71, 74, 79], pad=[55, 59, 62]),
    ]
    bar_idx = lambda t: int(round((t - g0) / BAR))

    # ---- intro: a held chord opening up, hats arriving, a riser and a snare roll into the drop ----
    pad(0.0, t_drop - 0.05, prog[0]['pad'], 1.6, cutoff=900)
    t = g0
    while t < t_drop - 0.01:
        if t >= g0 + BAR: hat(t, 0.5); hat(t + BEAT / 2, 0.7, True)
        t += BEAT
    riser(t_drop - 2.6, t_drop)
    for k in range(8): snare(t_drop - BEAT + k * (BEAT / 8), 0.35 + 0.65 * k / 7)
    crash(t_drop)

    # ---- the groove ----
    sc_hits = []
    n_bars = int((t_hit - t_drop) / BAR) + 2
    for b in range(n_bars):
        tb = t_drop + b * BAR
        if tb >= t_hit - 0.02: break
        ch = prog[b % 4]
        sec = tb
        pad(tb, BAR + 0.15, ch['pad'], 1.0)
        for s in range(16):
            ts = tb + s * S16
            if ts >= t_hit - 0.02: break
            if s % 4 == 0: kick(ts, 1.0); sc_hits.append(ts)
            if s in (4, 12): clap(ts)
            if s % 2 == 0 and s % 4 != 2: pass
            if s in (2, 6, 10, 14): hat(ts, 0.7, True)
            else: hat(ts, 0.35 if s % 4 else 0.5)
            if s in (2, 6, 10, 14): bass(ts, ch['root'] + (12 if s == 14 else 0), BEAT * 0.45)
            if s in (3, 6, 10, 13): stab(ts, ch['stab'], g=1.0 if s != 13 else 0.8)
            # lead from the models scene on, an octave up for the final stretch
            if tb >= 12.0 and s % 1 == 0 and (s % 2 == 0 or tb >= 28.0):
                idx = [0, 1, 2, 1, 0, 1, 2, 3][s % 8]
                m = ch['arp'][idx] + (12 if tb >= 28.0 and s % 4 == 3 else 0)
                pluck(ts, m, 0.8 + 0.25 * (s % 4 == 0), pan=(s % 4) / 3)
        # a small fill into every 4th bar
        if b % 4 == 3 and tb + 3.5 * BEAT < t_hit:
            for k in range(4): snare(tb + 3.5 * BEAT + k * (S16 / 2) * 1.0, 0.3 + 0.1 * k)
    # ---- final stinger on the closing line ----
    kick(t_hit, 1.0); sc_hits.append(t_hit); crash(t_hit, 1.1)
    for m, d in ((48, 2.4), (60, 2.0), (64, 2.0), (67, 2.0), (72, 1.8), (76, 1.6)):
        pad(t_hit, d, [m], 4.2, cutoff=3500)
    stab(t_hit, [60, 64, 67, 72], d=1.4, g=3.0)
    put('dry', t_hit, np.sin(2 * np.pi * (60 - 20 * (1 - np.exp(-tt(1.2) * 6))) * tt(1.2)) * np.exp(-tt(1.2) * 3) * 0.8)

    # ---- sidechain pump on the bass, stabs and pads ----
    sc = np.ones(N)
    for tk in sc_hits:
        a = int(tk * SR); n = min(int(0.32 * SR), N - a)
        if n > 0: sc[a:a + n] = np.minimum(sc[a:a + n], 1 - 0.86 * np.exp(-np.arange(n) / SR / 0.1))
    pumped = bus['sc'] * sc[:, None]

    # ---- reverb send ----
    d = 1.5; u = np.arange(int(d * SR)) / SR
    ir = _hp(rng.standard_normal(len(u)), 400) * np.exp(-u * 3.4); ir[0] = 0
    wet = np.stack([fftconvolve(bus['rev'][:, c], ir)[:N] * (0.5 if c == 0 else 0.5) for c in range(2)], 1)
    wet[:, 1] = np.roll(wet[:, 1], int(0.013 * SR))
    mix = pumped + bus['dry'] + wet * 0.55
    # gentle bus glue, then fade out under the last tail
    mix = np.tanh(mix * 0.9)
    fade = np.ones(N); f0 = int((total - 1.3) * SR); fade[f0:] = np.linspace(1, 0, N - f0)
    mix *= fade[:, None]
    return mix / max(1e-6, np.abs(mix).max())
