/* OpenBots launch video: a seekable GSAP timeline. window.seek(t) draws frame t; render.mjs steps through it. */
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M16 7l3 3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
  hdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16M7 16l4-4 4 4 5-6"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
const CURSOR = (c) => `<svg class="cur" viewBox="0 0 24 24"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const AV = (n, ext = 'webp') => `assets/avatars/${n}.${ext}`;

const stage = document.getElementById('stage');
const scenesEl = document.getElementById('scenes');
const subsEl = document.getElementById('subs');
const tl = gsap.timeline({ paused: true });
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

function html(str) { const d = document.createElement('div'); d.innerHTML = str.trim(); return d.firstElementChild; }
function scene(id, theme, inner) {
  const s = html(`<div class="scene ${theme}" id="${id}"><div class="cam">${inner}</div></div>`);
  scenesEl.appendChild(s);
  return s;
}
const words = (str, cls = '') => str.split(' ').map((w) => `<span class="w ${cls}">${w}</span>`).join(' ');
const popIn = (el, t, o = {}) => tl.fromTo(el, { autoAlpha: 0, y: o.y ?? 44, scale: o.s ?? 0.9, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: o.d ?? 0.42, ease: o.ease ?? 'back.out(1.5)' }, t);
const fadeUp = (el, t, o = {}) => tl.fromTo(el, { autoAlpha: 0, y: o.y ?? 24 }, { autoAlpha: 1, y: 0, duration: o.d ?? 0.4, ease: 'power3.out' }, t);
const typeText = (el, str, t, dur) => { const p = { n: 0 }; tl.fromTo(p, { n: 0 }, { n: str.length, duration: dur, ease: 'none', onUpdate() { el.textContent = str.slice(0, Math.round(p.n)); } }, t); };

function boot(timing) {
  const L = Object.fromEntries(timing.lines.map((l) => [l.id, l]));
  const wt = (id, i) => L[id].start + L[id].words[i].s;
  const lineEnd = (id) => L[id].start + L[id].dur;
  const TOTAL = timing.total;

  /* ---------- scene start times ---------- */
  const T = { A: 0, B1: L.meet.start - 0.1, B2: L.own.start - 0.12, C: L.text.start - 0.12, D: L.models.start - 0.12, E: L.local.start - 0.12, F: L.use.start - 0.12, G: L.allow.start - 0.12, H: L.setup.start - 0.12, I: L.close.start - 0.12 };
  const order = ['A', 'B1', 'B2', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const WIPE = 0.5;
  const els = {};

  /* ============ A  hook ============ */
  els.A = scene('A', 'light', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:70px">
      <div class="display" id="a1" style="display:flex;gap:.26em">${words('Your AI agent', 'g-gray')}</div>
      <div class="display" id="a2" style="display:flex;gap:.26em">${words("shouldn't live on")}</div>
      <div class="display" id="a3" style="position:relative;display:flex;gap:.26em">
        <span class="w" id="a3a">someone else's</span><span class="w" id="a3b">computer.</span>
        <i id="strike" style="position:absolute;left:-1%;top:56%;height:12px;width:102%;border-radius:6px;background:var(--primary);transform:scaleX(0);transform-origin:0 50%"></i>
      </div>
      <div class="display" id="a4" style="margin-top:6px"><span class="w g-ink">make it yours.</span></div>
    </div>`);
  {
    const s = els.A;
    const [w0, w1, w2] = $$($(s, '#a1'), '.w'); const [w3, w4, w5] = $$($(s, '#a2'), '.w');
    [[w0, 0], [w1, 1], [w2, 2], [w3, 3], [w4, 4], [w5, 5], [$(s, '#a3a'), 6], [$(s, '#a3b'), 8]].forEach(([e, i]) => popIn(e, wt('hook', i)));
    const te = lineEnd('hook') + 0.04;
    tl.to($(s, '#strike'), { scaleX: 1, duration: 0.3, ease: 'power3.inOut' }, te);
    tl.to([$(s, '#a3a'), $(s, '#a3b')], { opacity: 0.28, duration: 0.3 }, te + 0.1);
    popIn($(s, '#a4'), te + 0.22, { y: 30 });
  }

  /* ============ B1  logo sting ============ */
  const eye = (cx, cy, id) => `
    <div class="eyewrap" style="position:absolute;left:${210 + cx * 7 - 84}px;top:${210 + cy * 7 - 126}px;width:168px;height:252px;transform:rotate(-18deg)">
      <div class="eye" style="width:100%;height:100%">
        <svg viewBox="-12 -18 24 36" width="168" height="252">
          <defs>
            <radialGradient id="b${id}" cx=".3" cy=".22" r=".95"><stop offset="0" stop-color="#7d79d8"/><stop offset=".3" stop-color="#3b37a3"/><stop offset=".7" stop-color="#2a2768"/><stop offset="1" stop-color="#120f3a"/></radialGradient>
            <radialGradient id="g${id}"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
          </defs>
          <ellipse rx="9.5" ry="15" fill="url(#b${id})"/>
          <ellipse cx="-2.5" cy="-6" rx="4.5" ry="7" fill="url(#g${id})"/>
          <circle cx="-3" cy="-7.5" r="2.6" fill="#fff" fill-opacity=".92"/>
        </svg>
      </div>
    </div>`;
  const logo = (size, id) => `<div class="logo" style="position:relative;width:420px;height:420px;transform:scale(${size / 420});transform-origin:50% 50%">${eye(-12, 3, id + 'a')}${eye(12, -3, id + 'b')}</div>`;
  els.B1 = scene('B1', 'light', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding-bottom:70px">
      ${logo(400, 'x')}
      <div id="wm" style="font-size:132px;font-weight:600;letter-spacing:-0.04em;margin-top:-20px;color:#0a0a0a">OpenBots</div>
    </div>`);
  {
    const s = els.B1; const eyes = $$(s, '.eyewrap'); const t0 = T.B1 + WIPE * 0.6;
    tl.fromTo(eyes, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.09 }, t0);
    popIn($(s, '#wm'), wt('meet', 1) - 0.05, { y: 40 });
    const blink = (t) => $$(s, '.eye').forEach((e) => { tl.to(e, { scaleY: 0.12, duration: 0.07, ease: 'power2.in' }, t); tl.to(e, { scaleY: 1, duration: 0.12, ease: 'power2.out' }, t + 0.08); });
    blink(lineEnd('meet') - 0.15);
  }

  /* ============ B2  an agent you own ============ */
  els.B2 = scene('B2', 'light', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:60px">
      <div class="title" id="b1" style="display:flex;gap:.24em">${words('an agent you', '')}<span class="w g-ink">own,</span></div>
      <div class="title" id="b2" style="display:flex;gap:.24em">${words('that lives in your', 'g-gray')}<span class="w g-ink">texts.</span></div>
    </div>
    <div class="agent-chip chip-tofu" id="c1" style="left:170px;top:150px">${CURSOR('#d97706')}<img src="${AV('tofu', 'png')}"><div><b>Tofu</b><span>planning saturday</span></div></div>
    <div class="agent-chip chip-rishi" id="c2" style="right:150px;top:260px">${CURSOR('#8b5cf6')}<img src="${AV('rishi', 'png')}"><div><b>Rishi</b><span>finding a deal</span></div></div>
    <div class="agent-chip chip-mochi" id="c3" style="left:260px;top:700px">${CURSOR('#7c3aed')}<img src="${AV('mochi')}"><div><b>Mochi</b><span>checking invoices</span></div></div>`);
  {
    const s = els.B2; const a = $$($(s, '#b1'), '.w'); const b = $$($(s, '#b2'), '.w');
    [...a, ...b].forEach((e, i) => popIn(e, wt('own', i)));
    ['#c1', '#c2', '#c3'].forEach((q, i) => {
      popIn($(s, q), T.B2 + WIPE + 0.15 + i * 0.18, { y: 30, s: 0.8 });
      tl.fromTo($(s, q), { x: 0 }, { x: i % 2 ? -26 : 26, y: '+=-14', duration: 2.4, ease: 'sine.inOut' }, T.B2 + WIPE + 0.5);
    });
  }

  /* ============ phone builder ============ */
  const statusBar = `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 26px 0 30px;font-size:13px;font-weight:600"><span>9:41</span><span style="display:flex;gap:5px;align-items:center"><svg width="17" height="11" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg width="25" height="12" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#000" opacity=".4"/><rect x="2" y="2" width="18" height="9" rx="2" fill="#000"/></svg></span></div>`;
  const phone = (id, left, top, scale, avatar, name, role) => `
    <div class="phone" id="${id}" style="left:${left}px;top:${top}px;transform:scale(${scale})">
      <div class="body-shadow"></div>
      <div class="screen">
        <div style="position:absolute;left:0;right:0;top:0;z-index:5;background:#fff;padding-bottom:12px">
          ${statusBar}
          <div style="display:flex;flex-direction:column;align-items:center;padding-top:18px">
            <img src="${avatar}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;box-shadow:0 4px 10px rgb(0 0 0 / .15)">
            <span class="glass" style="margin-top:-8px;border-radius:99px;padding:3px 12px;font-size:13px;font-weight:600">${name} ›</span>
            <span style="margin-top:2px;font-size:10px;color:#737373">${role}</span>
          </div>
        </div>
        <div class="msgs" style="position:absolute;left:16px;right:16px;top:164px;bottom:66px;display:flex;flex-direction:column;justify-content:flex-end"></div>
        <div style="position:absolute;left:12px;right:12px;bottom:24px;display:flex;gap:8px;align-items:center">
          <span class="glass" style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:22px;color:#737373">+</span>
          <span style="flex:1;height:36px;border-radius:99px;border:1px solid #d4d4d4;display:flex;align-items:center;padding:0 14px;font-size:13px;color:#a3a3a3;overflow:hidden;white-space:nowrap" class="input">iMessage</span>
        </div>
      </div>
      <img class="frame" src="assets/iphone-frame.png">
    </div>`;
  const bubble = (who, text, tail = true) => `<div class="row ${who}" style="opacity:0"><p class="bub imsg ${who === 'me' ? 'imsg-me' : 'imsg-them'} ${tail ? 'imsg-tail' : ''} ${who}">${text}</p></div>`;
  const dots = `<div class="row them dots" style="opacity:0"><p class="bub them imsg imsg-them imsg-tail" style="display:flex;gap:4px;padding:10px 12px"><i style="width:7px;height:7px;border-radius:50%;background:#9ca3af"></i><i style="width:7px;height:7px;border-radius:50%;background:#9ca3af"></i><i style="width:7px;height:7px;border-radius:50%;background:#9ca3af"></i></p></div>`;
  const addMsg = (container, htmlStr, t) => { const e = html(htmlStr); container.appendChild(e); tl.fromTo(e, { autoAlpha: 0, y: 16, scale: 0.9, transformOrigin: e.classList.contains('me') ? '100% 100%' : '0% 100%' }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.6)' }, t); return e; };
  const showDots = (container, t, t2) => { const e = html(dots); container.appendChild(e); tl.fromTo(e, { autoAlpha: 0, scale: 0.8, transformOrigin: '0% 100%' }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'back.out(1.6)' }, t); $$(e, 'i').forEach((d, i) => tl.fromTo(d, { y: 0 }, { y: -4, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' }, t + i * 0.08)); tl.set(e, { display: 'none' }, t2); };

  /* ============ C  just text it ============ */
  const card = (icon, title, sub, top) => `<div class="card fcard" style="position:absolute;left:980px;top:${top}px;width:760px;height:164px;display:flex;align-items:center;gap:30px;padding:0 40px"><div class="chip-icon" style="width:84px;height:84px;border-radius:24px">${icon}</div><div><div style="font-size:46px;letter-spacing:-0.02em">${title}</div><div style="font-size:26px;color:var(--muted);font-weight:400;margin-top:4px">${sub}</div></div></div>`;
  els.C = scene('C', 'light', `
    ${phone('ph1', 360, 66, 1.2, AV('mochi'), 'Mochi', 'Your personal assistant')}
    ${card(ICON.search, 'searches the web', 'live answers, not guesses', 200)}
    ${card(ICON.alarm, 'sets reminders', 'and watches, all by text', 400)}
    ${card(ICON.check, 'gets things done', 'even on your own computer', 600)}`);
  {
    const s = els.C; const msgs = $(s, '.msgs'); const input = $(s, '.input'); const t0 = L.text.start;
    const msg = 'remind me to call mom at 6, and find ramen under $20';
    typeText(input, msg, T.C + WIPE + 0.05, wt('text', 2) - (T.C + WIPE) - 0.1);
    tl.set(input, { color: '#000' }, T.C + WIPE + 0.05);
    const tSend = wt('text', 2) + 0.12;
    tl.set(input, { textContent: 'iMessage', color: '#a3a3a3' }, tSend);
    addMsg(msgs, bubble('me', msg), tSend);
    showDots(msgs, tSend + 0.35, wt('text', 4) + 0.1);
    addMsg(msgs, bubble('them', 'on it. 6pm reminder set', false), wt('text', 4) + 0.1);
    showDots(msgs, wt('text', 4) + 0.5, wt('text', 8));
    addMsg(msgs, bubble('them', '3 ramen spots under $20 nearby. the closest is 8 min away'), wt('text', 8) + 0.0);
    const cs = $$(s, '.fcard');
    popIn(cs[0], wt('text', 4), { y: 50, s: 0.94 }); popIn(cs[1], wt('text', 5), { y: 50, s: 0.94 }); popIn(cs[2], wt('text', 8), { y: 50, s: 0.94 });
    tl.fromTo($(s, '#ph1'), { y: 80, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power4.out' }, T.C + WIPE - 0.1);
  }

  /* ============ D  models ============ */
  const slot = (id, left, name, blurb, val, prov, on) => `
    <div class="card slot" id="${id}" style="position:absolute;left:${left}px;top:170px;width:520px;height:300px;padding:36px 40px;${on ? 'background:#fff;box-shadow:0 0 0 2px #23204e' : ''}">
      <div style="display:flex;align-items:center;gap:14px;font-size:38px;letter-spacing:-0.02em"><div class="chip-icon" style="width:52px;height:52px;border-radius:15px">${prov}</div>${name}</div>
      <div style="font-size:22px;color:var(--muted);font-weight:400;margin-top:14px;line-height:1.35;height:62px">${blurb}</div>
      <div class="sel" style="margin-top:24px;height:64px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .08);display:flex;align-items:center;padding:0 22px;font-size:27px;gap:12px;position:relative;overflow:hidden">${val}</div>
    </div>`;
  const models = [['OpenAI', 'GPT 5.1'], ['Anthropic', 'Claude Sonnet 5.5'], ['Gemini', 'Gemini 2.5 Flash'], ['xAI', 'Grok 4'], ['Local', 'Local model · Ollama']];
  els.D = scene('D', 'light', `
    ${slot('s1', 150, 'Brain', 'Reads your texts, plans the work and writes the replies.', '<span class="v" style="position:absolute;left:22px">GPT 5.1</span>', ICON.cpu, true)}
    ${slot('s2', 700, 'Backup', 'Takes over when the Brain’s provider fails.', 'Claude Haiku 4.5', ICON.shield)}
    ${slot('s3', 1250, 'Computer use', 'Does tasks on your Windows, Mac or Linux computer.', 'Claude Sonnet 5.5', ICON.cpu)}
    <div id="provs" style="position:absolute;left:0;right:0;top:600px;display:flex;justify-content:center;gap:22px">${models.map(([p]) => `<div class="pill prov" style="background:#f5f5f5;box-shadow:0 0 0 1px rgb(0 0 0 / .05);font-size:34px;padding:18px 36px;color:#525252">${p === 'Local' ? ICON.hdd.replace('<svg', '<svg width="30" height="30"') : ''}${p}</div>`).join('')}</div>
    <div id="dnote" style="position:absolute;left:0;right:0;top:770px;text-align:center;font-size:34px;color:var(--muted);font-weight:400;letter-spacing:-0.01em">every part of your agent can run on a different model</div>`);
  {
    const s = els.D; const v = $(s, '.v'); const provs = $$(s, '.prov');
    const times = [wt('models', 6), wt('models', 7), wt('models', 8), wt('models', 9), wt('models', 12)];
    const first = T.D + WIPE + 0.05;
    $$(s, '.slot').forEach((e, i) => popIn(e, first + i * 0.1, { y: 60, s: 0.95 }));
    provs.forEach((e, i) => popIn(e, first + 0.35 + i * 0.07, { y: 30, s: 0.9 }));
    fadeUp($(s, '#dnote'), wt('models', 3) + 0.1);
    models.forEach(([p, label], i) => {
      const t = i === 0 ? times[0] - 0.55 : times[i] - 0.05;
      if (i === 0) tl.set(v, { textContent: label }, t); else { tl.to(v, { y: -26, autoAlpha: 0, duration: 0.14, ease: 'power2.in' }, t - 0.1); tl.set(v, { textContent: label }, t + 0.04); tl.fromTo(v, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2, ease: 'power3.out', immediateRender: false }, t + 0.04); }
      tl.to(provs[i], { backgroundColor: '#23204e', color: '#fff', scale: 1.07, duration: 0.2, ease: 'back.out(2)' }, t);
      if (i > 0) tl.to(provs[i - 1], { backgroundColor: '#f5f5f5', color: '#525252', scale: 1, duration: 0.2 }, t);
    });
  }

  /* ============ E  runs on your machine ============ */
  const pillKey = (txt, id) => `<div class="pill key" id="${id}" style="position:absolute;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .12);color:#23204e;font-size:30px;padding:14px 28px;gap:12px">${ICON.key.replace('<svg', '<svg width="30" height="30"')}${txt}</div>`;
  els.E = scene('E', 'light', `
    <div id="laptop" style="position:absolute;left:150px;top:110px;width:740px;height:434px;transform:scale(1.62);transform-origin:0 0">
      <div class="device device-macbook-pro">
        <div class="device-frame">
          <div style="width:100%;height:100%;background:#fff;position:relative;overflow:hidden;border-radius:3px;padding:30px 34px 0">
            <div style="display:flex;align-items:center;gap:9px;font-size:15px;color:#404040"><i style="width:9px;height:9px;border-radius:50%;background:#10b981"></i>engine · running on your machine</div>
            <div id="rows" style="margin-top:18px;display:flex;flex-direction:column;gap:9px"></div>
            <div id="lockbadge" style="position:absolute;right:34px;bottom:16px;display:flex;align-items:center;gap:9px;font-size:14px;color:#0a0a0a"><span style="width:32px;height:32px;border-radius:9px;background:#f5f5f5;box-shadow:0 0 0 1px rgb(0 0 0 / .08);display:grid;place-items:center">${ICON.lock.replace('<svg', '<svg width="17" height="17"')}</span>encrypted on disk</div>
          </div>
        </div>
        <div class="device-stripe"></div><div class="device-header"></div><div class="device-sensors"></div><div class="device-btns"></div><div class="device-power"></div><div class="device-home"></div>
      </div>
    </div>
    <div id="cloud" style="position:absolute;left:1500px;top:230px;width:330px;text-align:center;color:#737373">
      <div style="width:200px;margin:0 auto">${ICON.cloud}</div>
      <div style="font-size:34px;margin-top:6px;color:#0a0a0a">backend</div>
      <div style="font-size:24px;font-weight:400;margin-top:8px;line-height:1.35">settings and daily counts only</div>
      <div id="zero" style="margin-top:26px;display:inline-flex;align-items:center;gap:12px;font-size:30px;color:#0a0a0a;background:#f5f5f5;border-radius:99px;padding:10px 24px;box-shadow:0 0 0 1px rgb(0 0 0 / .08)"><b style="font-size:42px;font-weight:600">0</b> message text</div>
    </div>
    <div id="flyer" class="bub imsg imsg-me me" style="position:absolute;z-index:3;left:1250px;top:420px;font-size:26px;padding:12px 22px;border-radius:26px;opacity:0">hey</div>
    <div id="barrier" style="position:absolute;left:1425px;top:350px;width:10px;height:270px;border-radius:6px;background:#0a0a0a;opacity:0"></div>
    ${pillKey('OpenAI key', 'k1')}${pillKey('Anthropic key', 'k2')}${pillKey('Twilio key', 'k3')}`);
  {
    const s = els.E; const rows = $(s, '#rows');
    ['contacts', 'conversations', 'messages'].forEach((r) => rows.appendChild(html(`<div class="rw" style="height:36px;border-radius:9px;background:#f5f5f5;display:flex;align-items:center;padding:0 14px;font-size:15px;color:#171717;gap:10px">${r}<span style="margin-left:auto;letter-spacing:.2em;color:#a3a3a3">••••••••••</span></div>`)));
    const rw = $$(s, '.rw'); const T0 = T.E + WIPE;
    tl.fromTo($(s, '#laptop'), { y: 80, autoAlpha: 0, scale: 1.5 }, { y: 0, autoAlpha: 1, scale: 1.62, duration: 0.7, ease: 'power4.out' }, T0 - 0.15);
    tl.fromTo(rw, { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.12, ease: 'power3.out' }, wt('local', 2));
    fadeUp($(s, '#cloud'), wt('local', 8) - 0.1);
    // keys fly onto the laptop on "Your keys."
    [['#k1', 330, 640], ['#k2', 650, 660], ['#k3', 990, 640]].forEach(([q, x, y], i) => {
      tl.fromTo($(s, q), { left: x, top: 1000, autoAlpha: 0, scale: 0.8 }, { left: x, top: y - 40, autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(1.7)' }, wt('local', 6) + i * 0.1 - 0.15);
      tl.to($(s, q), { top: y - 250, scale: 0.7, autoAlpha: 0, duration: 0.4, ease: 'power3.in' }, wt('local', 6) + 0.8 + i * 0.08);
    });
    tl.fromTo($(s, '#lockbadge'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4 }, wt('local', 8));
    // a message tries to leave and hits the wall
    const fl = $(s, '#flyer');
    tl.fromTo(fl, { x: 0, scale: 0.7, autoAlpha: 0 }, { x: 62, scale: 1, autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, wt('local', 10) - 0.1);
    tl.fromTo($(s, '#barrier'), { autoAlpha: 0, scaleY: 0.4 }, { autoAlpha: 1, scaleY: 1, duration: 0.25, ease: 'back.out(2)' }, wt('local', 10) + 0.35);
    tl.to(fl, { x: -30, autoAlpha: 0, scale: 0.8, duration: 0.35, ease: 'power2.in' }, wt('local', 10) + 0.45);
    tl.fromTo($(s, '#zero'), { scale: 1 }, { scale: 1.18, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.inOut' }, wt('local', 10) + 0.45);
  }

  /* ============ F  computer use ============ */
  els.F = scene('F', 'light', `
    <div class="win" style="left:110px;top:110px;width:1040px;height:700px">
      <div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><span class="url">trip-planner.app / new trip</span></div>
      <div style="padding:44px 64px">
        <div style="font-size:48px;letter-spacing:-0.02em;margin-bottom:30px">Plan a trip</div>
        ${['Destination', 'Dates', 'Budget'].map((l, i) => `<div style="margin-bottom:26px"><div style="font-size:22px;color:#737373;margin-bottom:10px;font-weight:500">${l}</div><div class="field" data-i="${i}" style="height:76px;border-radius:16px;box-shadow:0 0 0 2px #e5e5e5;display:flex;align-items:center;padding:0 26px;font-size:32px;font-weight:400"><span class="val"></span><i class="caret" style="width:2px;height:36px;background:#3b37a3;margin-left:3px;opacity:0"></i></div></div>`).join('')}
        <div id="save" class="btn sm" style="height:64px;font-size:26px;padding:0 44px;margin-top:4px">Save</div>
      </div>
    </div>
    <div class="agent-chip chip-tofu" id="cur" style="left:900px;top:760px">${CURSOR('#d97706')}<img src="${AV('tofu', 'png')}"><div><b>Tofu</b><span id="curlbl">using the computer</span></div></div>
    <div class="card on-card" id="appr" style="position:absolute;left:1210px;top:190px;width:610px;padding:34px;background:#fff;box-shadow:0 30px 60px -30px rgb(0 0 0 / .18),0 0 0 1px rgb(0 0 0 / .06)">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px"><img src="${AV('tofu', 'png')}" style="width:62px;height:62px;border-radius:50%"><div><div style="font-size:30px">Tofu</div><div style="font-size:20px;color:#737373;font-weight:400">iMessage · now</div></div></div>
      <div class="row them"><p class="bub imsg imsg-them imsg-tail them" style="font-size:25px;max-width:100%;padding:14px 22px;border-radius:28px;line-height:1.4">Computer use: type “Montreal”. Reply YES to allow it, YES ALL to allow typing for the rest of this task, or NO.</p></div>
      <div class="row me" id="yes" style="margin-top:18px"><p class="bub imsg imsg-me imsg-tail me" style="font-size:30px;padding:10px 32px;border-radius:30px;max-width:100%">YES</p></div>
    </div>`);
  {
    const s = els.F; const f = $$(s, '.field'); const cur = $(s, '#cur'); const lbl = $(s, '#curlbl');
    const t0 = T.F + WIPE; const vals = ['Montreal', 'Oct 16–18', '$600 max'];
    tl.fromTo($(s, '.win'), { y: 70, autoAlpha: 0, scale: 0.96 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, ease: 'power4.out' }, t0 - 0.2);
    popIn(cur, t0 + 0.1, { y: 30, s: 0.8 });
    const pos = [[640, 288], [640, 408], [640, 528], [380, 650]];
    tl.to(cur, { left: pos[0][0], top: pos[0][1], duration: 0.6, ease: 'power3.inOut' }, t0 + 0.4);
    tl.to(f[0], { boxShadow: '0 0 0 3px #3b37a3', duration: 0.12 }, t0 + 1.0);
    popIn($(s, '#appr'), wt('use', 5) + 0.05, { y: 50, s: 0.92 });
    tl.fromTo($(s, '#yes'), { autoAlpha: 0, y: 16, scale: 0.85, transformOrigin: '100% 100%' }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2)' }, wt('use', 8) + 0.1);
    const tYes = wt('use', 8) + 0.45;
    tl.set(lbl, { textContent: 'approved. typing' }, tYes);
    typeText($$(f[0], '.val')[0], vals[0], tYes, 0.4);
    tl.set($$(f[0], '.caret')[0], { opacity: 1 }, tYes); tl.set($$(f[0], '.caret')[0], { opacity: 0 }, tYes + 0.45);
    [1, 2].forEach((i) => {
      const t = tYes + 0.5 + (i - 1) * 0.5;
      tl.to(cur, { left: pos[i][0], top: pos[i][1], duration: 0.3, ease: 'power3.inOut' }, t);
      tl.to(f[i], { boxShadow: '0 0 0 3px #3b37a3', duration: 0.1 }, t + 0.3);
      typeText($$(f[i], '.val')[0], vals[i], t + 0.32, 0.25);
    });
    const tSave = tYes + 1.55;
    tl.to(cur, { left: pos[3][0], top: pos[3][1], duration: 0.35, ease: 'power3.inOut' }, tSave);
    tl.fromTo($(s, '#save'), { scale: 1 }, { scale: 0.94, duration: 0.1, yoyo: true, repeat: 1 }, tSave + 0.38);
    tl.set(lbl, { textContent: 'done' }, tSave + 0.55);
  }

  /* ============ G  allowed people ============ */
  const person = (name, sub, hue, badge, id) => `<div class="prow" id="${id}" style="display:flex;align-items:center;gap:22px;height:104px;padding:0 28px;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .06);margin-bottom:16px"><span style="width:64px;height:64px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:28px;background:hsl(${hue} 50% 52%)">${name[0]}</span><div><div style="font-size:32px">${name}</div><div style="font-size:22px;color:#737373;font-weight:400">${sub}</div></div>${badge}</div>`;
  const okBadge = '<span class="pill" style="margin-left:auto;background:#ecfdf5;color:#047857;font-size:22px;padding:8px 18px">verified</span>';
  els.G = scene('G', 'light', `
    <div class="card" style="position:absolute;left:130px;top:150px;width:760px;height:600px;padding:40px">
      <div style="display:flex;align-items:center;gap:16px;font-size:30px;color:#737373"><span style="width:54px;height:54px;border-radius:50%;background:#d4d4d4;display:grid;place-items:center;color:#fff">${ICON.user.replace('<svg', '<svg width="28" height="28"')}</span>+1 (415) 555-0199</div>
      <div style="position:relative;margin-top:36px">
        <div class="row them" id="stranger"><p class="bub imsg imsg-them imsg-tail them" style="font-size:30px;padding:16px 28px;border-radius:30px;max-width:86%">hey, can you book me a table?</p></div>
        <div id="ign" class="pill" style="position:absolute;left:10px;top:92px;background:#171717;color:#fff;font-size:26px;padding:12px 26px">ignored · no AI call, nothing stored</div>
      </div>
      <div id="count" style="position:absolute;left:40px;right:40px;bottom:40px;height:96px;border-radius:22px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .06);display:flex;align-items:center;padding:0 28px;font-size:28px;gap:16px"><b style="font-size:46px;font-weight:600">1</b>text ignored today<span class="btn sm" style="margin-left:auto">Allow</span></div>
    </div>
    <div class="card" style="position:absolute;left:960px;top:150px;width:830px;height:600px;padding:40px">
      <div style="display:flex;align-items:center;gap:16px;font-size:36px;letter-spacing:-0.02em;margin-bottom:30px"><div class="chip-icon" style="width:58px;height:58px;border-radius:16px">${ICON.shield}</div>Allowed people</div>
      ${person('You', 'your verified phone', 250, okBadge, 'p1')}${person('Maya', '+1 (415) 555-0142', 330, '', 'p2')}${person('Sam', 'sam@icloud.com', 160, '', 'p3')}
    </div>`);
  {
    const s = els.G; const t0 = T.G + WIPE;
    $$(s, '.card').forEach((c, i) => popIn(c, t0 - 0.2 + i * 0.1, { y: 50, s: 0.95 }));
    popIn($(s, '#stranger'), t0 + 0.15, { y: 30, s: 0.9 });
    tl.set($(s, '#ign'), { autoAlpha: 0 }, 0);
    popIn($(s, '#ign'), wt('allow', 2), { y: 20, s: 0.9 });
    tl.to($(s, '#stranger'), { opacity: 0.35, duration: 0.3 }, wt('allow', 2) + 0.15);
    fadeUp($(s, '#count'), wt('allow', 3));
    tl.set(['#p1', '#p2', '#p3'].map((q) => $(s, q)), { autoAlpha: 0 }, 0);
    popIn($(s, '#p1'), wt('allow', 4) - 0.1, { y: 30, s: 0.95 }); popIn($(s, '#p2'), wt('allow', 7), { y: 30, s: 0.95 }); popIn($(s, '#p3'), wt('allow', 9) - 0.12, { y: 30, s: 0.95 });
  }

  /* ============ H  setup from one dashboard ============ */
  const nav = (ic, t, on) => `<div style="display:flex;align-items:center;gap:16px;height:60px;padding:0 20px;border-radius:14px;font-size:26px;${on ? 'background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .06)' : 'color:#404040'}"><span style="width:28px;height:28px;display:grid;place-items:center">${ic}</span>${t}</div>`;
  const step = (i, t, b) => `<div class="step" style="border-radius:20px;padding:26px 28px;background:#fafafa;box-shadow:inset 0 0 0 1px #eee;height:210px;position:relative"><div style="display:flex;align-items:center;gap:16px;font-size:30px"><span class="num" style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .1);font-size:24px;color:#525252;font-weight:600">${i}</span>${t}</div><div style="font-size:23px;color:#737373;font-weight:400;margin-top:16px;line-height:1.4">${b}</div></div>`;
  els.H = scene('H', 'light', `
    <div class="win" id="dash" style="left:150px;top:80px;width:1620px;height:780px;display:flex">
      <div style="width:330px;background:#f5f5f7;padding:28px 22px;flex:none">
        <div style="display:flex;align-items:center;gap:12px;font-size:32px;font-weight:600;letter-spacing:-0.02em;padding:0 10px 26px"><img src="assets/favicon.svg" width="36">OpenBots</div>
        <div style="font-size:18px;color:#a3a3a3;letter-spacing:.08em;padding:6px 20px">BUILD</div>
        ${nav(ICON.bot, 'Agents', true)}${nav(ICON.cpu, 'Models')}${nav(ICON.book, 'Knowledge')}${nav(ICON.msg, 'Numbers')}
        <div style="font-size:18px;color:#a3a3a3;letter-spacing:.08em;padding:18px 20px 6px">INSIGHTS</div>${nav(ICON.chart, 'Analytics')}
        <div style="font-size:18px;color:#a3a3a3;letter-spacing:.08em;padding:18px 20px 6px">SYSTEM</div>${nav(ICON.plug, 'Connections')}${nav(ICON.gear, 'Settings')}
      </div>
      <div style="flex:1;padding:0">
        <div style="height:84px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-size:30px;font-weight:600">Agents<span class="btn sm" style="height:52px;font-size:22px">+ Create an agent</span></div>
        <div style="margin:36px 40px;border:1px solid #e5e5e5;border-radius:22px;padding:34px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:32px;margin-bottom:26px">Get your agents texting<span id="prog" style="font-size:24px;color:#737373;font-weight:400"></span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            ${step(1, 'Add an AI key', 'OpenAI, Anthropic, Gemini, xAI or a local model.')}${step(2, 'Start your engine', 'It runs on a machine you choose and keeps your messages there.')}
            ${step(3, 'Verify your phone', 'Your engine texts it a code.')}${step(4, 'Set an agent live', 'It answers only you and the people you allow.')}
          </div>
        </div>
      </div>
    </div>
    <div id="live" class="pill" style="position:absolute;left:1150px;top:780px;background:#ecfdf5;color:#047857;font-size:36px;padding:18px 40px"><i style="width:16px;height:16px;border-radius:50%;background:#10b981"></i>Live</div>`);
  {
    const s = els.H; const t0 = T.H + WIPE; const st = $$(s, '.step');
    tl.fromTo($(s, '#dash'), { y: 80, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.7, ease: 'power4.out' }, t0 - 0.2);
    st.forEach((e, i) => {
      const t = wt('setup', i === 0 ? 1 : 1) + 0.2 + i * 0.36;
      tl.to(e, { backgroundColor: 'rgb(236 253 245 / .7)', duration: 0.25 }, t);
      tl.to($(e, '.num'), { backgroundColor: '#059669', color: '#fff', scale: 1.15, duration: 0.25, ease: 'back.out(3)' }, t);
      tl.set($(e, '.num'), { innerHTML: ICON.check.replace('<svg', '<svg width="22" height="22"') }, t);
      tl.to($(e, '.num'), { scale: 1, duration: 0.2 }, t + 0.25);
    });
    tl.set($(s, '#prog'), { textContent: 'all done' }, wt('setup', 1) + 0.2 + 3 * 0.36 + 0.2);
    tl.set($(s, '#live'), { autoAlpha: 0 }, 0);
    popIn($(s, '#live'), wt('setup', 1) + 0.2 + 3 * 0.36 + 0.3, { y: 40, s: 0.7, ease: 'back.out(2.2)' });
  }

  /* ============ I  close ============ */
  els.I = scene('I', 'light', `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:50px">
      <div id="ilogo" style="margin-top:-60px;margin-bottom:-30px">${logo(260, 'z')}</div>
      <div class="display" id="i1" style="font-size:168px;letter-spacing:-0.04em;display:flex;gap:.24em"><span class="w">Own</span><span class="w">your</span><span class="w g-ink">agent.</span></div>
      <div id="ipills" style="display:flex;gap:22px;margin-top:44px">
        <div class="pill ip" style="background:#f5f5f5;box-shadow:0 0 0 1px rgb(0 0 0 / .08);font-size:32px;padding:16px 34px">open source · MIT</div>
        <div class="pill ip" style="background:#23204e;color:#fff;font-size:32px;padding:16px 34px;font-weight:600">github.com/shidhartha-sen/opendots</div>
      </div>
    </div>`);
  {
    const s = els.I; const t0 = T.I + WIPE; const wsI = $$($(s, '#i1'), '.w');
    tl.fromTo($$(s, '.eyewrap'), { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(2.4)', stagger: 0.08 }, t0 - 0.1);
    wsI.forEach((e, i) => popIn(e, wt('close', 3 + i), { y: 50 }));
    $$(s, '.ip').forEach((e, i) => popIn(e, wt('close', 2) + i * 0.12 - 0.1, { y: 30, s: 0.9 }));
    $$(s, '.eye').forEach((e) => { tl.to(e, { scaleY: 0.12, duration: 0.07 }, TOTAL - 0.65); tl.to(e, { scaleY: 1, duration: 0.12 }, TOTAL - 0.57); });
  }

  /* ---------- wipes, camera drift, hides ---------- */
  order.forEach((id, k) => {
    const e = els[id]; const t = T[id]; const end = k < order.length - 1 ? T[order[k + 1]] + WIPE : TOTAL;
    const cam = $(e, '.cam');
    if (k === 0) tl.set(e, { visibility: 'visible' }, 0);
    else {
      tl.set(e, { visibility: 'visible' }, t);
      const p = { v: 0 };
      tl.fromTo(p, { v: 0 }, { v: 1, duration: WIPE, ease: 'power3.inOut', onUpdate() { const x = p.v * (1920 + 220); e.style.clipPath = `inset(0 ${Math.max(0, 1920 - x) / 19.2}% 0 0)`; } }, t);
      e.style.zIndex = k;
      tl.set(els[order[k - 1]], { visibility: 'hidden' }, t + WIPE);
      e.style.clipPath = 'inset(0 100% 0 0)';
    }
    tl.fromTo(cam, { scale: 1 }, { scale: 1.035, duration: end - t, ease: 'none', immediateRender: false }, t);
  });

  /* ---------- subtitles ---------- */
  timing.lines.forEach((ln) => {
    const w = ln.words; const chunks = []; let cur = [];
    w.forEach((x, i) => { cur.push(x); const end = /[.?!]$/.test(x.w) || (/,$/.test(x.w) && cur.length >= 4) || cur.length >= 7; if (end || i === w.length - 1) { chunks.push(cur); cur = []; } });
    chunks.forEach((ch, ci) => {
      const c = html(`<div class="cap">${ch.map((x) => `<span class="cw">${x.w}</span>`).join(' ')}</div>`);
      subsEl.appendChild(c);
      const a = ln.start + ch[0].s - 0.05;
      const b = (chunks[ci + 1] ? ln.start + chunks[ci + 1][0].s - 0.05 : ln.start + ln.dur + 0.35);
      tl.fromTo(c, { autoAlpha: 0, y: 18, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.16, ease: 'power2.out' }, a);
      tl.to(c, { autoAlpha: 0, duration: 0.12 }, b - 0.12);
      $$(c, '.cw').forEach((sp, i) => tl.to(sp, { color: '#ffffff', duration: 0.1 }, ln.start + ch[i].s));
    });
  });

  window.__total = TOTAL;
  window.seek = (t) => { tl.time(t, false); };
  window.__ready = true;
}

document.fonts.load('500 20px "Figtree Variable"').then(() => fetch('vo/timing.json').then((r) => r.json()).then(boot));
