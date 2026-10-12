// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { encrypt } from './lib/crypto'
import { handleKey } from './lib/handles'
import { twilioSignature } from './lib/providers'
import { parseReply, toTurns } from './lib/prompt'
import { msUntilQuietEnds } from './lib/quiet'

const modules = import.meta.glob('./**/*.ts')

const SITE = 'https://test.convex.site'
const TWILIO_SID = 'AC' + '0'.repeat(32)

type Call = { url: string; init: RequestInit; body: unknown }

// Stubs fetch: AI providers answer `reply`, everything else (Twilio, Sendblue, BlueBubbles) answers ok
function stubFetch(reply = 'on it!') {
    const calls: Call[] = []
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
        const raw = init.body
        const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : typeof raw === 'string' ? JSON.parse(raw) : undefined
        calls.push({ url, init, body })
        if (url.includes('openai.com/v1/chat')) return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }))
        return new Response(JSON.stringify({ sid: 'SM1', status: 'active', data: {} }))
    })
    vi.stubGlobal('fetch', fetchMock)
    return calls
}

// A signed-up user with a workspace and one live agent
async function user(t: ReturnType<typeof convexTest>, email = 'sam@example.com') {
    const userId = await t.run((ctx) => ctx.db.insert('users', { email }))
    const as = t.withIdentity({ subject: `${userId}|session` })
    await as.mutation(api.workspace.create, { name: 'Test', ownerName: 'Sam', timezone: 'UTC' })
    const workspaceId = (await as.query(api.workspace.get, {}))!._id
    const agentId = await as.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status: 'live', models: { brain: 'gpt-5.1' } })
    return { as, workspaceId, agentId }
}

// Stores a connection the way connections.connect does (encrypted), without calling the provider
async function connection(t: ReturnType<typeof convexTest>, workspaceId: Id<'workspace'>, provider: 'openai' | 'twilio' | 'sendblue' | 'bluebubbles', creds: Record<string, string>, token = `${provider}-token`) {
    const secret = await encrypt(creds)
    return t.run((ctx) => ctx.db.insert('connections', { workspaceId, provider, secret, label: provider, webhookToken: token, status: 'ok', checkedAt: 0 }))
}

async function number(t: ReturnType<typeof convexTest>, workspaceId: Id<'workspace'>, connectionId: Id<'connections'>, agentId: Id<'agents'>, handle: string, channel: 'twilio' | 'sendblue' | 'bluebubbles') {
    return t.run((ctx) => ctx.db.insert('numbers', { workspaceId, connectionId, agentId, handle, key: handleKey(handle)!, kind: handle.includes('@') ? 'email' : 'phone', channel }))
}

// Posts a Twilio SMS webhook, signed like Twilio does
async function twilioSms(t: ReturnType<typeof convexTest>, params: Record<string, string>, authToken = 'tw-secret', token = 'twilio-token') {
    const path = `/hooks/twilio/${token}`
    const signature = await twilioSignature(authToken, SITE + path, params)
    return t.fetch(path, { method: 'POST', headers: { 'X-Twilio-Signature': signature, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() })
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

describe('texting pipeline', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubEnv('ENCRYPTION_KEY', btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))
        vi.stubEnv('CONVEX_SITE_URL', SITE)
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('a Twilio text gets a reply written with the workspace key and sent back through Twilio', async () => {
        const t = convexTest(schema, modules)
        const { as, workspaceId, agentId } = await user(t)
        await connection(t, workspaceId, 'openai', { apiKey: 'sk-workspace-key' })
        const tw = await connection(t, workspaceId, 'twilio', { accountSid: TWILIO_SID, authToken: 'tw-secret' })
        await number(t, workspaceId, tw, agentId, '+14155550101', 'twilio')
        const calls = stubFetch('on it!')

        const res = await twilioSms(t, { From: '+12125550187', To: '+14155550101', Body: 'can you help?' })
        expect(res.status).toBe(200)
        await t.finishAllScheduledFunctions(vi.runAllTimers)

        const ai = calls.find((c) => c.url.includes('openai.com'))!
        expect((ai.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-workspace-key')
        const sms = calls.find((c) => c.url.includes(`/Accounts/${TWILIO_SID}/Messages.json`))!
        expect(sms.body).toEqual({ From: '+14155550101', To: '+12125550187', Body: 'on it!' })

        const [conv] = await as.query(api.conversations.list, {})
        const thread = await as.query(api.conversations.thread, { id: conv._id })
        expect(thread?.messages.map((m) => [m.from, m.body, m.delivery])).toEqual([
            ['contact', 'can you help?', undefined],
            ['agent', 'on it!', 'sent'],
        ])
        expect(await as.query(api.usage.summary, { today: new Date().toISOString().slice(0, 10) })).toMatchObject([{ slot: 'brain', model: 'gpt-5.1', count: 1 }])
    })

    it('rejects Twilio webhooks with a bad signature', async () => {
        const t = convexTest(schema, modules)
        const { workspaceId } = await user(t)
        await connection(t, workspaceId, 'twilio', { accountSid: TWILIO_SID, authToken: 'tw-secret' })
        const res = await twilioSms(t, { From: '+12125550187', To: '+14155550101', Body: 'hi' }, 'wrong-token')
        expect(res.status).toBe(403)
        expect((await t.fetch('/hooks/twilio/nope', { method: 'POST', body: '' })).status).toBe(404)
    })

    it('without the workspace key the agent hands the conversation to you', async () => {
        const t = convexTest(schema, modules)
        const { as, workspaceId, agentId } = await user(t)
        const tw = await connection(t, workspaceId, 'twilio', { accountSid: TWILIO_SID, authToken: 'tw-secret' })
        await number(t, workspaceId, tw, agentId, '+14155550101', 'twilio')
        stubFetch()
        await twilioSms(t, { From: '+12125550187', To: '+14155550101', Body: 'hello' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const [conv] = await as.query(api.conversations.list, {})
        expect(conv.needsYou).toBe(true)
        expect(conv.problem).toContain('Connect your OpenAI key')
    })

    it('Test a text uses the real model but never sends anything out', async () => {
        const t = convexTest(schema, modules)
        const { as, workspaceId, agentId } = await user(t)
        await connection(t, workspaceId, 'openai', { apiKey: 'sk-workspace-key' })
        const tw = await connection(t, workspaceId, 'twilio', { accountSid: TWILIO_SID, authToken: 'tw-secret' })
        await number(t, workspaceId, tw, agentId, '+14155550101', 'twilio')
        const calls = stubFetch('sure')
        const { conversationId } = await as.mutation(api.inbound.simulate, { agentId, from: '+12125550187', body: 'hi', name: 'Dana' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect(calls.some((c) => c.url.includes('twilio.com'))).toBe(false)
        const thread = await as.query(api.conversations.thread, { id: conversationId })
        expect(thread?.conversation.test).toBe(true)
        expect(thread?.messages.at(-1)).toMatchObject({ body: 'sure', by: 'ai' })
        expect(thread?.messages.at(-1)?.delivery).toBeUndefined()
    })

    it('BlueBubbles group chats: the agent answers only when named, and replies to the group', async () => {
        const t = convexTest(schema, modules)
        const { as, workspaceId, agentId } = await user(t)
        await connection(t, workspaceId, 'openai', { apiKey: 'sk-workspace-key' })
        const bb = await connection(t, workspaceId, 'bluebubbles', { serverUrl: 'https://mac.example', password: 'pw' })
        await number(t, workspaceId, bb, agentId, 'me@icloud.com', 'bluebubbles')
        const calls = stubFetch('saturday works')
        const post = (text: string, from: string) =>
            t.fetch('/hooks/bluebubbles/bluebubbles-token', {
                method: 'POST',
                body: JSON.stringify({ type: 'new-message', data: { text, isFromMe: false, handle: { address: from }, chats: [{ guid: 'iMessage;+;chat42', displayName: 'Weekend crew' }] } }),
            })
        await post('anyone free saturday?', '+12125550187')
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect(calls.some((c) => c.url.includes('openai.com'))).toBe(false)

        await post('pip, is saturday open?', '+13105550111')
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const prompt = calls.find((c) => c.url.includes('openai.com'))!.body as { messages: { role: string; content: string }[] }
        expect(prompt.messages.at(-1)?.content).toContain('pip, is saturday open?')
        const sent = calls.find((c) => c.url.startsWith('https://mac.example/api/v1/message/text'))!
        expect(sent.url).toContain('password=pw')
        expect(sent.body).toMatchObject({ chatGuid: 'iMessage;+;chat42', message: 'saturday works', method: 'apple-script' })

        const convs = await as.query(api.conversations.list, {})
        expect(convs).toHaveLength(1)
        expect(convs[0]).toMatchObject({ threadKey: 'iMessage;+;chat42', title: 'Weekend crew' })
        // Messages the account sent itself are ignored
        await t.fetch('/hooks/bluebubbles/bluebubbles-token', { method: 'POST', body: JSON.stringify({ type: 'new-message', data: { text: 'mine', isFromMe: true, handle: { address: 'x@y.co' } } }) })
        expect((await as.query(api.conversations.thread, { id: convs[0]._id }))?.messages).toHaveLength(3)
    })

    it('Sendblue texts are answered through Sendblue', async () => {
        const t = convexTest(schema, modules)
        const { workspaceId, agentId } = await user(t)
        await connection(t, workspaceId, 'openai', { apiKey: 'sk-workspace-key' })
        const sb = await connection(t, workspaceId, 'sendblue', { keyId: 'kid', secret: 'ksecret' })
        await number(t, workspaceId, sb, agentId, '+14155550199', 'sendblue')
        const calls = stubFetch('hello!')
        await t.fetch('/hooks/sendblue/sendblue-token', { method: 'POST', body: JSON.stringify({ content: 'hey', number: '+12125550187', sendblue_number: '+14155550199', is_outbound: false }) })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const sent = calls.find((c) => c.url === 'https://api.sendblue.com/api/send-message')!
        expect((sent.init.headers as Record<string, string>)['sb-api-key-id']).toBe('kid')
        expect(sent.body).toEqual({ number: '+12125550187', from_number: '+14155550199', content: 'hello!' })
    })

    it('connecting a key checks it with the provider and never returns it', async () => {
        const t = convexTest(schema, modules)
        const { as } = await user(t)
        const calls = stubFetch()
        expect(await as.action(api.connections.connect, { provider: 'openai', credentials: { apiKey: 'sk-abcdef123456' } })).toEqual({ ok: true })
        expect(calls[0].url).toBe('https://api.openai.com/v1/models')
        const [conn] = await as.query(api.connections.list, {})
        expect(conn).toMatchObject({ provider: 'openai', label: 'sk-…3456', status: 'ok' })
        expect(JSON.stringify(conn)).not.toContain('sk-abcdef123456')

        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
        expect(await as.action(api.connections.connect, { provider: 'xai', credentials: { apiKey: 'bad' } })).toEqual({ ok: false, error: 'xAI rejected these credentials' })
    })

    it('connecting BlueBubbles registers the webhook on the Mac', async () => {
        const t = convexTest(schema, modules)
        const { as } = await user(t)
        const calls = stubFetch()
        expect(await as.action(api.connections.connect, { provider: 'bluebubbles', credentials: { serverUrl: 'https://mac.example/', password: 'pw' } })).toEqual({ ok: true })
        const hook = calls.find((c) => c.url.startsWith('https://mac.example/api/v1/webhook'))!
        const [conn] = await as.query(api.connections.list, {})
        expect(hook.body).toEqual({ url: conn.webhookUrl, events: ['new-message'] })
        expect(conn.webhookUrl).toMatch(/^https:\/\/test\.convex\.site\/hooks\/bluebubbles\/[0-9a-f]{48}$/)
    })

    it('workspaces are private to their owner', async () => {
        const t = convexTest(schema, modules)
        const a = await user(t, 'a@example.com')
        const b = await user(t, 'b@example.com')
        expect(await b.as.query(api.agents.list, {})).toHaveLength(1)
        expect(await b.as.query(api.agents.get, { id: a.agentId })).toBeNull()
        await expect(b.as.mutation(api.agents.remove, { id: a.agentId })).rejects.toThrow(/Not found/)
        await expect(t.query(api.agents.list, {})).rejects.toThrow(/Sign in/)
    })

    it('stops at the usage budget and runs the digest once a day', async () => {
        const t = convexTest(schema, modules)
        const { as, workspaceId, agentId } = await user(t)
        await connection(t, workspaceId, 'openai', { apiKey: 'sk-workspace-key' })
        stubFetch('ok')
        const ws = (await as.query(api.workspace.get, {}))!
        await as.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, timezone: 'UTC', dailyBudget: 1, notifyDigest: true })
        await as.mutation(api.inbound.simulate, { agentId, from: '+12125550187', body: 'one' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        const { conversationId } = await as.mutation(api.inbound.simulate, { agentId, from: '+12125550187', body: 'two' })
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect((await as.query(api.conversations.thread, { id: conversationId }))?.conversation.problem).toContain('budget')

        vi.setSystemTime(Date.UTC(2026, 9, 8, 8, 5))
        await t.mutation(internal.notifications.digest, {})
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        await t.mutation(internal.notifications.digest, {})
        await t.finishAllScheduledFunctions(vi.runAllTimers)
        expect((await as.query(api.notifications.list, {})).filter((n) => n.kind === 'digest')).toHaveLength(1)
    })

    it('deleting an agent keeps the other records consistent', async () => {
        const t = convexTest(schema, modules)
        const { as, agentId } = await user(t)
        stubFetch()
        await as.mutation(api.inbound.simulate, { agentId, from: '+12125550187', body: 'hello' })
        await as.mutation(api.agents.remove, { id: agentId })
        expect(await as.query(api.conversations.list, {})).toEqual([])
        expect((await as.query(api.contacts.list, {}))[0].agentId).toBeUndefined()
    })
})
