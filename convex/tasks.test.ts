// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { insertNumber } from './lib/numbers'
import { TASK_PENDING_MS, TASK_RUNNING_MS } from './lib/tasks'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')

async function setup() {
    const base = convexTest(schema, modules)
    const owner = base.withIdentity({ subject: 'user', tokenIdentifier: 'test|user' })
    await owner.mutation(api.workspace.create, { name: "Sam's agents", ownerName: 'Sam', timezone: 'UTC' })
    const token = newToken()
    await owner.mutation(api.runners.create, { name: 'Laptop', tokenHash: await hashToken(token) })
    await base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [{ service: 'twilio' }], models: [], channels: ['twilio'], lines: [], demo: false })
    const workspaceId = (await owner.query(api.workspace.get, {}))!._id
    // A Twilio number as the engine adds it after buying one, and a relay number
    await base.run(async (ctx) => {
        // Through the same code the app uses, so keys are stored the real way (a leading 1 dropped)
        await insertNumber(ctx, { workspaceId, handle: '+16395550100', channel: 'twilio', externalId: 'PN1' })
        await insertNumber(ctx, { workspaceId, handle: '+16395550111', channel: 'relay' })
    })
    return { base, owner, token }
}

describe('test texts', () => {
    it('queues a text from your Twilio number for the engine, and records what it sent', async () => {
        const { base, owner, token } = await setup()
        const id = await owner.mutation(api.tasks.request, { request: { kind: 'twilioTestText', from: '+16395550100', to: '639 555 0199', body: 'Hello!' } })
        const [pending] = await base.query(api.runner.tasks, { token })
        expect(pending).toEqual({ _id: id, request: { kind: 'twilioTestText', from: '+16395550100', to: '639 555 0199', body: 'Hello!' } })
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(true)
        await base.mutation(api.runner.finishTask, { token, id, result: { sentTo: '+16395550199' } })
        expect(await owner.query(api.tasks.get, { id })).toEqual({ status: 'done', result: { sentTo: '+16395550199' } })
    })

    it('only sends from your own Twilio numbers, to a real-looking number, with a short message', async () => {
        const { owner } = await setup()
        const send = (from: string, to: string, body: string) => owner.mutation(api.tasks.request, { request: { kind: 'twilioTestText', from, to, body } })
        await expect(send('+16395550111', '6395550199', 'Hi')).rejects.toThrow(/one of your Twilio numbers/)
        await expect(send('+15550000000', '6395550199', 'Hi')).rejects.toThrow(/one of your Twilio numbers/)
        await expect(send('+16395550100', '12345', 'Hi')).rejects.toThrow(/area code/)
        await expect(send('+16395550100', '6395550199', '   ')).rejects.toThrow(/320 characters/)
        await expect(send('+16395550100', '6395550199', 'x'.repeat(321))).rejects.toThrow(/320 characters/)
    })
})

describe('requests to several engines', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    // A second engine on the same account, also with Twilio
    async function second({ base, owner }: Awaited<ReturnType<typeof setup>>) {
        const token = newToken()
        await owner.mutation(api.runners.create, { name: 'Desktop', tokenHash: await hashToken(token) })
        await base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [{ service: 'twilio' }], models: [], channels: ['twilio'], lines: [], demo: false })
        return token
    }
    const buy = { kind: 'twilioBuy', phoneNumber: '+14155550199' } as const

    it('lets only one engine claim a request', async () => {
        const s = await setup()
        const { base, owner, token } = s
        const other = await second(s)
        const id = await owner.mutation(api.tasks.request, { request: buy })
        const [a, b] = await Promise.all([base.mutation(api.runner.claimTask, { token, id }), base.mutation(api.runner.claimTask, { token: other, id })])
        expect([a, b].filter(Boolean)).toHaveLength(1)
        // Once claimed it's off the list for every engine
        expect(await base.query(api.runner.tasks, { token })).toEqual([])
        expect(await base.query(api.runner.tasks, { token: other })).toEqual([])
        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'running' })
    })

    it("ignores an answer from an engine that didn't claim the request", async () => {
        const s = await setup()
        const { base, owner, token } = s
        const other = await second(s)
        const id = await owner.mutation(api.tasks.request, { request: buy })
        // Not claimed by anyone yet: an answer is ignored
        await base.mutation(api.runner.finishTask, { token, id, result: { phoneNumber: '+14155550199', sid: 'PN0' } })
        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'pending' })
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(true)
        await base.mutation(api.runner.finishTask, { token: other, id, result: { phoneNumber: '+14155550199', sid: 'PN2' } })
        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'running' })
        await base.mutation(api.runner.finishTask, { token, id, result: { phoneNumber: '+14155550199', sid: 'PN1' } })
        expect(await owner.query(api.tasks.get, { id })).toEqual({ status: 'done', result: { phoneNumber: '+14155550199', sid: 'PN1' } })
        const numbers = await owner.query(api.numbers.list, {})
        expect(numbers.filter((n) => n.handle === '+14155550199')).toEqual([expect.objectContaining({ externalId: 'PN1' })])
    })

    it('closes a request no engine claimed in time, so a later engine never runs it', async () => {
        vi.useFakeTimers()
        const { base, owner, token } = await setup()
        const id = await owner.mutation(api.tasks.request, { request: buy })
        expect(await base.query(api.runner.tasks, { token })).toHaveLength(1)
        vi.advanceTimersByTime(TASK_PENDING_MS)
        await base.finishInProgressScheduledFunctions()
        expect(await base.query(api.runner.tasks, { token })).toEqual([])
        expect(await owner.query(api.tasks.get, { id })).toEqual({ status: 'failed', error: 'expired' })
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(false)
    })

    it('refuses to claim a request past due even before it is closed', async () => {
        vi.useFakeTimers()
        const { base, owner, token } = await setup()
        const id = await owner.mutation(api.tasks.request, { request: buy })
        // The clock moves on but the scheduled close hasn't run (as for requests made before expiry existed)
        vi.setSystemTime(Date.now() + TASK_PENDING_MS + 1)
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(false)
        expect(await owner.query(api.tasks.get, { id })).toEqual({ status: 'failed', error: 'expired' })
        expect(await base.query(api.runner.tasks, { token })).toEqual([])
    })

    it('closes a claimed request the engine never answered', async () => {
        vi.useFakeTimers()
        const { base, owner, token } = await setup()
        const start = Date.now()
        const id = await owner.mutation(api.tasks.request, { request: buy })
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(true)
        vi.advanceTimersByTime(TASK_PENDING_MS)
        await base.finishInProgressScheduledFunctions()
        // Still within its time to answer
        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'running' })
        await base.finishAllScheduledFunctions(vi.runAllTimers)
        expect(Date.now()).toBeGreaterThanOrEqual(start + TASK_RUNNING_MS)
        expect(await owner.query(api.tasks.get, { id })).toEqual({ status: 'failed', error: 'expired' })
        // A late answer doesn't count
        await base.mutation(api.runner.finishTask, { token, id, result: { phoneNumber: '+14155550199', sid: 'PN1' } })
        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'failed' })
    })

    it('lets the dashboard withdraw a request no engine has taken yet', async () => {
        const { base, owner, token } = await setup()
        const id = await owner.mutation(api.tasks.request, { request: buy })
        expect(await owner.mutation(api.tasks.cancel, { id })).toBe(true)
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(false)
        const taken = await owner.mutation(api.tasks.request, { request: buy })
        expect(await base.mutation(api.runner.claimTask, { token, id: taken })).toBe(true)
        expect(await owner.mutation(api.tasks.cancel, { id: taken })).toBe(false)
    })
})
