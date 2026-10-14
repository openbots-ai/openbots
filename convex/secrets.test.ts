// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')
const SECRET = 'sk-unique-secret-value-1234'

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const t = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

async function engine(owner: Awaited<ReturnType<typeof user>>) {
    const token = newToken()
    await owner.mutation(api.runners.create, { name: 'VM', tokenHash: await hashToken(token) })
    return token
}

beforeEach(() => {
    process.env.ENCRYPTION_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
})
afterEach(() => {
    delete process.env.ENCRYPTION_KEY
})

describe('keys saved in Connections', () => {
    it('saves a key for the account before any engine exists, and never returns it to the dashboard', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: SECRET } })
        const list = await owner.query(api.secrets.list, {})
        expect(list).toEqual([{ service: 'openai', updatedAt: expect.any(Number) }])
        expect(JSON.stringify(list)).not.toContain(SECRET)
        const stored = await base.run((ctx) => ctx.db.query('secrets').collect())
        expect(stored).toHaveLength(1)
        expect(stored[0].sealed).not.toContain(SECRET)
    })

    it('gives every engine of the account the decrypted key, and replaces or removes it', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: SECRET } })
        const token = await engine(owner)
        expect((await base.query(api.runner.dashboard, { token })).secrets).toEqual([{ service: 'openai', fields: { apiKey: SECRET } }])
        await owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: 'sk-new' } })
        expect(await owner.query(api.secrets.list, {})).toHaveLength(1)
        expect((await base.query(api.runner.dashboard, { token })).secrets).toEqual([{ service: 'openai', fields: { apiKey: 'sk-new' } }])
        await owner.mutation(api.secrets.remove, { service: 'openai' })
        expect((await base.query(api.runner.dashboard, { token })).secrets).toEqual([])
    })

    it("keeps each account's keys to itself, and refuses signed-out users and bad tokens", async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const other = await user(base, 'Ali')
        await owner.action(api.secrets.save, { service: 'anthropic', fields: { apiKey: SECRET } })
        expect(await other.query(api.secrets.list, {})).toEqual([])
        const theirs = await engine(other)
        expect((await base.query(api.runner.dashboard, { token: theirs })).secrets).toEqual([])
        await expect(base.query(api.secrets.list, {})).rejects.toThrow(/Sign in/)
        await expect(base.action(api.secrets.save, { service: 'openai', fields: { apiKey: SECRET } })).rejects.toThrow(/Sign in/)
        await expect(base.query(api.runner.dashboard, { token: newToken() })).rejects.toThrow(/invalid or was revoked/)
    })

    it('refuses missing fields and a server without ENCRYPTION_KEY', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await expect(owner.action(api.secrets.save, { service: 'twilio', fields: { accountSid: 'AC1' } })).rejects.toThrow(/Auth token is missing/)
        delete process.env.ENCRYPTION_KEY
        await expect(owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: SECRET } })).rejects.toThrow(/npm run setup/)
    })

    it('reports a key that can no longer be decrypted instead of failing the rest', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: SECRET } })
        await owner.action(api.secrets.save, { service: 'xai', fields: { apiKey: 'xai-1' } })
        const token = await engine(owner)
        const xai = (await base.run((ctx) => ctx.db.query('secrets').collect())).find((r) => r.service === 'xai')!
        await base.run((ctx) => ctx.db.patch('secrets', xai._id, { sealed: 'k1:AAAA:BBBB' }))
        const { secrets, problems } = await base.query(api.runner.dashboard, { token })
        expect(secrets).toEqual([{ service: 'openai', fields: { apiKey: SECRET } }])
        expect(problems).toEqual([{ service: 'xai', error: expect.stringMatching(/save it again/) }])
    })

    it('stores a public URL per engine for the engine to read', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const token = await engine(owner)
        const [runner] = await owner.query(api.runners.list, {})
        await owner.mutation(api.runners.setPublicUrl, { id: runner._id, publicUrl: ' https://bots.example.com/ ' })
        expect((await base.query(api.runner.dashboard, { token })).publicUrl).toBe('https://bots.example.com')
    })
})
