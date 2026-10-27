"""Original upbeat tracks, synthesized here so there is nothing to license. Each style shares one arrangement:
an intro build, a drop on the logo reveal, a groove that gains a melody at the model-picker scene and lifts for the
last stretch, and a stinger on the closing line. Voices are round (sines, low-passed tones, plucked strings), with no
bright saws or cymbals. make_music(total, t_drop, t_hit, style) returns a stereo array."""
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve

SR = 44100
note = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def _f(x, kind, f, order=2):
    nyq = SR / 2
    if kind == 'bp': b, a = butter(order, [f[0] / nyq, min(f[1], nyq - 100) / nyq], btype='band')
    else: b, a = butter(order, min(f, nyq - 100) / nyq, btype=kind)
    return lfilter(b, a, x)


# Chords are (bass root, key voicing, melody tones, pad voicing), one bar each, looping every four bars
def C(root, keys, mel, pad): return dict(root=root, keys=keys, mel=mel, pad=pad)

STYLES = {
    # 1  steady groove: electric-piano stabs over a punchy kick, A minor
    'pulse': dict(bpm=120, keys='ep', keys_mode='stab', keys_pos=(3, 6, 10, 13), keys_oct=12, mel='ep', kick=(0, 4, 8, 12), clap=(4, 12),
                  bass_pos=(2, 6, 10, 14), shaker=True, drive=0.78,
                  prog=[C(45, [57, 60, 64], [69, 72, 76, 72], [57, 60, 64]), C(41, [57, 60, 65], [69, 72, 77, 72], [53, 57, 60]),
                        C(48, [55, 60, 64], [67, 72, 76, 72], [55, 60, 64]), C(43, [55, 59, 62], [67, 71, 74, 71], [55, 59, 62])]),
    # 2  bright and sunny: fingerpicked guitar and marimba, C major
    'sunrise': dict(bpm=124, keys='pluck', keys_mode='arp', keys_pos=tuple(range(0, 16, 2)), keys_oct=0, mel='marimba', kick=(0, 4, 8, 12), clap=(4, 12),
                    bass_pos=(0, 3, 6, 10, 12), shaker=True, drive=0.6,
                    prog=[C(48, [48, 55, 60, 64], [72, 76, 79, 76], [55, 60, 64]), C(43, [47, 55, 59, 62], [74, 79, 83, 79], [55, 59, 62]),
                          C(45, [45, 52, 57, 60], [72, 76, 81, 76], [57, 60, 64]), C(41, [45, 53, 57, 60], [72, 77, 81, 77], [53, 57, 60])]),
    # 3  calm and confident: piano arpeggios, soft half-time drums, F major
    'piano': dict(bpm=110, keys='piano', keys_mode='arp', keys_pos=tuple(range(0, 16, 2)), keys_oct=0, mel='piano', kick=(0, 8), clap=(4, 12),
                  bass_pos=(0, 6, 8, 14), shaker=False, drive=0.35,
                  prog=[C(41, [53, 57, 60, 65], [72, 77, 81, 77], [53, 57, 60]), C(36, [52, 55, 60, 64], [72, 76, 79, 76], [52, 55, 60]),
                        C(38, [50, 57, 62, 65], [74, 77, 81, 77], [50, 57, 62]), C(46, [50, 53, 58, 62], [74, 77, 82, 77], [50, 53, 58])]),
    # 4  driving and modern: four-on-the-floor, pumping sub bass, sparse plucks, D minor
    'drive': dict(bpm=128, keys='ep', keys_mode='stab', keys_pos=(3, 7, 11, 14), keys_oct=12, mel='pluck', kick=(0, 4, 8, 12), clap=(4, 12),
                  bass_pos=(2, 6, 10, 14), shaker=True, drive=0.9,
                  prog=[C(38, [53, 57, 62], [74, 77, 81, 77], [50, 53, 57]), C(34, [53, 58, 62], [74, 77, 82, 77], [50, 53, 58]),
                        C(41, [53, 57, 60], [72, 77, 81, 77], [53, 57, 60]), C(36, [55, 60, 64], [72, 76, 79, 76], [55, 60, 64])]),
}


def make_music(total, t_drop, t_hit, style='pulse', seed=11):
    S = STYLES[style]
    BEAT = 60 / S['bpm']; BAR = BEAT * 4; S16 = BEAT / 4
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

    # ---------- drums ----------
    def kick(t, g=1.0):
        u = tt(0.4); body = np.sin(2 * np.pi * np.cumsum(46 + 95 * np.exp(-u * 34)) / SR) * np.exp(-u * 8.5)
        put('dry', t, _f(body, 'lowpass', 4000) * g)
    def clap(t, g=1.0):
        u = tt(0.25); env = np.exp(-u * 26) + 0.6 * np.exp(-np.clip(u - 0.012, 0, None) * 60) * (u >= 0.012)
        x = _f(rng.standard_normal(len(u)), 'bp', (700, 2600)) * env
        put('dry', t, x * 0.30 * g); put('rev', t, x * 0.12 * g)
    def shaker(t, g=1.0, pan=0.5):
        u = tt(0.05); x = _f(rng.standard_normal(len(u)), 'bp', (4000, 8000)) * np.exp(-u * 60) * np.minimum(1, u / 0.004)
        put('dry', t, x * 0.12 * g, 1 - 0.4 * pan, 0.6 + 0.4 * pan)
    def snare(t, g=1.0):
        u = tt(0.16); x = _f(rng.standard_normal(len(u)), 'bp', (900, 3500)) * np.exp(-u * 30) + np.sin(2 * np.pi * 185 * u) * np.exp(-u * 32) * 0.5
        put('dry', t, x * 0.20 * g); put('rev', t, x * 0.08 * g)
    def riser(t0, t1):
        d = t1 - t0; u = tt(d) / d; x = _f(rng.standard_normal(len(u)), 'bp', (250, 3200)) * (u ** 2.0)
        put('dry', t0, x * 0.10); put('rev', t0, x * 0.05)

    # ---------- bass, pad ----------
    def bass(t, m, d, g=1.0):
        u = tt(d); x = np.sin(2 * np.pi * note(m) * u) + 0.35 * np.sin(2 * np.pi * 2 * note(m) * u) + 0.12 * np.sin(2 * np.pi * 3 * note(m) * u)
        x = _f(x, 'lowpass', 600) * np.minimum(1, u / 0.008) * np.exp(-u * 3.2) * np.minimum(1, (d - u) / 0.03)
        put('sc', t, x * g * 0.32)
    def pad(t, d, notes, g=1.0):
        u = tt(d); x = np.zeros_like(u)
        for m in notes:
            for det in (-0.004, 0.004): x += tone(note(m), d, (1.0, 0.25, 0.08), det)
        env = np.minimum(1, u / 0.8) * np.minimum(1, (d - u) / 0.9)
        x = _f(x, 'lowpass', 1100) * env
        put('sc', t, x * g * 0.011, 1.0, 0.85); put('sc', t + 0.02, x * g * 0.011, 0.85, 1.0)

    # ---------- melodic voices: each returns a mono waveform ----------
    def v_ep(m, d):
        u = tt(d); x = np.zeros_like(u)
        for det in (-0.0025, 0.0025): x += tone(note(m), d, (1.0, 0.38, 0.12, 0.05), det)
        return _f(x, 'lowpass', 3200) * np.minimum(1, u / 0.004) * np.exp(-u * 6.5)
    def v_pluck(m, d):                      # Karplus-Strong string: a warm plucked-guitar tone
        f = note(m); P = int(round(SR / f)); n = int(d * SR)
        x = np.zeros(n); x[:P] = rng.uniform(-1, 1, P)
        a = np.zeros(P + 2); a[0] = 1; a[P] = -0.5 * 0.996; a[P + 1] = -0.5 * 0.996
        y = lfilter([1.0], a, x)
        return _f(y, 'lowpass', 3000) * np.minimum(1, tt(d) / 0.002) * np.minimum(1, (d - tt(d)) / 0.05)
    def v_piano(m, d):
        u = tt(d); f = note(m); x = np.zeros_like(u)
        for k, (a, dec) in enumerate(((1.0, 2.4), (0.55, 3.6), (0.32, 5.0), (0.16, 7.0), (0.08, 9.0)), 1):
            if f * k < 4500: x += a * np.sin(2 * np.pi * f * k * (1 + 0.00015 * k * k) * u) * np.exp(-u * dec)
        thump = _f(rng.standard_normal(len(u)), 'lowpass', 900) * np.exp(-u * 90) * 0.08
        return _f(x + thump, 'lowpass', 3600) * np.minimum(1, u / 0.003)
    def v_marimba(m, d):
        u = tt(d); f = note(m)
        x = np.sin(2 * np.pi * f * u) * np.exp(-u * 8) + 0.35 * np.sin(2 * np.pi * 4 * f * u) * np.exp(-u * 26) + 0.1 * np.sin(2 * np.pi * 9.2 * f * u) * np.exp(-u * 55)
        return _f(x, 'lowpass', 4500) * np.minimum(1, u / 0.002)
    VOICE = dict(ep=v_ep, pluck=v_pluck, piano=v_piano, marimba=v_marimba)

    def play_keys(t, notes, g=1.0, d=0.5):
        x = sum(VOICE[S['keys']](m, d) for m in notes)
        sc = S['keys'] == 'ep'              # stabs pump with the kick; plucked and piano parts stay natural
        put('sc' if sc else 'dry', t, x * g * (0.085 if sc else 0.060 / max(1, len(notes)) ** 0.5), 1.0, 0.85)
        put('sc' if sc else 'dry', t + 0.012, x * g * (0.085 if sc else 0.060 / max(1, len(notes)) ** 0.5), 0.85, 1.0)
        put('rev', t, x * g * 0.02)
    def play_mel(t, m, g=1.0, pan=0.5, d=0.45):
        x = VOICE[S['mel']](m, d)
        put('dry', t, x * g * 0.12, 1 - 0.5 * pan, 0.5 + 0.5 * pan); put('rev', t, x * g * 0.04)
        put('dry', t + BEAT * 0.75, _f(x, 'lowpass', 1800) * g * 0.12 * 0.22, 0.4 + 0.4 * pan, 1 - 0.4 * pan)

    prog = S['prog']
    # ---------- intro ----------
    pad(0.0, t_drop - 0.05, prog[0]['pad'], 1.8)
    t = g0
    while t < t_drop - 0.01:
        if t >= g0 + BAR and S['shaker']: shaker(t, 0.8); shaker(t + BEAT / 2, 1.0)
        t += BEAT
    riser(t_drop - 2.4, t_drop)
    for k in range(8): snare(t_drop - BEAT + k * (BEAT / 8), 0.35 + 0.65 * k / 7)

    # ---------- groove ----------
    sc_hits = []
    for b in range(int((t_hit - t_drop) / BAR) + 2):
        tb = t_drop + b * BAR
        if tb >= t_hit - 0.02: break
        ch = prog[b % 4]
        pad(tb, BAR + 0.2, ch['pad'])
        for s in range(16):
            ts = tb + s * S16
            if ts >= t_hit - 0.02: break
            if s in S['kick']: kick(ts); sc_hits.append(ts)
            if s in S['clap']: clap(ts)
            if S['shaker']: shaker(ts, 1.0 if s % 4 == 2 else (0.55 if s % 2 == 0 else 0.3), pan=(s % 8) / 7)
            if s in S['bass_pos']: bass(ts, ch['root'] + (12 if s == S['bass_pos'][-1] else 0), BEAT * 0.42)
            if s in S['keys_pos']:
                if S['keys_mode'] == 'stab': play_keys(ts, [n + S['keys_oct'] for n in ch['keys']], 1.0 if s != 13 else 0.8)
                else:                       # arpeggio: walk up and back down through the chord
                    k = ch['keys']; i = (s // 2) % 8; seq = [0, 1, 2, 3, 2, 1, 2, 1]
                    play_keys(ts, [k[seq[i] % len(k)]], 1.0 if i % 4 == 0 else 0.8, d=0.7)
            if tb >= 12.0 and s % 2 == 0 and (S['keys_mode'] == 'stab' or s % 4 == 2):
                idx = [0, 1, 2, 1, 0, 1, 3, 2][(s // 2) % 8]
                play_mel(ts, ch['mel'][idx % 4] + (12 if tb >= 28.0 and s % 8 == 6 else 0), 1.0 if s % 8 == 0 else 0.8, pan=(s % 8) / 7)
        if b % 4 == 3 and tb + 3.5 * BEAT < t_hit:
            for k in range(4): snare(tb + 3.5 * BEAT + k * (S16 / 2), 0.3 + 0.1 * k)

    # ---------- stinger ----------
    kick(t_hit); sc_hits.append(t_hit)
    root = prog[0]['root']
    for m, d in ((root, 2.6), (root + 12, 2.2), (root + 16, 2.2), (root + 19, 2.2), (root + 24, 2.0)): pad(t_hit, d, [m], 5.0)
    x = sum(VOICE['ep'](m, 1.8) for m in (root + 12, root + 16, root + 19, root + 24)); put('dry', t_hit, x * 0.05); put('rev', t_hit, x * 0.03)
    u = tt(1.3); put('dry', t_hit, np.sin(2 * np.pi * (58 - 18 * (1 - np.exp(-u * 6))) * u) * np.exp(-u * 3.2) * 0.7)

    sc = np.ones(N)
    for tk in sc_hits:
        a = int(tk * SR); n = min(int(0.32 * SR), N - a)
        if n > 0: sc[a:a + n] = np.minimum(sc[a:a + n], 1 - S['drive'] * np.exp(-np.arange(n) / SR / 0.1))
    pumped = bus['sc'] * sc[:, None]

    u = np.arange(int(1.2 * SR)) / SR
    ir = _f(_f(rng.standard_normal(len(u)), 'highpass', 300), 'lowpass', 3000) * np.exp(-u * 4.2); ir[0] = 0
    wet = np.stack([fftconvolve(bus['rev'][:, c], ir)[:N] for c in range(2)], 1)
    wet[:, 1] = np.roll(wet[:, 1], int(0.011 * SR))
    mix = pumped + bus['dry'] + wet * 0.5
    mix = np.stack([_f(mix[:, c], 'lowpass', 9000) for c in range(2)], 1)
    mix = np.tanh(mix * 0.9)
    fade = np.ones(N); f0 = int((total - 1.3) * SR); fade[f0:] = np.linspace(1, 0, N - f0)
    mix *= fade[:, None]
    return mix / max(1e-6, np.abs(mix).max())
