import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import dbus from 'dbus-next'
import { PNG } from 'pngjs'
import { parseCombo, type Button, type Direction, type Driver, type Mod, type Point, type Shot, type Size } from './driver'

// Linux: the desktop's own Remote Desktop and Screenshot portals (xdg-desktop-portal), which work on Wayland as well
// as X11, with KDE Plasma and GNOME. The first time, the desktop asks someone at the computer to allow remote control;
// it's remembered (a restore token in the data folder), so later starts don't ask again. Coordinates are the screen's
// logical pixels, as the portal reports them. One screen: the one picked when allowing it.

const DESKTOP = 'org.freedesktop.portal.Desktop'
const PATH = '/org/freedesktop/portal/desktop'
const REMOTE = 'org.freedesktop.portal.RemoteDesktop'
const CAST = 'org.freedesktop.portal.ScreenCast'
const SHOT = 'org.freedesktop.portal.Screenshot'

// Linux input event codes for the mouse buttons
const BUTTON: Record<Button, number> = { left: 0x110, right: 0x111, middle: 0x112 }
// X keysyms
const MOD_SYM: Record<Mod, number> = { ctrl: 0xffe3, shift: 0xffe1, alt: 0xffe9, super: 0xffeb }
const KEY_SYM: Record<string, number> = {
    enter: 0xff0d, tab: 0xff09, space: 0x20, backspace: 0xff08, escape: 0xff1b, delete: 0xffff, insert: 0xff63,
    left: 0xff51, up: 0xff52, right: 0xff53, down: 0xff54, home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56,
    ctrl: MOD_SYM.ctrl, shift: MOD_SYM.shift, alt: MOD_SYM.alt, super: MOD_SYM.super,
}

// A character's keysym: Latin-1 as itself, anything else as Unicode (0x01000000 + its code point)
export function charSym(ch: string): number {
    if (ch === '\n') return KEY_SYM.enter
    if (ch === '\t') return KEY_SYM.tab
    const cp = ch.codePointAt(0)!
    return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) ? cp : 0x01000000 + cp
}

// A key name from parseCombo (or a single character) → its keysym
export function keySym(key: string): number {
    const fn = /^f([1-9]|1[0-2])$/.exec(key)
    if (fn) return 0xffbe + Number(fn[1]) - 1
    return KEY_SYM[key] ?? charSym(key)
}

type Vars = Record<string, dbus.Variant>
type Stream = { node: number; size: Size }

// A portal request's handle is predictable from the sender name and a token, so its Response can be watched for
// before the call is made (otherwise a quick answer could arrive first)
const senderPath = (name: string) => name.slice(1).replace(/\./g, '_')
let tokens = 0
const token = () => `openbots${process.pid}_${++tokens}`

export class LinuxDriver implements Driver {
    private bus?: dbus.MessageBus
    // This connection's unique name (":1.42"), known once the bus has said hello
    private name?: string
    private session?: string
    private stream?: Stream
    private starting?: Promise<void>
    // Why it couldn't start last time (someone said no, or nobody answered), so the heartbeat doesn't ask again
    private refused: string | null = null
    private here: Point = { x: 0, y: 0 }

    constructor(private tokenFile: string) {}

    // Calls a portal method that answers through a Request object, and waits for that answer
    private async request(iface: string, member: string, signature: string, body: unknown[], timeoutMs = 120_000): Promise<Vars> {
        const bus = this.bus!
        const handleToken = token()
        const path = `${PATH}/request/${senderPath(this.name!)}/${handleToken}`
        const options = body[body.length - 1] as Vars
        options.handle_token = new dbus.Variant('s', handleToken)
        const answer = new Promise<Vars>((resolve, reject) => {
            const timer = setTimeout(() => {
                bus.off('message', on)
                reject(new Error('Nobody answered the remote control prompt on this computer'))
            }, timeoutMs)
            const on = (m: dbus.Message) => {
                if (m.path !== path || m.member !== 'Response') return
                clearTimeout(timer)
                bus.off('message', on)
                const [code, results] = m.body as [number, Vars]
                if (code === 0) resolve(results)
                else reject(new Error(code === 1 ? 'Remote control was not allowed on this computer' : 'The desktop couldn’t start remote control'))
            }
            bus.on('message', on)
        })
        await this.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'AddMatch', 's', [`type='signal',interface='org.freedesktop.portal.Request',member='Response',path='${path}'`])
        await this.call(DESKTOP, PATH, iface, member, signature, body)
        return answer
    }

    private async call(destination: string, path: string, iface: string, member: string, signature: string, body: unknown[]) {
        const reply = await this.bus!.call(new dbus.Message({ destination, path, interface: iface, member, signature, body }))
        return reply?.body ?? []
    }

    private notify(member: string, signature: string, ...args: unknown[]) {
        return this.call(DESKTOP, PATH, REMOTE, member, `oa{sv}${signature}`, [this.session, {}, ...args])
    }

    // One remote control session for the engine's lifetime: keyboard and pointer, plus the screen they act on
    private start() {
        this.starting ??= (async () => {
            if (!this.bus) {
                const bus = dbus.sessionBus()
                this.bus = bus
                this.name = await new Promise<string>((resolve, reject) => {
                    bus.once('connect', () => resolve((bus as unknown as { name: string }).name))
                    bus.once('error', reject)
                })
            }
            const created = await this.request(REMOTE, 'CreateSession', 'a{sv}', [{ session_handle_token: new dbus.Variant('s', token()) }])
            const session = created.session_handle.value as string
            const restore = existsSync(this.tokenFile) ? readFileSync(this.tokenFile, 'utf8').trim() : ''
            await this.request(REMOTE, 'SelectDevices', 'oa{sv}', [
                session,
                {
                    // Keyboard and pointer
                    types: new dbus.Variant('u', 3),
                    // Remembered until revoked, so the desktop doesn't ask at every start
                    persist_mode: new dbus.Variant('u', 2),
                    ...(restore ? { restore_token: new dbus.Variant('s', restore) } : {}),
                },
            ])
            // One monitor, for the screen size and pointer positions
            await this.request(CAST, 'SelectSources', 'oa{sv}', [session, { types: new dbus.Variant('u', 1), multiple: new dbus.Variant('b', false) }])
            const started = await this.request(REMOTE, 'Start', 'osa{sv}', [session, '', {}])
            const streams = (started.streams?.value ?? []) as [number, Vars][]
            const [node, props] = streams[0] ?? []
            const size = props?.size?.value as [number, number] | undefined
            if (node === undefined || !size) throw new Error('The desktop didn’t share a screen for remote control')
            if (typeof started.restore_token?.value === 'string') writeFileSync(this.tokenFile, started.restore_token.value, { mode: 0o600 })
            this.session = session
            this.stream = { node, size: { width: size[0], height: size[1] } }
            this.refused = null
        })().catch((e) => {
            this.starting = undefined
            this.refused = e instanceof Error ? e.message : String(e)
            throw e
        })
        return this.starting
    }

    async size() {
        await this.start()
        return this.stream!.size
    }

    async screenshot(target: Size): Promise<Shot> {
        await this.start()
        const res = await this.request(SHOT, 'Screenshot', 'sa{sv}', ['', { interactive: new dbus.Variant('b', false) }], 30_000)
        const file = fileURLToPath(res.uri.value as string)
        try {
            const png = PNG.sync.read(readFileSync(file))
            return { base64: PNG.sync.write(resize(png, target)).toString('base64'), width: target.width, height: target.height }
        } finally {
            // Screenshots never stay on disk
            rmSync(file, { force: true })
        }
    }

    private async moveTo(at: Point) {
        const { size, node } = this.stream!
        const x = Math.min(Math.max(0, at.x), size.width - 1)
        const y = Math.min(Math.max(0, at.y), size.height - 1)
        await this.notify('NotifyPointerMotionAbsolute', 'udd', node, x, y)
        this.here = { x, y }
    }

    private async mods(mods: Mod[], down: boolean) {
        for (const m of down ? mods : [...mods].reverse()) await this.notify('NotifyKeyboardKeysym', 'iu', MOD_SYM[m], down ? 1 : 0)
    }

    async click(at: Point | undefined, button: Button, count: number, mods: Mod[]) {
        await this.start()
        if (at) await this.moveTo(at)
        await this.mods(mods, true)
        try {
            for (let i = 0; i < count; i++) {
                await this.notify('NotifyPointerButton', 'iu', BUTTON[button], 1)
                await this.notify('NotifyPointerButton', 'iu', BUTTON[button], 0)
            }
        } finally {
            await this.mods(mods, false)
        }
    }

    async move(at: Point) {
        await this.start()
        await this.moveTo(at)
    }

    async drag(from: Point, to: Point, mods: Mod[]) {
        await this.start()
        await this.moveTo(from)
        await this.mods(mods, true)
        try {
            await this.notify('NotifyPointerButton', 'iu', BUTTON.left, 1)
            // A few steps on the way, so apps see a drag rather than a jump
            for (let i = 1; i <= 10; i++) await this.moveTo({ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 })
            await this.notify('NotifyPointerButton', 'iu', BUTTON.left, 0)
        } finally {
            await this.mods(mods, false)
        }
    }

    async scroll(at: Point | undefined, direction: Direction, amount: number, mods: Mod[]) {
        await this.start()
        if (at) await this.moveTo(at)
        const axis = direction === 'up' || direction === 'down' ? 0 : 1
        const steps = Math.max(1, Math.min(50, Math.round(amount))) * (direction === 'up' || direction === 'left' ? -1 : 1)
        await this.mods(mods, true)
        try {
            await this.notify('NotifyPointerAxisDiscrete', 'ui', axis, steps)
        } finally {
            await this.mods(mods, false)
        }
    }

    async type(text: string) {
        await this.start()
        for (const ch of text) {
            const sym = charSym(ch)
            await this.notify('NotifyKeyboardKeysym', 'iu', sym, 1)
            await this.notify('NotifyKeyboardKeysym', 'iu', sym, 0)
        }
    }

    async key(combo: string, repeat: number) {
        await this.start()
        const { mods, key } = parseCombo(combo)
        const sym = keySym(key)
        for (let i = 0; i < Math.max(1, Math.min(repeat, 100)); i++) {
            await this.mods(mods, true)
            await this.notify('NotifyKeyboardKeysym', 'iu', sym, 1)
            await this.notify('NotifyKeyboardKeysym', 'iu', sym, 0)
            await this.mods(mods, false)
        }
    }

    // The portal can't read the pointer, so it's where the engine last put it
    async cursor() {
        return this.here
    }

    // Asks the desktop for remote control if it hasn't yet. After a no (or no answer), says so without asking again
    // until a task needs the computer.
    async ready() {
        if (!process.env.DBUS_SESSION_BUS_ADDRESS && !process.env.XDG_RUNTIME_DIR) return 'Computer use needs the engine started from your desktop session, not over SSH or as a service'
        if (this.session) return null
        if (this.refused) return `${this.refused}. Restart the engine and choose Allow when your desktop asks.`
        try {
            await this.start()
            return null
        } catch (e) {
            return `${e instanceof Error ? e.message : String(e)}. Restart the engine and choose Allow when your desktop asks.`
        }
    }

    close() {
        this.bus?.disconnect()
        this.bus = undefined
        this.session = undefined
        this.starting = undefined
    }
}

// Bilinear resize to exactly `to`
export function resize(src: PNG, to: Size): PNG {
    const out = new PNG({ width: to.width, height: to.height })
    const sx = src.width / to.width
    const sy = src.height / to.height
    for (let y = 0; y < to.height; y++) {
        const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5)
        const y0 = Math.max(0, Math.floor(fy))
        const y1 = Math.min(src.height - 1, y0 + 1)
        const wy = Math.max(0, fy - y0)
        for (let x = 0; x < to.width; x++) {
            const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5)
            const x0 = Math.max(0, Math.floor(fx))
            const x1 = Math.min(src.width - 1, x0 + 1)
            const wx = Math.max(0, fx - x0)
            const o = (y * to.width + x) * 4
            for (let c = 0; c < 4; c++) {
                const p = (yy: number, xx: number) => src.data[(yy * src.width + xx) * 4 + c]
                const top = p(y0, x0) * (1 - wx) + p(y0, x1) * wx
                const bottom = p(y1, x0) * (1 - wx) + p(y1, x1) * wx
                out.data[o + c] = Math.round(top * (1 - wy) + bottom * wy)
            }
        }
    }
    return out
}
