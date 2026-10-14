// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Vault } from './crypto'
import { Scheduler, WATCH_FAILURES, type Fired } from './scheduler'
import { Store, type Job } from './store'

let dir: string
let now = Date.parse('2026-10-14T12:00:00Z')
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-'))
    now = Date.parse('2026-10-14T12:00:00Z')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function setup(fire: (job: Job) => Promise<Fired>) {
    const store = new Store(join(dir, 'db'), Vault.open(dir))
    const told: string[] = []
    const scheduler = new Scheduler({ store, now: () => now, fire, tellOwner: async (_j, text) => void told.push(text), checkIns: async () => {}, log: () => {} })
    const job = (over: Partial<Job> = {}) =>
        store.addJob({ kind: 'reminder', agentId: 'a1', to: '+16395550100', number: '+18257731569', channel: 'twilio', dueAt: now + 60_000, everyMin: null, until: null, text: 'stretch', ...over })
    return { store, scheduler, told, job }
}

describe('scheduler', () => {
    it('fires a reminder once when it’s due, then retires it', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent' }))
        const { scheduler, store, job } = setup(fire)
        job()
        await scheduler.tick()
        expect(fire).not.toHaveBeenCalled()
        now += 60_000
        await scheduler.tick()
        await scheduler.tick()
        expect(fire).toHaveBeenCalledTimes(1)
        expect(store.jobsFor('a1')).toEqual([])
    })

    it('fires a reminder that came due while the engine was off, once', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent' }))
        const { scheduler, job } = setup(fire)
        job({ dueAt: now - 3 * 3_600_000 })
        await scheduler.tick()
        await scheduler.tick()
        expect(fire).toHaveBeenCalledTimes(1)
    })

    it('checks a watch on its schedule, keeps what it found, and stops at its end', async () => {
        const results = ['#1 in Canada', '#1 in Canada', '#2 in Canada']
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent', result: results.shift() }))
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, until: now + 90 * 60_000, dueAt: now })
        await scheduler.tick()
        expect(store.jobsFor('a1')[0]).toMatchObject({ last: '#1 in Canada', dueAt: now + 30 * 60_000 })
        now += 30 * 60_000
        await scheduler.tick()
        now += 30 * 60_000
        await scheduler.tick()
        now += 30 * 60_000
        await scheduler.tick()
        expect(store.jobsFor('a1')).toEqual([])
        expect(fire).toHaveBeenCalledTimes(3)
    })

    it('waits when the pipeline says later (quiet hours)', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'later', inMs: 3_600_000 }))
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now })
        await scheduler.tick()
        expect(store.jobsFor('a1')[0].dueAt).toBe(now + 3_600_000)
    })

    it(`texts you once and stops a watch after ${WATCH_FAILURES} failed checks`, async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'failed' }))
        const { scheduler, store, told, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now, text: 'Uni ranking' })
        for (let i = 0; i < WATCH_FAILURES; i++) {
            await scheduler.tick()
            now += 30 * 60_000
        }
        expect(store.jobsFor('a1')).toEqual([])
        expect(told).toHaveLength(1)
        expect(told[0]).toMatch(/stopped watching/)
    })

    it('keeps job text sealed on disk and counts jobs per agent', async () => {
        const { store, job } = setup(async () => ({ outcome: 'sent' }))
        const id = job()
        job({ kind: 'watch', everyMin: 30 })
        store.updateJob(id, { last: 'the last result' })
        expect(store.jobCounts()).toEqual([{ agentId: 'a1', reminders: 1, watches: 1 }])
        const raw = new DatabaseSync(join(dir, 'db')).prepare('SELECT recipient, text, last FROM jobs WHERE id = ?').get(id) as { recipient: string; text: string; last: string }
        expect(raw.recipient).not.toContain('+16395550100')
        expect(raw.text).not.toContain('stretch')
        expect(raw.last).not.toContain('the last result')
        expect(store.jobsFor('a1')[0]).toMatchObject({ to: '+16395550100', text: 'stretch', last: 'the last result' })
        expect(store.cancelJob(id, 'other-agent')).toBe(false)
        expect(store.cancelJob(id, 'a1')).toBe(true)
        expect(store.jobsFor('a1').map((j) => j.id)).not.toContain(id)
    })

    it('stops a watch with no end date after 30 days', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent' }))
        // The job's creation time comes from the real clock, so pin it to the test's
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(now)
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 12 * 60, dueAt: now })
        vi.useRealTimers()
        for (let i = 0; i < 70; i++) {
            await scheduler.tick()
            now += 12 * 3_600_000
        }
        expect(store.jobsFor('a1')).toEqual([])
        expect(fire).toHaveBeenCalledTimes(60)
    })

    it('does not check a watch again once it is past its end, even when the pipeline says later', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'later', inMs: 3_600_000 }))
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now, until: now + 30 * 60_000 })
        await scheduler.tick()
        expect(store.jobsFor('a1')).toEqual([])
    })

    it('never checks a watch more often than every 30 minutes', async () => {
        const { store, job } = setup(async () => ({ outcome: 'sent' }))
        job({ kind: 'watch', everyMin: 1 })
        expect(store.jobsFor('a1')[0].everyMin).toBe(30)
    })

    it('keeps going when one job blows up, and skips unreadable rows', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'failed' }))
        const { store, job, told } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now })
        const second = job({ dueAt: now })
        new DatabaseSync(join(dir, 'db')).prepare("UPDATE jobs SET failures = 2 WHERE kind = 'watch'").run()
        const broken = new Scheduler({ store, now: () => now, fire, tellOwner: async () => { throw new Error('boom') }, checkIns: async () => {}, log: () => {} })
        await expect(broken.tick()).resolves.toBeUndefined()
        expect(fire).toHaveBeenCalledTimes(2)
        expect(told).toEqual([])
        new DatabaseSync(join(dir, 'db')).prepare('UPDATE jobs SET text = ? WHERE id = ?').run('garbage', second)
        expect(() => store.dueJobs(now)).not.toThrow()
    })
})
