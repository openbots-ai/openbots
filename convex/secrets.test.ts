// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')
const KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA' // any base64; Convex never parses it
const SEALED = 's1:d3JhcHBlZA==:aXY=:Ym9keQ=='

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const t = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

async function setup() {
    const base = convexTest(schema, modules)
    const owner = await user(base)
    const engine = async (name: string, publicKey?: string) => {
        const token = newToken()
        const runnerId = await owner.mutation(api.runners.create, { name, tokenHash: await hashToken(token) })
        const beat = (key = publicKey) => base.mutation(api.runner.heartbeat, { token, version: '0.3.0', services: [], models: [], channels: [], lines: [], demo: false, publicKey: key })
        if (publicKey) await beat()
        return { token, runnerId, beat }
    }
    return { base, owner, engine }
}

describe('keys entered in the dashboard', () => {
    it('stores locked values per engine and never returns them to the dashboard', async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        const list = await owner.query(api.secrets.list, {})
        expect(list).toEqual([{ service: 'openai', runnerIds: [mac.runnerId], updatedAt: expect.any(Number) }])
        expect(JSON.stringify(list)).not.toContain(SEALED)
        const dashboard = await base.query(api.runner.dashboard, { token: mac.token })
        expect(dashboard.secrets).toEqual([{ service: 'openai', sealed: SEALED }])
    })

    it('replaces a service on save and deletes it on remove', async () => {
        const { owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: 's1:bmV3:aXY=:Ym9keQ==' }] })
        expect(await owner.query(api.secrets.list, {})).toHaveLength(1)
        await owner.mutation(api.secrets.remove, { service: 'openai' })
        expect(await owner.query(api.secrets.list, {})).toEqual([])
    })

    it("gives each engine only its own values, and refuses a bad token", async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        const vm = await engine('VM', KEY)
        await owner.mutation(api.secrets.set, {
            service: 'twilio',
            sealed: [
                { runnerId: mac.runnerId, sealed: SEALED },
                { runnerId: vm.runnerId, sealed: 's1:dm0=:aXY=:Ym9keQ==' },
            ],
        })
        expect((await base.query(api.runner.dashboard, { token: vm.token })).secrets).toEqual([{ service: 'twilio', sealed: 's1:dm0=:aXY=:Ym9keQ==' }])
        await expect(base.query(api.runner.dashboard, { token: newToken() })).rejects.toThrow(/invalid or was revoked/)
    })

    it("refuses another workspace's engine, an engine that hasn't started, and other users", async () => {
        const { base, owner, engine } = await setup()
        const fresh = await engine('Never started')
        await expect(owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: fresh.runnerId, sealed: SEALED }] })).rejects.toThrow(/hasn’t started yet/)
        const other = await user(base, 'Ali')
        const mac = await engine('Mac mini', KEY)
        await expect(other.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })).rejects.toThrow(/Not found/)
        await expect(base.query(api.secrets.list, {})).rejects.toThrow(/Sign in/)
        await expect(owner.mutation(api.secrets.set, { service: 'openai', sealed: [] })).rejects.toThrow(/start it once/)
    })

    it('forgets an engine’s values when its key changes or it is revoked', async () => {
        const { owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await mac.beat(KEY) // same key: kept
        expect(await owner.query(api.secrets.list, {})).toHaveLength(1)
        await mac.beat(KEY + 'AA') // new key pair (data directory wiped): the old values can't be opened anymore
        expect(await owner.query(api.secrets.list, {})).toEqual([])
        await mac.beat(KEY + 'AA')
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await owner.mutation(api.runners.revoke, { id: mac.runnerId })
        expect(await owner.query(api.secrets.list, {})).toEqual([])
    })

    it('stores a public URL per engine for the engine to read', async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId, publicUrl: ' https://bots.example.com/ ' })
        expect((await base.query(api.runner.dashboard, { token: mac.token })).publicUrl).toBe('https://bots.example.com')
        await expect(owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId, publicUrl: 'bots.example.com' })).rejects.toThrow(/https:\/\//)
        await owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId })
        expect((await base.query(api.runner.dashboard, { token: mac.token })).publicUrl).toBeUndefined()
    })
})
