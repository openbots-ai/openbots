import { execFile } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseCombo, type Button, type Direction, type Driver, type Mod, type Point, type Shot, type Size } from './driver'

// Mac: screenshots with screencapture and sips, the mouse through Core Graphics events and the keyboard through
// System Events, both from JavaScript for Automation (osascript). Needs Screen Recording and Accessibility allowed for
// the app the engine runs in (System Settings → Privacy & Security). Coordinates are points, so Retina screens work.

// Mouse event types, buttons and modifier flags (Core Graphics)
const DOWN: Record<Button, number> = { left: 1, right: 3, middle: 25 }
const UP: Record<Button, number> = { left: 2, right: 4, middle: 26 }
const BUTTON: Record<Button, number> = { left: 0, right: 1, middle: 2 }
const FLAG: Record<Mod, number> = { shift: 0x20000, ctrl: 0x40000, alt: 0x80000, super: 0x100000 }
const USING: Record<Mod, string> = { shift: 'shift down', ctrl: 'control down', alt: 'option down', super: 'command down' }
// Mac key codes
const KEY_CODE: Record<string, number> = {
    enter: 36, tab: 48, space: 49, backspace: 51, escape: 53, delete: 117,
    left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
    insert: 114, super: 55, ctrl: 59, shift: 56, alt: 58,
    f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

// Numbers reach the script as plain integers, never NaN or text
const num = (n: number) => {
    if (!Number.isFinite(n) || Math.abs(n) >= 1e6) throw new Error('Bad number')
    return Math.round(n)
}
const within = (n: number, lo: number, hi: number) => Math.min(Math.max(num(n), lo), hi)
const xy = (p: Point) => `${num(p.x)}, ${num(p.y)}`

// Screenshots get their own file names, so two calls can't collide
let shots = 0

const flags = (mods: Mod[]) => mods.reduce((sum, m) => sum | FLAG[m], 0)

// Shared helpers: post a mouse event (type, x, y, button, click count, flags), and where the mouse is now
const MOUSE = `ObjC.import('CoreGraphics')
function mouse(type, x, y, button, clicks, flags) {
    const e = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), button)
    if (clicks) $.CGEventSetIntegerValueField(e, 1, clicks)
    if (flags) $.CGEventSetFlags(e, flags)
    $.CGEventPost(0, e)
}
function here() { const p = $.CGEventGetLocation($.CGEventCreate(null)); return { x: p.x, y: p.y } }`

const at = (p: Point | undefined) => (p ? `const at = { x: ${num(p.x)}, y: ${num(p.y)} }` : 'const at = here()')

export type MacOp =
    | { op: 'size' }
    | { op: 'cursor' }
    | { op: 'ready' }
    | { op: 'move'; at: Point }
    | { op: 'click'; at?: Point; button: Button; count: number; mods: Mod[] }
    | { op: 'drag'; from: Point; to: Point; mods: Mod[] }
    | { op: 'scroll'; at?: Point; direction: Direction; amount: number; mods: Mod[] }
    | { op: 'type'; text: string }
    | { op: 'key'; combo: string; repeat: number }

// One action as a JXA script. Text from Claude only ever appears as a JSON string literal.
export function macScript(o: MacOp): string {
    switch (o.op) {
        case 'size':
            return `ObjC.import('AppKit'); const f = $.NSScreen.mainScreen.frame; JSON.stringify({ width: f.size.width, height: f.size.height })`
        case 'cursor':
            return `${MOUSE}\nJSON.stringify(here())`
        case 'ready':
            return `ObjC.import('CoreGraphics'); ObjC.import('ApplicationServices'); JSON.stringify({ screen: !!$.CGPreflightScreenCaptureAccess(), input: !!$.AXIsProcessTrusted() })`
        case 'move':
            return `${MOUSE}\nmouse(5, ${xy(o.at)}, 0, 0, 0)`
        case 'click': {
            const f = flags(o.mods)
            const lines = [MOUSE, at(o.at)]
            const where = o.at ? xy(o.at) : 'at.x, at.y'
            const count = within(o.count, 1, 3)
            for (let i = 1; i <= count; i++) {
                lines.push(`mouse(${DOWN[o.button]}, ${where}, ${BUTTON[o.button]}, ${i}, ${f})`, `mouse(${UP[o.button]}, ${where}, ${BUTTON[o.button]}, ${i}, ${f})`)
            }
            return lines.join('\n')
        }
        case 'drag': {
            const f = flags(o.mods)
            const [a, b] = [o.from, o.to].map(xy)
            return [MOUSE, `mouse(1, ${a}, 0, 1, ${f})`, `mouse(6, ${b}, 0, 0, ${f})`, `mouse(2, ${b}, 0, 1, ${f})`].join('\n')
        }
        case 'scroll': {
            const n = within(o.amount, 1, 50)
            const [dx, dy] = o.direction === 'up' ? [0, n] : o.direction === 'down' ? [0, -n] : o.direction === 'left' ? [n, 0] : [-n, 0]
            const lines = [MOUSE]
            if (o.at) lines.push(`mouse(5, ${xy(o.at)}, 0, 0, 0)`)
            lines.push(`const e = $.CGEventCreateScrollWheelEvent2(null, 1, 2, ${dy}, ${dx}, 0)`)
            if (o.mods.length) lines.push(`$.CGEventSetFlags(e, ${flags(o.mods)})`)
            lines.push('$.CGEventPost(0, e)')
            return lines.join('\n')
        }
        case 'type':
            return `const se = Application('System Events'); se.keystroke(${JSON.stringify(o.text)})`
        case 'key': {
            const { mods, key } = parseCombo(o.combo)
            const using = `{ using: ${JSON.stringify(mods.map((m) => USING[m]))} }`
            const one = key in KEY_CODE ? `se.keyCode(${KEY_CODE[key]}, ${using})` : `se.keystroke(${JSON.stringify(key)}, ${using})`
            const repeat = within(o.repeat, 1, 100)
            return `const se = Application('System Events'); ${repeat > 1 ? `for (let i = 0; i < ${repeat}; i++) ${one}` : one}`
        }
    }
}

export type Exec = (file: string, args: string[]) => Promise<string>
const realExec: Exec = async (file, args) => (await promisify(execFile)(file, args, { timeout: 30_000, maxBuffer: 1 << 20 })).stdout
const realFiles = { read: (path: string) => readFileSync(path), remove: (path: string) => rmSync(path, { force: true }) }

export class MacDriver implements Driver {
    constructor(
        private exec: Exec = realExec,
        private files = realFiles,
    ) {}
    private run = async (o: MacOp) => (await this.exec('osascript', ['-l', 'JavaScript', '-e', macScript(o)])).trim()

    async size() {
        return JSON.parse(await this.run({ op: 'size' })) as Size
    }
    async screenshot(target: Size): Promise<Shot> {
        const name = `openbots-shot-${process.pid}-${++shots}`
        const raw = join(tmpdir(), `${name}.png`)
        const small = join(tmpdir(), `${name}-small.png`)
        try {
            await this.exec('screencapture', ['-x', '-t', 'png', raw])
            await this.exec('sips', ['-z', String(target.height), String(target.width), raw, '--out', small])
            return { base64: this.files.read(small).toString('base64'), width: target.width, height: target.height }
        } finally {
            // Screenshots never stay on disk
            this.files.remove(raw)
            this.files.remove(small)
        }
    }
    async click(at: Point | undefined, button: Button, count: number, mods: Mod[]) {
        await this.run({ op: 'click', at, button, count, mods })
    }
    async move(at: Point) {
        await this.run({ op: 'move', at })
    }
    async drag(from: Point, to: Point, mods: Mod[]) {
        await this.run({ op: 'drag', from, to, mods })
    }
    async scroll(at: Point | undefined, direction: Direction, amount: number, mods: Mod[]) {
        await this.run({ op: 'scroll', at, direction, amount, mods })
    }
    async type(text: string) {
        await this.run({ op: 'type', text })
    }
    async key(combo: string, repeat: number) {
        await this.run({ op: 'key', combo, repeat })
    }
    async cursor() {
        return JSON.parse(await this.run({ op: 'cursor' })) as Point
    }
    async ready() {
        const { screen, input } = JSON.parse(await this.run({ op: 'ready' })) as { screen: boolean; input: boolean }
        const missing = [!screen && 'Screen Recording', !input && 'Accessibility'].filter(Boolean)
        return missing.length ? `Allow ${missing.join(' and ')} for the engine in System Settings → Privacy & Security, then restart it.` : null
    }
    close() {}
}
