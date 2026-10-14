// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MacDriver, macScript } from './mac'

describe('Mac scripts', () => {
    it('types any text literally, never as code', () => {
        const text = 'He said "hi" `rm -rf` ${x}\nnext'
        const script = macScript({ op: 'type', text })
        expect(script).toContain(`keystroke(${JSON.stringify(text)})`)
    })

    it('presses named keys by key code and characters by keystroke, with modifiers', () => {
        expect(macScript({ op: 'key', combo: 'cmd+s', repeat: 1 })).toContain(`keystroke("s", { using: ["command down"] })`)
        expect(macScript({ op: 'key', combo: 'Return', repeat: 2 })).toContain('for (let i = 0; i < 2; i++) se.keyCode(36, { using: [] })')
        expect(macScript({ op: 'key', combo: 'ctrl+shift+Tab', repeat: 1 })).toContain('keyCode(48, { using: ["control down","shift down"] })')
    })

    it('clicks with the click count set, and holds modifiers on the event', () => {
        const script = macScript({ op: 'click', at: { x: 100, y: 50 }, button: 'left', count: 2, mods: ['super'] })
        expect(script).toContain('mouse(1, 100, 50, 0, 1, 1048576)')
        expect(script).toContain('mouse(2, 100, 50, 0, 2, 1048576)')
        expect(macScript({ op: 'click', button: 'right', count: 1, mods: [] })).toContain('const at = here()')
    })

    it('checks Screen Recording and Accessibility', () => {
        expect(macScript({ op: 'ready' })).toContain('CGPreflightScreenCaptureAccess')
        expect(macScript({ op: 'ready' })).toContain('AXIsProcessTrusted')
    })
})

describe('Mac script number safety', () => {
    it('rejects numbers that are not sane', () => {
        expect(() => macScript({ op: 'move', at: { x: NaN, y: 1 } })).toThrow('Bad number')
        expect(() => macScript({ op: 'click', at: { x: 1e9, y: 1 }, button: 'left', count: 1, mods: [] })).toThrow('Bad number')
        expect(() => macScript({ op: 'drag', from: { x: 1, y: 1 }, to: { x: 1, y: Infinity }, mods: [] })).toThrow('Bad number')
    })

    it('clamps counts, repeats and scroll amounts', () => {
        expect(macScript({ op: 'key', combo: 'a', repeat: 9999 })).toContain('i < 100')
        expect(macScript({ op: 'scroll', direction: 'up', amount: 500, mods: [] })).toContain('CGEventCreateScrollWheelEvent2(null, 1, 2, 50, 0, 0)')
        const clicks = macScript({ op: 'click', at: { x: 1, y: 1 }, button: 'left', count: 99, mods: [] })
        expect(clicks).toContain('mouse(1, 1, 1, 0, 3, 0)')
        expect(clicks).not.toContain(', 4, 0)')
    })

    it('presses bare modifiers and insert by key code', () => {
        expect(macScript({ op: 'key', combo: 'Super_L', repeat: 1 })).toContain('keyCode(55, { using: [] })')
        expect(macScript({ op: 'key', combo: 'insert', repeat: 1 })).toContain('keyCode(114,')
        expect(macScript({ op: 'key', combo: 'ctrl+.', repeat: 1 })).toContain('keystroke(".", { using: ["control down"] })')
    })
})

describe('the Mac driver', () => {
    it('takes a screenshot and resizes it to the size Claude sees', async () => {
        const calls: [string, string[]][] = []
        const driver = new MacDriver(
            async (file, args) => (calls.push([file, args]), ''),
            { read: () => Buffer.from('png'), remove: () => {} },
        )
        const shot = await driver.screenshot({ width: 1512, height: 982 })
        expect(shot).toEqual({ base64: Buffer.from('png').toString('base64'), width: 1512, height: 982 })
        expect(calls[0][0]).toBe('screencapture')
        expect(calls[0][1].slice(0, 3)).toEqual(['-x', '-t', 'png'])
        expect(calls[1][0]).toBe('sips')
        expect(calls[1][1].slice(0, 3)).toEqual(['-z', '982', '1512'])
    })

    it('gives each screenshot its own temp files and removes them', async () => {
        const paths: string[] = []
        const removed: string[] = []
        const driver = new MacDriver(async (file, args) => (file === 'screencapture' && paths.push(args[3]), ''), {
            read: () => Buffer.from('png'),
            remove: (p) => void removed.push(p),
        })
        await driver.screenshot({ width: 10, height: 10 })
        await driver.screenshot({ width: 10, height: 10 })
        expect(paths[0]).not.toBe(paths[1])
        expect(removed).toHaveLength(4)
    })

    it('says what permission is missing', async () => {
        const driver = new MacDriver(async () => '{"screen":false,"input":true}')
        expect(await driver.ready()).toMatch(/Screen Recording/)
        const ok = new MacDriver(async () => '{"screen":true,"input":true}')
        expect(await ok.ready()).toBeNull()
    })
})
