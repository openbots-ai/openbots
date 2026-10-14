// What the engine needs from a computer to let Claude use it: screenshots, the mouse and the keyboard. One
// implementation per OS (windows.ts, mac.ts). Coordinates are in the computer's own input space (`size()`): pixels on
// Windows, points on a Mac.

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Button = 'left' | 'right' | 'middle'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type Mod = 'ctrl' | 'shift' | 'alt' | 'super'
// A PNG, base64, already the size Claude sees
export type Shot = { base64: string; width: number; height: number }

export interface Driver {
    size(): Promise<Size>
    // The whole screen, resized to exactly `target`
    screenshot(target: Size): Promise<Shot>
    // `at` undefined clicks where the mouse is
    click(at: Point | undefined, button: Button, count: number, mods: Mod[]): Promise<void>
    move(at: Point): Promise<void>
    drag(from: Point, to: Point, mods: Mod[]): Promise<void>
    scroll(at: Point | undefined, direction: Direction, amount: number, mods: Mod[]): Promise<void>
    // Types text literally, newlines as Enter
    type(text: string): Promise<void>
    // A key or combination ("ctrl+s"), pressed `repeat` times
    key(combo: string, repeat: number): Promise<void>
    cursor(): Promise<Point>
    // What's missing before it can work (a Mac's Screen Recording or Accessibility permission), or null
    ready(): Promise<string | null>
    close(): void
}

// Claude's screenshot limits, with room to spare: long edge and total pixels
export const MAX_EDGE = 1568
export const MAX_PIXELS = 1_150_000

// The size screenshots are sent at: the screen, shrunk (never grown) to fit both limits
export function fitted(size: Size): Size {
    const scale = Math.min(1, MAX_EDGE / Math.max(size.width, size.height), Math.sqrt(MAX_PIXELS / (size.width * size.height)))
    return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) }
}

const clamp = (n: number, max: number) => Math.min(Math.max(0, n), max - 1)

// A point on the screenshot Claude saw → the same spot on the screen
export const toScreen = (p: Point, shot: Size, screen: Size): Point => ({
    x: clamp(Math.round((p.x * screen.width) / shot.width), screen.width),
    y: clamp(Math.round((p.y * screen.height) / shot.height), screen.height),
})

// A point on the screen → where it is on the screenshot (for cursor_position)
export const toShot = (p: Point, shot: Size, screen: Size): Point => ({
    x: Math.round((p.x * shot.width) / screen.width),
    y: Math.round((p.y * shot.height) / screen.height),
})

const MODS: Record<string, Mod> = { ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', option: 'alt', opt: 'alt', super: 'super', cmd: 'super', command: 'super', win: 'super', meta: 'super' }
const KEYS: Record<string, string> = {
    return: 'enter', enter: 'enter', kp_enter: 'enter',
    escape: 'escape', esc: 'escape',
    tab: 'tab', backspace: 'backspace', delete: 'delete', del: 'delete', space: 'space',
    up: 'up', down: 'down', left: 'left', right: 'right',
    home: 'home', end: 'end',
    page_up: 'pageup', pageup: 'pageup', prior: 'pageup',
    page_down: 'pagedown', pagedown: 'pagedown', next: 'pagedown',
    plus: '+', minus: '-',
}

export function parseMods(text?: string): Mod[] {
    if (!text) return []
    return text
        .split('+')
        .map((m) => MODS[m.trim().toLowerCase()])
        .filter((m): m is Mod => !!m)
}

export function parseCombo(text: string): { mods: Mod[]; key: string } {
    const parts = text.split('+').map((p) => p.trim())
    const last = parts.pop() ?? ''
    if (!last) throw new Error(`No key in "${text}"`)
    const mods = parts.map((p) => {
        const m = MODS[p.toLowerCase()]
        if (!m) throw new Error(`Unknown key "${p}"`)
        return m
    })
    const lower = last.toLowerCase()
    const key = KEYS[lower] ?? (/^f([1-9]|1[0-2])$/.test(lower) ? lower : [...last].length === 1 ? lower : null)
    if (!key) throw new Error(`Unknown key "${last}"`)
    return { mods, key }
}
