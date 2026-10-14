// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { insertNumber } from './lib/numbers'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')

async function setup() {
    const base = convexTest(schema, modules)
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const owner = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
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
