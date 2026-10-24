// The app's one screen: the code to approve while pairing, then what keeps this computer on
const api = window.openbots
const app = document.getElementById('app')
const footer = document.getElementById('footer')
let showLog = false

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const toggle = (key, on, label) => `<button class="switch" role="switch" aria-checked="${on}" aria-label="${label}" data-set="${key}"></button>`

function pairing(v) {
    const s = v.state
    return `<div class="card center">
        <h1>Connect this computer</h1>
        <p class="muted">Scan with your phone and tap Connect. You'll sign in to OpenBots if you haven't.</p>
        <div class="qr">${v.qr}</div>
        <p class="muted">or enter this code in Connections</p>
        <div class="code">${esc(s.code)}</div>
        <button class="primary" data-open="pair">Open in this computer's browser</button>
    </div>`
}

function connected(v) {
    const p = v.permissions
    const rows = [
        `<div class="row"><div>Start when this computer starts<small>So it's back after a restart or power cut.</small></div>${toggle('openAtLogin', v.settings.openAtLogin, 'Start when this computer starts')}</div>`,
        `<div class="row"><div>Keep this computer awake<small>Computer use needs the screen on.</small></div>${toggle('keepAwake', v.settings.keepAwake, 'Keep this computer awake')}</div>`,
    ]
    if (p) {
        rows.push(
            `<div class="row"><div>Screen Recording<small>Lets your agents see the screen.</small></div>${p.screen ? '<span class="ok-text">Allowed</span>' : '<button class="link" data-open="screen">Allow</button>'}</div>`,
            `<div class="row"><div>Accessibility<small>Lets your agents click and type.</small></div>${p.accessibility ? '<span class="ok-text">Allowed</span>' : '<button class="link" data-open="accessibility">Allow</button>'}</div>`,
        )
    }
    if (v.autoLogin)
        rows.push(`<div class="row"><div>Sign in automatically<small>Optional: after a restart, nobody needs to sign in for it to start.</small></div><button class="link" data-open="autoLogin">Open settings</button></div>`)
    return `<div class="card status"><span class="dot ok"></span><div><h1>Connected</h1><p class="muted">Your agents can use this computer. You can close this window; OpenBots keeps running in the ${v.platform === 'darwin' ? 'menu bar' : 'tray'}.</p></div></div>
        <div class="card rows">${rows.join('')}</div>
        <button class="primary" data-open="dashboard">Open dashboard</button>`
}

function waiting(v) {
    const s = v.state
    const text = s.phase === 'restarting' ? `Restarting in ${Math.round(s.inMs / 1000)}s. ${esc(s.reason)}` : 'Starting…'
    return `<div class="card status"><span class="dot wait"></span><div><h1>${s.phase === 'restarting' ? 'Something went wrong' : 'Starting'}</h1><p class="muted">${text}</p></div></div>`
}

async function render(v) {
    const s = v.state
    app.innerHTML = (s.phase === 'pairing' ? pairing(v) : s.phase === 'connected' ? connected(v) : waiting(v)) + (showLog ? `<div class="card"><pre>${esc(await api.log())}</pre></div>` : '')
    footer.innerHTML = `<span>Version ${esc(v.version)}</span><span><button class="ghost" data-log>${showLog ? 'Hide log' : 'Show log'}</button> <button class="ghost" data-restart>Restart engine</button></span>`
}

document.addEventListener('click', async (e) => {
    const t = e.target.closest('button')
    if (!t) return
    if (t.dataset.set) await api.set({ [t.dataset.set]: t.getAttribute('aria-checked') !== 'true' })
    if (t.dataset.open) await api.open(t.dataset.open)
    if (t.dataset.restart !== undefined) await api.restart()
    if (t.dataset.log !== undefined) showLog = !showLog
    render(await api.view())
})

api.onView(render)
api.view().then(render)
