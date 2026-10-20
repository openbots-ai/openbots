// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import { claimEach, type Task } from './sync'

const task = (id: string): Task => ({ _id: id as Id<'tasks'>, request: { kind: 'twilioBuy', phoneNumber: '+14155550199' } })
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('requests from the dashboard', () => {
    it('runs a request only after winning its claim, and claims each one once', async () => {
        const claim = vi.fn(async (id: Id<'tasks'>) => id === 'won')
        const run = vi.fn()
        const each = claimEach(claim, run, () => {})
        each([task('won'), task('lost')])
        each([task('won'), task('lost')]) // the same list again, as the subscription re-sends it
        await settle()
        expect(claim).toHaveBeenCalledTimes(2)
        expect(run).toHaveBeenCalledTimes(1)
        expect(run).toHaveBeenCalledWith(task('won'))
    })

    it("skips a request it couldn't claim", async () => {
        const run = vi.fn()
        const onError = vi.fn()
        claimEach(() => Promise.reject(new Error('offline')), run, onError)([task('a')])
        await settle()
        expect(run).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith(new Error('offline'))
    })
})
