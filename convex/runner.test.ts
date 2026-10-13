// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')

// Signs in as a fresh account; Convex Auth's subject is "<userId>|<sessionId>"
async function signIn(base: ReturnType<typeof convexTest>) {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    return base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
}

async function setup() {
    const base = convexTest(schema, modules)
    const owner = await signIn(base)
    await owner.mutation(api.workspace.create, { name: 'Test', ownerName: 'Sam', timezone: 'UTC' })
    const agentId = await owner.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status: 'live' })
    await owner.mutation(api.numbers.create, { handle: '+1 (415) 555-0101', agentId })
    const token = newToken()
    const runnerId = await owner.mutation(api.runners.create, { name: 'Mac mini', tokenHash: await hashToken(token) })
    return { base, owner, agentId, token, runnerId }
}

describe('sign-in', () => {
    it('only lets the workspace owner in', async () => {
        const { base } = await setup()
        await expect(base.query(api.agents.list, {})).rejects.toThrow(/Sign in/)
        expect(await base.query(api.workspace.access, {})).toBe('signedOut')
        const stranger = await signIn(base)
        expect(await stranger.query(api.workspace.access, {})).toBe('denied')
        await expect(stranger.query(api.runners.list, {})).rejects.toThrow(/access/)
        await expect(stranger.mutation(api.workspace.claim, {})).rejects.toThrow(/owner/)
    })

    it('lets the first account claim a workspace made before sign-in existed', async () => {
        const base = convexTest(schema, modules)
        await base.run((ctx) => ctx.db.insert('workspace', { name: 'Old', ownerName: 'Sam' }))
        const t = await signIn(base)
        expect(await t.query(api.workspace.access, {})).toBe('unclaimed')
        await expect(t.query(api.workspace.get, {})).rejects.toThrow(/access/)
        await t.mutation(api.workspace.claim, {})
        expect(await t.query(api.workspace.access, {})).toBe('owner')
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

    it('stores only the hash of a token, and never shows it', async () => {
        const { base, owner, token } = await setup()
        const stored = await base.run((ctx) => ctx.db.query('runners').first())
        expect(stored?.tokenHash).toBe(await hashToken(token))
        expect(JSON.stringify(stored)).not.toContain(token)
        expect(JSON.stringify(await owner.query(api.runners.list, {}))).not.toContain(stored!.tokenHash)
        await expect(owner.mutation(api.runners.create, { name: 'x', tokenHash: token })).rejects.toThrow(/Make the token/)
    })

    it('gives the agent its configuration without the owner account', async () => {
        const { base, token } = await setup()
        const config = (await base.query(api.runner.config, { token }))!
        expect(config.agents.map((a) => a.name)).toEqual(['Pip'])
        expect(config.numbers[0].key).toBe('4155550101')
        expect(config.workspace).not.toHaveProperty('ownerId')
    })

    it('adds up counts and usage, and reports a used-up budget', async () => {
        const { base, owner, agentId, token } = await setup()
        await base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: 1, conversations: 1, newContacts: 1 } })
        await base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: 1, messagesOut: 1 }, usage: { slot: 'brain', model: 'gpt-5.1' } })
        const today = new Date().toISOString().slice(0, 10)
        expect(await owner.query(api.usage.activity, { since: today })).toEqual({ conversations: 1, newContacts: 1, messagesIn: 2, messagesOut: 1, handoffs: 0 })
        expect(await owner.query(api.usage.summary, { today })).toEqual([{ agentId, slot: 'brain', model: 'gpt-5.1', day: today, count: 1 }])
        await expect(base.mutation(api.runner.record, { token, agentId, activity: { messagesIn: -5 } })).rejects.toThrow(/whole numbers/)

        expect(await base.query(api.runner.budget, { token, today })).toBeNull()
        const ws = (await owner.query(api.workspace.get, {}))!
        await owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, dailyBudget: 1 })
        expect(await base.query(api.runner.budget, { token, today })).toMatch(/Today's usage budget/)
    })

    it('records the heartbeat for the dashboard', async () => {
        const { base, owner, token } = await setup()
        await base.mutation(api.runner.heartbeat, { token, version: '0.1.0', transport: 'mac', providers: { openai: true, local: false }, demo: false })
        const [runner] = await owner.query(api.runners.list, {})
        expect(runner).toMatchObject({ name: 'Mac mini', version: '0.1.0', transport: 'mac', providers: { openai: true, local: false } })
        expect(runner.lastSeenAt).toBeTypeOf('number')
    })

    it('keeps no messages, contacts or notifications in Convex', () => {
        const tables = Object.keys(schema.tables)
        for (const gone of ['messages', 'conversations', 'contacts', 'notifications']) expect(tables).not.toContain(gone)
    })
})
