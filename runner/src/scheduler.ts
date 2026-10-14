import type { Job, Store } from './store'

// Runs reminders and watches when they're due, and asks for check-ins every tick. What firing means (texting,
// checking the web) is the pipeline's job; this file only decides when, and what happens after.

export type Fired = { outcome: 'sent' | 'unchanged' | 'failed'; result?: string } | { outcome: 'later'; inMs: number }

// A watch ends after this long even without an end date, and stops after this many failed checks in a row
export const WATCH_DAYS = 30
export const WATCH_FAILURES = 3

type Deps = {
    store: Store
    now: () => number
    fire: (job: Job) => Promise<Fired>
    tellOwner: (job: Job, text: string) => Promise<void>
    checkIns: (now: number) => Promise<void>
    log: (line: string) => void
}

export class Scheduler {
    private timer?: NodeJS.Timeout
    private running = false

    constructor(private deps: Deps) {}

    start(everyMs = 30_000) {
        const go = () => void this.tick().catch((e) => this.deps.log(`Scheduler tick failed: ${e instanceof Error ? e.message : String(e)}`))
        this.timer = setInterval(go, everyMs)
        go()
    }

    stop() {
        clearInterval(this.timer)
    }

    async tick() {
        // One tick at a time, so a slow check can't fire the same job twice
        if (this.running) return
        this.running = true
        try {
            const now = this.deps.now()
            for (const job of this.deps.store.dueJobs(now)) {
                // One job going wrong must not stop the others (nothing from the job is logged)
                await this.run(job, now).catch((e) => this.deps.log(`A ${job.kind} (#${job.id}) could not be finished: ${e instanceof Error ? e.message : String(e)}`))
            }
            await this.deps.checkIns(now).catch((e) => this.deps.log(`Check-ins failed: ${e instanceof Error ? e.message : String(e)}`))
        } finally {
            this.running = false
        }
    }

    private async run(job: Job, now: number) {
        const { store } = this.deps
        let fired: Fired
        try {
            fired = await this.deps.fire(job)
        } catch (e) {
            this.deps.log(`A ${job.kind} failed: ${e instanceof Error ? e.message : String(e)}`)
            fired = { outcome: 'failed' }
        }
        const end = job.until ?? job.createdAt + WATCH_DAYS * 86_400_000
        if (fired.outcome === 'later') {
            const dueAt = now + fired.inMs
            return store.updateJob(job.id, { dueAt, ...(job.kind === 'watch' && dueAt >= end ? { active: false } : {}) })
        }
        if (job.kind === 'reminder') return store.updateJob(job.id, { active: false })

        const next = now + (job.everyMin ?? 60) * 60_000
        if (fired.outcome === 'failed') {
            const failures = job.failures + 1
            if (failures >= WATCH_FAILURES) {
                store.updateJob(job.id, { active: false, failures })
                await this.deps.tellOwner(job, `I stopped watching "${job.text}" after ${WATCH_FAILURES} checks failed in a row. Ask me again to restart it.`)
                return
            }
            store.updateJob(job.id, { failures, dueAt: next, ...(next >= end ? { active: false } : {}) })
            return
        }
        store.updateJob(job.id, { failures: 0, dueAt: next, ...(fired.result ? { last: fired.result } : {}), ...(next >= end ? { active: false } : {}) })
    }
}
