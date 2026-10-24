import { EventEmitter } from 'node:events'

// What the window shows. The engine reports pairing and connecting on lines starting with OPENBOTS_EVENT
// (runner/src/pair.ts and main.ts, when OPENBOTS_DESKTOP is set); anything else is just log.
export type EngineState =
    | { phase: 'starting' }
    | { phase: 'pairing'; code: string; url: string; expiresAt: number }
    | { phase: 'connected' }
    | { phase: 'restarting'; reason: string; inMs: number }

export type EngineEvent = { type: 'pair'; code: string; url: string; expiresAt: number } | { type: 'connected' }

export function parseEvent(line: string): EngineEvent | null {
    const m = line.match(/^OPENBOTS_EVENT (\{.*\})\s*$/)
    if (!m) return null
    try {
        const e = JSON.parse(m[1]) as EngineEvent
        return e.type === 'pair' || e.type === 'connected' ? e : null
    } catch {
        return null
    }
}

// After a crash the engine starts again, waiting longer each time it fails quickly, up to a minute
export const restartDelay = (failures: number) => Math.min(60_000, 2_000 * 2 ** Math.max(0, failures - 1))

// How the engine process is started, so tests can fake it (main.ts uses Electron's utilityProcess)
export interface Spawned {
    onLine(fn: (line: string, stream: 'out' | 'err') => void): void
    onExit(fn: (code: number) => void): void
    kill(): void
}

// Keeps the engine running: starts it, follows its state, restarts it when it exits, keeps the last lines of log
export class Engine extends EventEmitter<{ state: [EngineState]; log: [string] }> {
    state: EngineState = { phase: 'starting' }
    readonly log: string[] = []
    private child: Spawned | null = null
    private failures = 0
    private startedAt = 0
    private timer: ReturnType<typeof setTimeout> | null = null
    private stopped = false

    constructor(private readonly spawn: () => Spawned, private readonly now: () => number = Date.now) {
        super()
    }

    start() {
        this.stopped = false
        this.startedAt = this.now()
        this.set({ phase: 'starting' })
        const child = this.spawn()
        this.child = child
        child.onLine((line) => {
            this.log.push(line)
            if (this.log.length > 300) this.log.shift()
            this.emit('log', line)
            const e = parseEvent(line)
            if (e?.type === 'pair') this.set({ phase: 'pairing', code: e.code, url: e.url, expiresAt: e.expiresAt })
            if (e?.type === 'connected') {
                this.failures = 0
                this.set({ phase: 'connected' })
            }
        })
        child.onExit((code) => {
            if (this.child !== child) return
            this.child = null
            if (this.stopped) return
            // A run that lasted a while counts as healthy, so one crash after days doesn't wait long
            this.failures = this.now() - this.startedAt > 5 * 60_000 ? 1 : this.failures + 1
            const inMs = restartDelay(this.failures)
            const last = [...this.log].reverse().find((l) => l.trim() && !l.startsWith('OPENBOTS_EVENT'))
            this.set({ phase: 'restarting', reason: last ?? `The engine stopped (code ${code})`, inMs })
            this.timer = setTimeout(() => this.start(), inMs)
        })
    }

    restart() {
        this.stop()
        this.start()
    }

    stop() {
        this.stopped = true
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        const child = this.child
        this.child = null
        child?.kill()
    }

    private set(state: EngineState) {
        this.state = state
        this.emit('state', state)
    }
}
