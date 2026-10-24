// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Engine, parseEvent, restartDelay, type Spawned } from './engine'

// A fake engine process: lines and an exit you trigger from the test
function fake() {
    const procs: { line: (l: string) => void; exit: (code: number) => void; killed: boolean }[] = []
    const spawn = (): Spawned => {
        let onLine: (l: string, s: 'out' | 'err') => void = () => {}
        let onExit: (c: number) => void = () => {}
        const p = { line: (l: string) => onLine(l, 'out'), exit: (c: number) => onExit(c), killed: false }
        procs.push(p)
        return { onLine: (fn) => (onLine = fn), onExit: (fn) => (onExit = fn), kill: () => (p.killed = true) }
    }
    return { procs, spawn }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the engine in the app', () => {
    it('reads pairing and connected events, and ignores everything else', () => {
        expect(parseEvent('OPENBOTS_EVENT {"type":"pair","code":"AAAA-BBBB","url":"https://x/dashboard?pair=AAAA-BBBB","expiresAt":1}')).toEqual({
            type: 'pair',
            code: 'AAAA-BBBB',
            url: 'https://x/dashboard?pair=AAAA-BBBB',
            expiresAt: 1,
        })
        expect(parseEvent('OPENBOTS_EVENT {"type":"connected"}')).toEqual({ type: 'connected' })
        expect(parseEvent('OPENBOTS_EVENT {broken')).toBeNull()
        expect(parseEvent('OPENBOTS_EVENT {"type":"rm -rf"}')).toBeNull()
        expect(parseEvent('Connected. This computer stays connected')).toBeNull()
    })

    it('shows the code while pairing, then connected', () => {
        const { procs, spawn } = fake()
        const engine = new Engine(spawn)
        engine.start()
        expect(engine.state).toEqual({ phase: 'starting' })
        procs[0].line('OPENBOTS_EVENT {"type":"pair","code":"AAAA-BBBB","url":"u","expiresAt":5}')
        expect(engine.state).toMatchObject({ phase: 'pairing', code: 'AAAA-BBBB' })
        procs[0].line('OPENBOTS_EVENT {"type":"connected"}')
        expect(engine.state).toEqual({ phase: 'connected' })
    })

    it('restarts after a crash, waiting longer each time it fails quickly', () => {
        expect([1, 2, 3, 4, 10].map(restartDelay)).toEqual([2_000, 4_000, 8_000, 16_000, 60_000])
        let now = 0
        const { procs, spawn } = fake()
        const engine = new Engine(spawn, () => now)
        engine.start()
        procs[0].line('Couldn’t reach Convex')
        procs[0].exit(1)
        expect(engine.state).toEqual({ phase: 'restarting', reason: 'Couldn’t reach Convex', inMs: 2_000 })
        vi.advanceTimersByTime(2_000)
        expect(procs).toHaveLength(2)
        procs[1].exit(1)
        expect(engine.state).toMatchObject({ inMs: 4_000 })
        vi.advanceTimersByTime(4_000)
        // A long healthy run resets the wait
        now = 10 * 60_000
        procs[2].exit(1)
        expect(engine.state).toMatchObject({ inMs: 2_000 })
    })

    it('stops for good when asked, and restarts on demand', () => {
        const { procs, spawn } = fake()
        const engine = new Engine(spawn)
        engine.start()
        engine.stop()
        expect(procs[0].killed).toBe(true)
        procs[0].exit(0)
        vi.advanceTimersByTime(120_000)
        expect(procs).toHaveLength(1)
        engine.restart()
        expect(procs).toHaveLength(2)
    })
})
