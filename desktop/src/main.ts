import { app, BrowserWindow, ipcMain, Menu, nativeImage, powerSaveBlocker, shell, systemPreferences, Tray, utilityProcess } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { Engine, type EngineState, type Spawned } from './engine'

// The OpenBots app: keeps the engine running on a computer you leave on, so your agents can answer texts and use
// this computer. Everything else (agents, numbers, keys) is in the dashboard.

// Set when the app is built (build.mjs); the environment wins, for a dev build against your own deployment
declare const __CONVEX_URL__: string
declare const __SITE_URL__: string
const CONVEX_URL = process.env.OPENBOTS_CONVEX_URL || __CONVEX_URL__
const SITE_URL = (process.env.OPENBOTS_SITE_URL || __SITE_URL__).replace(/\/+$/, '')

type Settings = { keepAwake: boolean; openAtLogin: boolean }
const settingsFile = () => join(app.getPath('userData'), 'settings.json')
function loadSettings(): Settings {
    const defaults: Settings = { keepAwake: true, openAtLogin: true }
    try {
        return { ...defaults, ...(JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings>) }
    } catch {
        return defaults
    }
}

// Mac only: computer use needs both, and macOS asks a person to switch them on in System Settings
type Permissions = { screen: boolean; accessibility: boolean } | null
const permissions = (): Permissions =>
    process.platform === 'darwin' ? { screen: systemPreferences.getMediaAccessStatus('screen') === 'granted', accessibility: systemPreferences.isTrustedAccessibilityClient(false) } : null
const PANES = {
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
}
// Signing in by itself after a restart: an OS setting no app can change, so the app opens it
const AUTO_LOGIN = process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Users-Groups-Settings.extension' : process.platform === 'win32' ? 'ms-settings:signinoptions' : null

const enginePath = () => (app.isPackaged ? join(process.resourcesPath, 'engine', 'openbots-engine.mjs') : join(__dirname, 'engine', 'openbots-engine.mjs'))

// The engine runs in Electron's own Node.js (24), in a utility process: no separate Node install, no terminal
function spawnEngine(): Spawned {
    const child = utilityProcess.fork(enginePath(), [], {
        serviceName: 'OpenBots engine',
        stdio: 'pipe',
        env: { ...process.env, OPENBOTS_CONVEX_URL: CONVEX_URL, OPENBOTS_SITE_URL: SITE_URL, OPENBOTS_DESKTOP: '1' },
    })
    const lines: ((line: string, stream: 'out' | 'err') => void)[] = []
    const split = (stream: 'out' | 'err') => {
        let rest = ''
        return (chunk: Buffer) => {
            const parts = (rest + chunk.toString('utf8')).split(/\r?\n/)
            rest = parts.pop() ?? ''
            for (const line of parts) lines.forEach((fn) => fn(line, stream))
        }
    }
    child.stdout?.on('data', split('out'))
    child.stderr?.on('data', split('err'))
    return {
        onLine: (fn) => lines.push(fn),
        onExit: (fn) => child.on('exit', fn),
        kill: () => child.kill(),
    }
}

let window: BrowserWindow | null = null
let tray: Tray | null = null
let awake: number | null = null
let settings: Settings
const engine = new Engine(spawnEngine)

async function view() {
    const state: EngineState = engine.state
    const qr = state.phase === 'pairing' ? await QRCode.toString(state.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : null
    return { state, qr, settings, permissions: permissions(), platform: process.platform, autoLogin: !!AUTO_LOGIN, version: app.getVersion(), dashboard: `${SITE_URL}/dashboard` }
}
async function refresh() {
    if (window && !window.isDestroyed()) window.webContents.send('view', await view())
    tray?.setToolTip(engine.state.phase === 'connected' ? 'OpenBots: connected' : engine.state.phase === 'pairing' ? 'OpenBots: waiting to be connected' : 'OpenBots: starting')
}

function apply(next: Settings) {
    settings = next
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
    // Linux has no login items here; the app's autostart entry is up to the desktop
    if (process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, args: ['--hidden'] })
    // Computer use needs a live screen: no sleep and no dimming while the app runs
    if (settings.keepAwake && awake === null) awake = powerSaveBlocker.start('prevent-display-sleep')
    if (!settings.keepAwake && awake !== null) {
        powerSaveBlocker.stop(awake)
        awake = null
    }
}

function showWindow() {
    if (window && !window.isDestroyed()) {
        window.show()
        window.focus()
        return
    }
    window = new BrowserWindow({
        width: 420,
        height: 640,
        resizable: false,
        title: 'OpenBots',
        backgroundColor: '#f5f5f7',
        webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
    })
    window.setMenuBarVisibility(false)
    void window.loadFile(join(__dirname, 'renderer', 'index.html'))
    // Closing the window keeps the engine running; Quit is in the tray menu
    window.on('close', (e) => {
        if (!quitting) {
            e.preventDefault()
            window?.hide()
        }
    })
    // Links open in the browser, never inside the app
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
    })
}

let quitting = false
function quit() {
    quitting = true
    engine.stop()
    app.quit()
}

function setupTray() {
    const icon = nativeImage.createFromPath(join(__dirname, 'tray.png')).resize({ width: 18, height: 18 })
    tray = new Tray(icon)
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: 'Show OpenBots', click: showWindow },
            { label: 'Open dashboard', click: () => void shell.openExternal(`${SITE_URL}/dashboard`) },
            { type: 'separator' },
            { label: 'Quit OpenBots', click: quit },
        ]),
    )
    tray.on('click', showWindow)
}

// Updates download in the background and install themselves, since nobody may be at this computer
function setupUpdates() {
    if (!app.isPackaged) return
    autoUpdater.autoDownload = true
    // No release yet, or offline: try again at the next check, quietly
    autoUpdater.logger = null
    autoUpdater.on('error', () => {})
    autoUpdater.on('update-downloaded', () => {
        quitting = true
        engine.stop()
        autoUpdater.quitAndInstall(true, true)
    })
    const check = () => void autoUpdater.checkForUpdates().catch(() => {})
    check()
    setInterval(check, 6 * 3_600_000)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
    app.on('second-instance', showWindow)
    app.on('before-quit', () => {
        quitting = true
        engine.stop()
    })
    // Stays running with no window open: the tray icon is the way back
    app.on('window-all-closed', () => {})
    app.on('activate', showWindow)

    void app.whenReady().then(() => {
        apply(loadSettings())
        ipcMain.handle('view', () => view())
        ipcMain.handle('set', (_e, patch: Partial<Settings>) => {
            apply({ ...settings, ...patch })
            void refresh()
        })
        ipcMain.handle('open', (_e, what: 'dashboard' | 'pair' | 'screen' | 'accessibility' | 'autoLogin') => {
            const url =
                what === 'dashboard' ? `${SITE_URL}/dashboard` : what === 'pair' ? (engine.state.phase === 'pairing' ? engine.state.url : null) : what === 'autoLogin' ? AUTO_LOGIN : PANES[what]
            if (url) void shell.openExternal(url)
            // Asking once adds the app to the Accessibility list, so there's a switch to flip
            if (what === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true)
        })
        ipcMain.handle('restart', () => engine.restart())
        ipcMain.handle('log', () => engine.log.join('\n'))
        // A dev build also prints the engine's log where it was started
        if (!app.isPackaged) engine.on('log', (line) => console.log(line))
        engine.on('state', (state) => {
            void refresh()
            // Not connected yet: show the code, even when the app started quietly at login
            if (state.phase === 'pairing') showWindow()
        })
        // Permissions change in System Settings, outside the app
        setInterval(() => void refresh(), 5_000)
        setupTray()
        // Started at login it stays in the tray; opened by hand it shows its window
        const atLogin = process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
        if (!atLogin) showWindow()
        engine.start()
        setupUpdates()
    })
}
