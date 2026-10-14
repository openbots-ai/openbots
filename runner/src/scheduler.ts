import type { Job, Store } from './store'

// Runs reminders and watches when they're due, and asks for check-ins every tick. What firing means (texting,
// checking the web) is the pipeline's job; this file only decides when, and what happens after.

export type Fired = { outcome: 'sent' | 'unchanged' | 'failed'; result?: string } | { outcome: 'later'; inMs: number }

// A watch ends after this long even without an end date, and stops after this many failed checks in a row. A reminder
// that can't go out waits up to as long, and is dropped after as many failed sends.
export const WATCH_DAYS = 30
export const WATCH_FAILURES = 3
// A reminder whose send failed tries again this much later
export const RETRY_MS = 5 * 60_000
// A job that hasn't finished by then counts as failed, so one stuck call can't hold up the rest
export const FIRE_DEADLINE_MS = 2 * 60_000

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
    // Jobs whose fire is still running after its deadline; they're skipped until it settles
    private inFlight = new Set<number>()

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
                if (this.inFlight.has(job.id)) continue
                // One job going wrong must not stop the others (nothing from the job is logged)
                await this.run(job, now).catch((e) => this.deps.log(`A ${job.kind} (#${job.id}) could not be finished: ${e instanceof Error ? e.message : String(e)}`))
            }
            await this.deps.checkIns(now).catch((e) => this.deps.log(`Check-ins failed: ${e instanceof Error ? e.message : String(e)}`))
        } finally {
            this.running = false
        }
    }

    // The job's fire, given up on after the deadline. Its outcome is applied once: a fire that finishes after its
    // deadline is ignored, and the job isn't fired again until it does finish.
    private fire(job: Job): Promise<Fired> {
        this.inFlight.add(job.id)
        const firing = this.deps.fire(job).finally(() => this.inFlight.delete(job.id))
        let timer: NodeJS.Timeout | undefined
        const deadline = new Promise<Fired>((resolve) => {
            timer = setTimeout(() => {
                this.deps.log(`A ${job.kind} (#${job.id}) took too long, so it counts as failed`)
                resolve({ outcome: 'failed' })
            }, FIRE_DEADLINE_MS)
        })
        firing.catch(() => {})
        return Promise.race([firing, deadline]).finally(() => clearTimeout(timer))
    }

    private async run(job: Job, now: number) {
        const { store } = this.deps
        let fired: Fired
        try {
            fired = await this.fire(job)
        } catch (e) {
            this.deps.log(`A ${job.kind} failed: ${e instanceof Error ? e.message : String(e)}`)
            fired = { outcome: 'failed' }
        }
        // A reminder's waiting starts counting the first time it can't go out
        const until = job.kind === 'reminder' && job.until === null && fired.outcome !== 'sent' ? now + WATCH_DAYS * 86_400_000 : job.until
        const end = until ?? job.createdAt + WATCH_DAYS * 86_400_000
        if (fired.outcome === 'later') {
            const dueAt = now + fired.inMs
            return store.updateJob(job.id, { dueAt, until: until ?? undefined, ...(dueAt >= end ? { active: false } : {}) })
        }
        if (job.kind === 'reminder') {
            if (fired.outcome !== 'failed') return store.updateJob(job.id, { active: false })
            // A failed send tries again in a few minutes, and gives up after a few tries or once it has waited too long
            const failures = job.failures + 1
            const dueAt = now + RETRY_MS
            if (failures >= WATCH_FAILURES || dueAt >= end) {
                store.updateJob(job.id, { active: false, failures })
                return this.deps.log(`A reminder (#${job.id}) was dropped after ${failures} failed ${failures === 1 ? 'send' : 'sends'}`)
            }
            return store.updateJob(job.id, { failures, dueAt, until: until ?? undefined })
        }

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
