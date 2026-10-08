// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import { msUntilQuietEnds } from './lib/quiet'
import { handleKey } from './lib/handles'
import { parseReply, toTurns } from './lib/prompt'
import { demoReply } from './lib/demo'

const modules = import.meta.glob('./**/*.ts')

async function setup(status: 'live' | 'paused' = 'live') {
    const t = convexTest(schema, modules)
    await t.mutation(api.workspace.create, { name: 'Test', ownerName: 'Sam', timezone: 'UTC' })
    const agentId = await t.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status, models: { brain: 'gpt-5.1' } })
    await t.mutation(api.numbers.create, { handle: '+1 (415) 555-0101', agentId })
    return { t, agentId }
}

describe('helpers', () => {
    it('keys handles so different spellings match', () => {
        expect(handleKey('+1 (415) 555-0101')).toBe(handleKey('4155550101'))
        expect(handleKey('A@B.co')).toBe('a@b.co')
        expect(handleKey('hi')).toBeNull()
    })
    it('finds the end of quiet hours, across midnight', () => {
        const at = (h: number, m = 0) => Date.UTC(2026, 9, 8, h, m)
        expect(msUntilQuietEnds(at(23), 'UTC', '22:00', '08:00')).toBe(9 * 3_600_000)
        expect(msUntilQuietEnds(at(7, 30), 'UTC', '22:00', '08:00')).toBe(30 * 60_000)
        expect(msUntilQuietEnds(at(12), 'UTC', '22:00', '08:00')).toBe(0)
        expect(msUntilQuietEnds(at(13), 'UTC', '12:00', '14:00')).toBe(3_600_000)
    })
    it('builds model turns that open with the contact', () => {
        expect(
            toTurns([
                { from: 'agent', body: 'hello' },
                { from: 'contact', body: 'a' },
                { from: 'contact', body: 'b' },
                { from: 'agent', body: 'c' },
            ]),
        ).toEqual([
            { role: 'user', content: 'a\nb' },
            { role: 'assistant', content: 'c' },
        ])
    })
    it('strips the handoff marker', () => {
        expect(parseReply("I'll check with Sam [[handoff]]")).toEqual({ body: "I'll check with Sam", handoff: true })
    })
})

describe('inbound pipeline', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubEnv('OPENAI_API_KEY', 'test-key')
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('creates the contact and conversation, then the agent replies and usage is recorded', async () => {
        const { t } = await setup()
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'on it!' } }] }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const { conversationId } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '+1 212 555 0187', body: 'can you help?', name: 'Dana' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)

        const thread = await t.query(api.conversations.thread, { id: conversationId })
        expect(thread?.contact.name).toBe('Dana')
        expect(thread?.messages.map((m) => [m.from, m.body, m.by])).toEqual([
            ['contact', 'can you help?', undefined],
            ['agent', 'on it!', 'ai'],
        ])
        expect(thread?.conversation.replying).toBe(false)
        const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
        expect(body.model).toBe('gpt-5.1')
        expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'can you help?' })

        const usage = await t.query(api.usage.summary, { today: new Date().toISOString().slice(0, 10) })
        expect(usage).toMatchObject([{ slot: 'brain', model: 'gpt-5.1', count: 1 }])
        // The second text from the same person lands in the same conversation
        const again = await t.mutation(api.inbound.simulate, { to: '+14155550101', from: '2125550187', body: 'thanks' })
        expect(again.conversationId).toBe(conversationId)
        expect((await t.query(api.notifications.list, {})).map((n) => n.kind)).toEqual(['new_contact'])
    })

    it('answers with a sample reply in demo mode when the provider has no key', async () => {
        vi.unstubAllEnvs()
        vi.stubEnv('DEMO_MODE', 'true')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const { t } = await setup()
        const { conversationId } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'book me a table for friday' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const thread = await t.query(api.conversations.thread, { id: conversationId })
        expect(thread?.conversation.needsYou).toBeUndefined()
        expect(thread?.messages.at(-1)).toMatchObject({ from: 'agent', body: demoReply('book me a table for friday') })
        // No provider was called
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('flags the conversation for you when the provider key is missing', async () => {
        vi.unstubAllEnvs()
        const { t } = await setup()
        const { conversationId } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'hello' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const thread = await t.query(api.conversations.thread, { id: conversationId })
        expect(thread?.conversation.needsYou).toBe(true)
        expect(thread?.conversation.problem).toContain('OPENAI_API_KEY')
        expect(await t.query(api.conversations.needsYouCount, {})).toBe(1)

        await t.mutation(api.conversations.send, { id: conversationId, body: 'hi, Sam here' })
        const after = await t.query(api.conversations.thread, { id: conversationId })
        expect(after?.conversation.needsYou).toBeUndefined()
        expect(after?.messages.at(-1)).toMatchObject({ body: 'hi, Sam here', by: 'you' })
    })

    it("doesn't reply for paused agents", async () => {
        const { t } = await setup('paused')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const { conversationId } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'hello' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect(fetchMock).not.toHaveBeenCalled()
        expect((await t.query(api.conversations.thread, { id: conversationId }))?.conversation.problem).toContain('paused')
    })

    it('hands off when the model asks for you, and stops at the budget', async () => {
        const { t } = await setup()
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "let me check with Sam [[handoff]]" } }] }))))
        const { conversationId } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'refund please' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const thread = await t.query(api.conversations.thread, { id: conversationId })
        expect(thread?.messages.at(-1)?.body).toBe('let me check with Sam')
        expect(thread?.conversation.needsYou).toBe(true)

        const ws = (await t.query(api.workspace.get, {}))!
        await t.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, timezone: 'UTC', dailyBudget: 1 })
        await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'hello?' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const after = await t.query(api.conversations.thread, { id: conversationId })
        expect(after?.conversation.problem).toContain('budget')
    })

    it('sends typing and the reply to the relay, and marks the message delivered', async () => {
        const { t } = await setup()
        vi.stubEnv('OUTBOUND_WEBHOOK_URL', 'https://relay.test/out')
        vi.stubEnv('OUTBOUND_SECRET', 'relay')
        const calls: { url: string; body: Record<string, string>; auth: string | null }[] = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit) => {
                const body = JSON.parse(init.body as string)
                if (url.startsWith('https://relay.test')) {
                    calls.push({ url, body, auth: new Headers(init.headers).get('Authorization') })
                    return new Response('ok')
                }
                return new Response(JSON.stringify({ choices: [{ message: { content: 'sure' } }] }))
            }),
        )
        const ws = (await t.query(api.workspace.get, {}))!
        await t.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, timezone: 'UTC', replyDelaySec: 10 })
        const { conversationId, markRead } = await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'hey' })
        expect(markRead).toBe(true)
        // The typing bubble goes out two seconds before the reply is written
        vi.advanceTimersByTime(8_500)
        await t.finishInProgressScheduledFunctions()
        expect(calls.map((c) => c.body.type)).toEqual(['typing'])
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect(calls.map((c) => c.body.type)).toEqual(['typing', 'message'])
        expect(calls[1]).toMatchObject({ auth: 'Bearer relay', body: { from: '+1 (415) 555-0101', to: '2125550187', body: 'sure' } })
        const thread = await t.query(api.conversations.thread, { id: conversationId })
        expect(thread?.messages.at(-1)?.delivery).toBe('sent')
    })

    it('rejects texts to numbers that are not yours', async () => {
        const { t } = await setup()
        await expect(t.mutation(api.inbound.simulate, { to: '5550000000', from: '2125550187', body: 'hi' })).rejects.toThrow(/isn't one of your/)
    })

    it('POST /inbound checks the secret and validates the body', async () => {
        const { t } = await setup()
        expect((await t.fetch('/inbound', { method: 'POST', body: '{}' })).status).toBe(503)
        vi.stubEnv('INBOUND_SECRET', 's3cret')
        expect((await t.fetch('/inbound', { method: 'POST', body: '{}' })).status).toBe(401)
        const auth = { Authorization: 'Bearer s3cret' }
        expect((await t.fetch('/inbound', { method: 'POST', headers: auth, body: '{"to":1}' })).status).toBe(400)
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'yo' } }] }))))
        const res = await t.fetch('/inbound', { method: 'POST', headers: auth, body: JSON.stringify({ to: '4155550101', from: 'dana@x.co', body: 'hey' }) })
        expect(res.status).toBe(200)
    })

    it('agents keep their lookups consistent when deleted', async () => {
        const { t, agentId } = await setup()
        await t.mutation(api.inbound.simulate, { to: '4155550101', from: '2125550187', body: 'hello' })
        await t.mutation(api.agents.remove, { id: agentId })
        expect(await t.query(api.conversations.list, {})).toEqual([])
        expect((await t.query(api.numbers.list, {}))[0].agentId).toBeUndefined()
        expect((await t.query(api.contacts.list, {}))[0].agentId).toBeUndefined()
    })

    it('runs the hourly digest at 8am local once a day', async () => {
        const { t } = await setup()
        const ws = (await t.query(api.workspace.get, {}))!
        await t.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, timezone: 'UTC', notifyDigest: true })
        vi.setSystemTime(Date.UTC(2026, 9, 8, 8, 5))
        await t.mutation(internal.notifications.digest, {})
        await t.mutation(internal.notifications.digest, {})
        expect((await t.query(api.notifications.list, {})).filter((n) => n.kind === 'digest')).toHaveLength(1)
    })
})
