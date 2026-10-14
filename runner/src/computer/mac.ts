import { execFile } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parseCombo, type Button, type Direction, type Driver, type Mod, type Point, type Shot, type Size } from './driver'

// Mac: screenshots with screencapture and sips, the mouse and keyboard through Core Graphics events,
// all from JavaScript for Automation (osascript). Text is typed by pasting. Needs Screen Recording and Accessibility allowed for
// the app the engine runs in (System Settings → Privacy & Security). Coordinates are points, so Retina screens work.

// Mouse event types, buttons and modifier flags (Core Graphics)
const DOWN: Record<Button, number> = { left: 1, right: 3, middle: 25 }
const UP: Record<Button, number> = { left: 2, right: 4, middle: 26 }
const BUTTON: Record<Button, number> = { left: 0, right: 1, middle: 2 }
const FLAG: Record<Mod, number> = { shift: 0x20000, ctrl: 0x40000, alt: 0x80000, super: 0x100000 }
// Mac key codes. Key codes are US key positions; on other keyboard layouts some shortcuts land on different keys.
const KEY_CODE: Record<string, number> = {
    enter: 36, tab: 48, space: 49, backspace: 51, escape: 53, delete: 117,
    left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
    insert: 114, super: 55, ctrl: 59, shift: 56, alt: 58,
    f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
}

// ANSI key codes for a US layout
const CHAR_CODE: Record<string, number> = {
    a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
    1: 18, 2: 19, 3: 20, 4: 21, 6: 22, 5: 23, '=': 24, 9: 25, 7: 26, '-': 27, 8: 28, 0: 29, ']': 30, o: 31, u: 32,
    '[': 33, i: 34, p: 35, l: 37, j: 38, "'": 39, k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46, '.': 47, '`': 50,
}

// Shifted US characters: the key they share and shift
const SHIFTED: Record<string, string> = {
    '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
    _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
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

// Shared helpers: post a mouse event (type, x, y, button, click count, flags), where the mouse is now, and a key press
const MOUSE = `ObjC.import('CoreGraphics')
function mouse(type, x, y, button, clicks, flags) {
    const e = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), button)
    if (clicks) $.CGEventSetIntegerValueField(e, 1, clicks)
    if (flags) $.CGEventSetFlags(e, flags)
    $.CGEventPost(0, e)
}
function here() { const p = $.CGEventGetLocation($.CGEventCreate(null)); return { x: p.x, y: p.y } }`

const KEYBOARD = `ObjC.import('CoreGraphics')
function key(code, flags) {
    for (const down of [true, false]) {
        const e = $.CGEventCreateKeyboardEvent(null, code, down)
        if (flags) $.CGEventSetFlags(e, flags)
        $.CGEventPost(0, e)
    }
}`

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
            return `ObjC.import('CoreGraphics'); const b = $.CGDisplayBounds($.CGMainDisplayID()); JSON.stringify({ width: b.size.width, height: b.size.height })`
        case 'cursor':
            return `${MOUSE}\nJSON.stringify(here())`
        case 'ready': {
            // A check this macOS doesn't have counts as allowed
            const check = (name: string) => `typeof $.${name} === 'function' ? !!$.${name}() : true`
            return `ObjC.import('CoreGraphics'); ObjC.import('ApplicationServices'); JSON.stringify({ screen: ${check('CGPreflightScreenCaptureAccess')}, input: ${check('AXIsProcessTrusted')} })`
        }
        case 'move':
            return `${MOUSE}\nmouse(5, ${xy(o.at)}, 0, 0, 0)`
        case 'click': {
            const f = flags(o.mods)
            const lines = [MOUSE, at(o.at), `mouse(5, at.x, at.y, 0, 0, 0)`, 'delay(0.03)']
            const count = within(o.count, 1, 3)
            for (let i = 1; i <= count; i++) {
                lines.push(`mouse(${DOWN[o.button]}, at.x, at.y, ${BUTTON[o.button]}, ${i}, ${f})`, `mouse(${UP[o.button]}, at.x, at.y, ${BUTTON[o.button]}, ${i}, ${f})`)
            }
            return lines.join('\n')
        }
        case 'drag': {
            const f = flags(o.mods)
            const [x1, y1, x2, y2] = [num(o.from.x), num(o.from.y), num(o.to.x), num(o.to.y)]
            return [
                MOUSE,
                `mouse(5, ${x1}, ${y1}, 0, 0, ${f})`,
                'delay(0.05)',
                `mouse(1, ${x1}, ${y1}, 0, 1, ${f})`,
                'delay(0.05)',
                'try {',
                `    for (let i = 1; i <= 10; i++) { mouse(6, ${x1} + (${x2 - x1}) * i / 10, ${y1} + (${y2 - y1}) * i / 10, 0, 0, ${f}); delay(0.01) }`,
                '} finally {',
                `    mouse(2, ${x2}, ${y2}, 0, 1, ${f})`,
                '}',
            ].join('\n')
        }
        case 'scroll': {
            // About as far as a Windows notch
            const n = within(o.amount, 1, 50) * 3
            const [dx, dy] = o.direction === 'up' ? [0, n] : o.direction === 'down' ? [0, -n] : o.direction === 'left' ? [n, 0] : [-n, 0]
            const lines = [MOUSE]
            if (o.at) lines.push(`mouse(5, ${xy(o.at)}, 0, 0, 0)`, 'delay(0.03)')
            lines.push(
                'let e',
                `if (typeof $.CGEventCreateScrollWheelEvent2 === 'function') e = $.CGEventCreateScrollWheelEvent2(null, 1, 2, ${dy}, ${dx}, 0)`,
                `else { e = $.CGEventCreate(null); $.CGEventSetType(e, 22); $.CGEventSetIntegerValueField(e, 11, ${dy}); $.CGEventSetIntegerValueField(e, 12, ${dx}); $.CGEventSetIntegerValueField(e, 96, ${dy * 10}); $.CGEventSetIntegerValueField(e, 97, ${dx * 10}) }`,
            )
            if (o.mods.length) lines.push(`$.CGEventSetFlags(e, ${flags(o.mods)})`)
            lines.push('$.CGEventPost(0, e)')
            return lines.join('\n')
        }
        case 'type': {
            // Pasted, so any text works. Every clipboard item is put back afterwards, once the app has had time to paste.
            const transient = ['org.nspasteboard.TransientType', 'org.nspasteboard.AutoGeneratedType']
            return [
                KEYBOARD,
                `ObjC.import('AppKit')`,
                'const pb = $.NSPasteboard.generalPasteboard',
                'const saved = []',
                'const items = pb.pasteboardItems',
                'const count = items.isNil() ? 0 : Number(items.count)',
                'for (let i = 0; i < count; i++) {',
                '    const item = items.objectAtIndex(i)',
                '    const types = item.types',
                '    const copy = []',
                '    for (let j = 0; j < Number(types.count); j++) {',
                '        const type = types.objectAtIndex(j)',
                '        const data = item.dataForType(type)',
                '        if (!data.isNil()) copy.push([type, data])',
                '    }',
                '    saved.push(copy)',
                '}',
                `const parts = ${JSON.stringify(o.text)}.split(/\\r\\n|\\r|\\n/)`,
                'try {',
                '    parts.forEach((part, i) => {',
                '        if (i > 0) key(36, 0)',
                '        if (!part) return',
                '        pb.clearContents()',
                '        pb.setStringForType($(part), $.NSPasteboardTypeString)',
                ...transient.map((t) => `        pb.setStringForType($(''), '${t}')`),
                `        key(9, ${FLAG.super})`,
                '        delay(0.3)',
                '    })',
                '} finally {',
                '    delay(0.45)',
                '    pb.clearContents()',
                '    if (saved.length) {',
                '        const back = saved.map((copy) => {',
                '            const item = $.NSPasteboardItem.alloc.init',
                '            copy.forEach(([type, data]) => item.setDataForType(data, type))',
                '            return item',
                '        })',
                '        pb.writeObjects($(back))',
                '    }',
                '}',
            ].join('\n')
        }
        case 'key': {
            const { mods, key } = parseCombo(o.combo)
            // The combo's own last part tells "A" from "a"
            const typed = o.combo.split('+').pop() ?? ''
            let shift = /^[A-Z]$/.test(typed)
            let code = KEY_CODE[key] ?? CHAR_CODE[key]
            if (code === undefined && SHIFTED[key] && CHAR_CODE[SHIFTED[key]] !== undefined) {
                code = CHAR_CODE[SHIFTED[key]]
                shift = true
            }
            if (code === undefined) throw new Error(`Unknown key "${key}"`)
            const repeat = within(o.repeat, 1, 100)
            const one = `key(${code}, ${flags(shift ? [...mods, 'shift'] : mods)})`
            return `${KEYBOARD}\n${repeat > 1 ? `for (let i = 0; i < ${repeat}; i++) ${one}` : one}`
        }
    }
}

export type Exec = (file: string, args: string[], timeoutMs?: number) => Promise<string>
const realExec: Exec = async (file, args, timeoutMs = 30_000) => (await promisify(execFile)(file, args, { timeout: timeoutMs, maxBuffer: 1 << 20 })).stdout

// Typing pastes piece by piece, so longer text gets longer: 30s plus 1s per 200 characters and half a second per line, up to 2 minutes
export const typeTimeout = (text: string) => Math.min(120_000, 30_000 + Math.ceil(text.length / 200) * 1000 + (text.split(/\r\n|\r|\n/).length - 1) * 500)
const realFiles = { read: (path: string) => readFileSync(path), remove: (path: string) => rmSync(path, { force: true }) }

export class MacDriver implements Driver {
    constructor(
        private exec: Exec = realExec,
        private files = realFiles,
    ) {}
    private run = async (o: MacOp) => (await this.exec('osascript', ['-l', 'JavaScript', '-e', macScript(o)], o.op === 'type' ? typeTimeout(o.text) : undefined)).trim()

    async size() {
        return JSON.parse(await this.run({ op: 'size' })) as Size
    }
    async screenshot(target: Size): Promise<Shot> {
        const name = `openbots-shot-${process.pid}-${++shots}`
        const raw = join(tmpdir(), `${name}.png`)
        const small = join(tmpdir(), `${name}-small.png`)
        try {
            await this.exec('screencapture', ['-x', '-t', 'png', '-m', raw])
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
