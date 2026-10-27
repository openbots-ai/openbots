// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import { keyModels, resolveModels } from './lib/models'
import { hashToken, newToken } from './lib/tokens'
import { DEFAULT_CONTACT_REPLIES_PER_HOUR, DEFAULT_DAILY_BUDGET } from './lib/usage'

const modules = import.meta.glob('./**/*.ts')

const OPENAI = [
    { provider: 'openai', id: 'gpt-5.1', label: 'gpt-5.1' },
    { provider: 'openai', id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
]

// A signed-in user with their own workspace; Clerk's tokenIdentifier is "<issuer>|<user id>"
async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const t = base.withIdentity({ subject: name, tokenIdentifier: `test|${name}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

type Service = 'openai' | 'twilio'

async function setup() {
    const base = convexTest(schema, modules)
    const owner = await user(base)
    const agentId = await owner.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status: 'live' })
    await owner.mutation(api.numbers.add, { handle: '+1 (415) 555-0101', channel: 'mac', agentId })
    const token = newToken()
    const runnerId = await owner.mutation(api.runners.create, { name: 'Mac mini', tokenHash: await hashToken(token) })
    const beat = (extra: { models?: typeof OPENAI; services?: { service: Service; error?: string }[] } = {}) =>
        base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [{ service: 'openai' }], models: OPENAI, channels: ['mac'], lines: [], demo: false, ...extra })
    return { base, owner, agentId, token, runnerId, beat }
}

// The editable fields of an agent, for update
const fields = (a: { name: string; role: string; hue: number; prompt: string; greeting?: string; status: 'draft' | 'live' | 'paused' }) => ({
    name: a.name,
    role: a.role,
    hue: a.hue,
    prompt: a.prompt,
    greeting: a.greeting,
    status: a.status,
})

describe('workspaces', () => {
    it('saves YES ALL from the engine, and the Settings switch turns asking back on', async () => {
        const { base, owner, token } = await setup()
        await expect(base.mutation(api.runner.yesAll, { token: newToken() })).rejects.toThrow(/invalid or was revoked/)
        await base.mutation(api.runner.yesAll, { token })
        expect((await base.query(api.runner.config, { token, allowedOnly: true }))?.workspace.yesAll).toBe(true)
        const ws = (await owner.query(api.workspace.get))!
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, yesAll: false })
        expect((await base.query(api.runner.config, { token, allowedOnly: true }))?.workspace.yesAll).toBe(false)
    })

    it("keeps each user's workspace to themselves", async () => {
        const { base, owner, agentId } = await setup()
        await expect(base.query(api.agents.list, {})).rejects.toThrow(/Sign in/)
        const other = await user(base, 'Ali')
        expect(await other.query(api.agents.list, {})).toEqual([])
        expect(await other.query(api.runners.list, {})).toEqual([])
        await expect(other.mutation(api.agents.remove, { id: agentId })).rejects.toThrow(/Not found/)
        expect(await owner.query(api.agents.list, {})).toHaveLength(1)
    })
})

describe('numbers', () => {
    it('tells a Norwegian number from a US one with the same digits, and re-keys numbers saved the old way', async () => {
        const { base, owner } = await setup()
        await owner.mutation(api.numbers.add, { handle: '+47 912 34 567', channel: 'sendblue' })
        await owner.mutation(api.numbers.add, { handle: '+1 479 123 4567', channel: 'sendblue' })
        await expect(owner.mutation(api.numbers.add, { handle: '(479) 123-4567', channel: 'sendblue' })).rejects.toThrow(/already added/)
        // A key from before country codes were kept
        const old = await base.run((ctx) => ctx.db.query('numbers').first())
        await base.run((ctx) => ctx.db.patch('numbers', old!._id, { key: '4155550101' }))
        expect(await base.mutation(internal.migrations.rekeyHandles, {})).toBe('1 numbers keyed again')
        const keys = await base.run(async (ctx) => (await ctx.db.query('numbers').collect()).map((n) => n.key))
        expect(keys.sort()).toEqual(['14155550101', '14791234567', '4791234567'])
    })
})

describe('agent API', () => {
    it('refuses a wrong or revoked token', async () => {
        const { base, owner, token, runnerId } = await setup()
        await expect(base.query(api.runner.config, { token: newToken() })).rejects.toThrow(/invalid or was revoked/)
        expect(await base.query(api.runner.config, { token })).not.toBeNull()
        await owner.mutation(api.runners.revoke, { id: runnerId })
        await expect(base.query(api.runner.config, { token })).rejects.toThrow(/invalid or was revoked/)
    })

    it('resets a token in place: the old one stops working, the new one works, the engine keeps its settings', async () => {
        const { base, owner, token, runnerId } = await setup()
        await owner.mutation(api.runners.setPublicUrl, { id: runnerId, publicUrl: 'https://bots.example.com' })
        const fresh = newToken()
        await owner.mutation(api.runners.resetToken, { id: runnerId, tokenHash: await hashToken(fresh) })
        await expect(base.query(api.runner.config, { token })).rejects.toThrow(/invalid or was revoked/)
        expect(await base.query(api.runner.config, { token: fresh })).not.toBeNull()
        expect(await owner.query(api.runners.list, {})).toMatchObject([{ _id: runnerId, name: 'Mac mini', publicUrl: 'https://bots.example.com' }])
        await expect(owner.mutation(api.runners.resetToken, { id: runnerId, tokenHash: 'nope' })).rejects.toThrow(/Make the token in the dashboard/)
        const other = await user(base, 'Ana')
        await expect(other.mutation(api.runners.resetToken, { id: runnerId, tokenHash: await hashToken(newToken()) })).rejects.toThrow(/Not found/)
    })

    it('stores only the hash of a token, and shows the agent only its own workspace', async () => {
        const { base, owner, token } = await setup()
        const stored = await base.run((ctx) => ctx.db.query('runners').first())
        expect(stored?.tokenHash).toBe(await hashToken(token))
        expect(JSON.stringify(await owner.query(api.runners.list, {}))).not.toContain(stored!.tokenHash)

        const other = await user(base, 'Ali')
        await other.mutation(api.agents.create, { name: 'Not yours', role: '', hue: 0, prompt: '', greeting: '', status: 'live' })
        const config = (await base.query(api.runner.config, { token }))!
        expect(config.agents.map((a) => a.name)).toEqual(['Pip'])
        expect(config.numbers[0]).toMatchObject({ key: '14155550101', channel: 'mac' })
        expect(config.workspace).not.toHaveProperty('userId')
    })

    it('adds up counts and usage, and reports a used-up budget', async () => {
        const { base, owner, agentId, token } = await setup()
        await base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: 1, conversations: 1, newContacts: 1 } })
        await base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: 1, messagesOut: 1 }, usage: { slot: 'brain', model: 'openai:gpt-5.1' } })
        const today = new Date().toISOString().slice(0, 10)
        expect(await owner.query(api.usage.activity, { since: today })).toEqual({ conversations: 1, newContacts: 1, messagesIn: 2, messagesOut: 1, handoffs: 0 })
        expect(await owner.query(api.usage.summary, { today })).toEqual([{ agentId, slot: 'brain', model: 'openai:gpt-5.1', day: today, count: 1 }])
        await expect(base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: -5 } })).rejects.toThrow(/whole numbers/)

        expect(await base.query(api.runner.budget, { token, today })).toBeNull()
        const ws = (await owner.query(api.workspace.get, {}))!
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, dailyBudget: 1 })
        expect(await base.query(api.runner.budget, { token, today })).toMatch(/Today's usage budget/)
    })

    it('keeps a document private to you unless you share it with contacts', async () => {
        const { base, owner, token } = await setup()
        const id = await owner.mutation(api.knowledge.create, { title: 'Home address', body: '1 Main St' })
        const shared = await owner.mutation(api.knowledge.create, { title: 'Hours', body: '9 to 5', shareWithContacts: true })
        const docs = (await base.query(api.runner.config, { token }))!.knowledge
        expect(docs.find((d) => d._id === id)?.shareWithContacts).toBeUndefined()
        expect(docs.find((d) => d._id === shared)?.shareWithContacts).toBe(true)
        await owner.mutation(api.knowledge.update, { id: shared, title: 'Hours', body: '9 to 5' })
        expect((await base.query(api.runner.config, { token }))!.knowledge.find((d) => d._id === shared)?.shareWithContacts).toBeUndefined()
    })

    it('caps every workspace at the default daily budget until you set your own', async () => {
        const { base, owner, agentId, token } = await setup()
        const today = new Date().toISOString().slice(0, 10)
        const ws = (await owner.query(api.workspace.get, {}))!
        expect(ws.dailyBudget).toBe(DEFAULT_DAILY_BUDGET)
        expect(ws.weeklyBudget).toBeUndefined()

        // A workspace made before the default existed, or one whose daily budget was cleared, reads as the default
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName })
        expect(await base.run((ctx) => ctx.db.get('workspace', ws._id))).not.toHaveProperty('dailyBudget')
        expect((await owner.query(api.workspace.get, {}))!.dailyBudget).toBe(DEFAULT_DAILY_BUDGET)
        expect((await base.query(api.runner.config, { token }))!.workspace.dailyBudget).toBe(DEFAULT_DAILY_BUDGET)

        await base.run((ctx) => ctx.db.insert('usage', { workspaceId: ws._id, agentId, slot: 'brain', model: 'openai:gpt-5.1', day: today, count: DEFAULT_DAILY_BUDGET - 1 }))
        expect(await base.query(api.runner.budget, { token, today })).toBeNull()
        await base.mutation(api.runner.record, { token, agentId, usage: { slot: 'brain', model: 'openai:gpt-5.1' } })
        expect(await base.query(api.runner.budget, { token, today })).toBe(`Today's usage budget (${DEFAULT_DAILY_BUDGET} credits) is used up.`)
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, dailyBudget: 1000 })
        expect(await base.query(api.runner.budget, { token, today })).toBeNull()
    })

    it('limits replies per contact to the default until you set your own', async () => {
        const { base, owner, token } = await setup()
        const ws = (await owner.query(api.workspace.get, {}))!
        expect(ws.contactRepliesPerHour).toBe(DEFAULT_CONTACT_REPLIES_PER_HOUR)
        expect((await base.query(api.runner.config, { token }))!.workspace.contactRepliesPerHour).toBe(DEFAULT_CONTACT_REPLIES_PER_HOUR)
        for (const bad of [0, 2.5, 5000]) await expect(owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, contactRepliesPerHour: bad })).rejects.toThrow(/whole number from 1 to 1000/)
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, contactRepliesPerHour: 5 })
        expect((await base.query(api.runner.config, { token }))!.workspace.contactRepliesPerHour).toBe(5)
    })

    it('keeps no messages, contacts or credentials in Convex', () => {
        const tables = Object.keys(schema.tables)
        for (const gone of ['messages', 'conversations', 'contacts', 'notifications', 'connections']) expect(tables).not.toContain(gone)
    })
})

describe('models from your keys', () => {
    it("offers the models the agent's keys can use, and refuses others", async () => {
        const { owner, agentId, beat } = await setup()
        const agent = (await owner.query(api.agents.get, { id: agentId }))!
        const save = (brain: string, name = agent.name) => owner.mutation(api.agents.update, { id: agentId, ...fields(agent), name, models: { brain } })

        await expect(save('openai:gpt-4o-mini')).rejects.toThrow(/Add your OpenAI key in Connections or on your engine/)
        await beat()
        await expect(save('anthropic:claude-sonnet-5-5')).rejects.toThrow(/Add your Anthropic key in Connections or on your engine/)
        await expect(save('openai:o9-ultra')).rejects.toThrow(/Your OpenAI key can't use o9-ultra/)
        await save('openai:gpt-4o-mini')
        await expect(owner.mutation(api.workspace.setModel, { slot: 'backup', model: 'openai:o9-ultra' })).rejects.toThrow(/can't use/)
        await owner.mutation(api.workspace.setModel, { slot: 'backup', model: 'none' })

        // A saved choice the key no longer offers can stay while other fields change
        await beat({ models: [OPENAI[0]] })
        await save('openai:gpt-4o-mini', 'Pip 2')
    })

    it("refuses choices for slots that don't run yet", async () => {
        const { owner, agentId } = await setup()
        const agent = (await owner.query(api.agents.get, { id: agentId }))!
        await expect(owner.mutation(api.workspace.setModel, { slot: 'voice', model: 'elevenlabs' })).rejects.toThrow(/can't be used for voice/)
        await expect(owner.mutation(api.agents.update, { id: agentId, ...fields(agent), models: { vision: 'same-as-brain' } })).rejects.toThrow(/can't be used for vision/)
        await owner.mutation(api.workspace.setModel, { slot: 'computer', model: 'claude-opus-5.5-computer-use' })
    })

    it('keeps the engine’s reminder and watch counts per agent', async () => {
        const { base, owner, token, agentId } = await setup()
        await base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [], models: [], channels: [], lines: [], demo: false, jobs: [{ agentId, reminders: 2, watches: 1 }] })
        expect((await owner.query(api.runners.list, {}))[0].jobs).toEqual([{ agentId, reminders: 2, watches: 1 }])
    })

    it('defaults Brain to a well-known model and Backup to another provider', () => {
        const available = keyModels([...OPENAI, { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }])
        const r = resolveModels(undefined, undefined, undefined, available)
        expect(r.brain.option.id).toBe('openai:gpt-5.1')
        expect(r.backup.option.id).toBe('anthropic:claude-sonnet-5-5')
        expect(resolveModels(undefined, undefined, undefined, keyModels(OPENAI)).backup.option.id).toBe('none')
        expect(resolveModels(undefined, undefined, undefined, []).brain.option).toMatchObject({ id: 'none', label: 'Connect an AI key' })
        // An older catalog id still reads as its provider:model
        expect(resolveModels({ brain: 'gpt-5.1' }, undefined, undefined, available).brain.option.id).toBe('openai:gpt-5.1')
    })
})

describe('Twilio through the agent', () => {
    it('queues a purchase for the agent, which adds the number when done', async () => {
        const { base, owner, agentId, token, beat } = await setup()
        await expect(owner.mutation(api.tasks.request, { request: { kind: 'twilioSearch', country: 'US' } })).rejects.toThrow(/Add your Twilio account/)
        await beat({ services: [{ service: 'twilio' }] })

        const id = await owner.mutation(api.tasks.request, { request: { kind: 'twilioBuy', phoneNumber: '+14155550199', agentId } })
        expect(await base.query(api.runner.tasks, { token })).toEqual([{ _id: id, request: { kind: 'twilioBuy', phoneNumber: '+14155550199', agentId } }])
        expect(await base.mutation(api.runner.claimTask, { token, id })).toBe(true)
        await base.mutation(api.runner.finishTask, { token, id, result: { phoneNumber: '+14155550199', sid: 'PN123' } })

        expect(await owner.query(api.tasks.get, { id })).toMatchObject({ status: 'done' })
        expect(await base.query(api.runner.tasks, { token })).toEqual([])
        const numbers = await owner.query(api.numbers.list, {})
        expect(numbers.find((n) => n.channel === 'twilio')).toMatchObject({ handle: '+14155550199', externalId: 'PN123', agentId })
    })
})
