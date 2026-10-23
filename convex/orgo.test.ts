// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')
const ENGINE_URL = 'https://getopenbots.com/engine/openbots-engine.mjs'

type Call = { method: string; path: string; body: Record<string, unknown> | null }

// A stand-in for Orgo's API: records every call, and fails the bash step whose command matches `failOn`
function fakeOrgo({ failOn }: { failOn?: string } = {}) {
    const calls: Call[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
        const path = url.replace('https://www.orgo.ai/api', '')
        const body = init.body ? JSON.parse(init.body as string) : null
        const method = init.method ?? 'GET'
        calls.push({ method, path, body })
        const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
        if (method === 'GET' && path === '/workspaces') return json([])
        if (method === 'POST' && path === '/workspaces') return json({ id: 'w1', name: 'OpenBots' })
        if (method === 'POST' && path === '/computers') return json({ id: 'c1', status: 'running' }, 201)
        if (path.endsWith('/bash')) return json(failOn && String(body?.command).includes(failOn) ? { output: 'curl: (6) Could not resolve host', exit_code: 6 } : { output: 'ok', exit_code: 0 })
        if (method === 'DELETE' || path.endsWith('/start') || path.endsWith('/stop')) return json({ ok: true })
        return json({}, 404)
    })
    return calls
}

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const t = base.withIdentity({ subject: name, tokenIdentifier: `test|${name}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

beforeEach(() => {
    vi.useFakeTimers()
    process.env.ENCRYPTION_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    process.env.CONVEX_CLOUD_URL = 'https://x.convex.cloud'
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('computers on Orgo', () => {
    it('needs the Orgo key saved first', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        fakeOrgo()
        await expect(owner.action(api.orgo.create, { name: 'My VM', engineUrl: ENGINE_URL })).rejects.toThrow(/Orgo API key/)
    })

    it('creates the computer, writes its token and runs every setup step', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'orgo', fields: { apiKey: 'orgo-key-1' } })
        const calls = fakeOrgo()
        const id = await owner.action(api.orgo.create, { name: 'My VM', engineUrl: ENGINE_URL })
        await base.finishAllScheduledFunctions(vi.runAllTimers)

        const [runner] = await owner.query(api.runners.list, {})
        expect(runner._id).toBe(id)
        expect(runner.orgo).toEqual({ computerId: 'c1', workspaceId: 'w1' })
        expect(runner.setup).toEqual({ status: 'ready' })
        expect(calls.find((c) => c.path === '/computers')?.body).toMatchObject({ workspace_id: 'w1', os: 'linux' })

        const bashes = calls.filter((c) => c.path === '/computers/c1/bash')
        expect(bashes).toHaveLength(5)
        // The token written to the computer is the one whose hash the engine will present
        const token = String(bashes[0].body?.command).match(/OPENBOTS_TOKEN=(obr_[A-Za-z0-9_-]+)/)?.[1]
        expect(token).toBeTruthy()
        const stored = await base.run((ctx) => ctx.db.get('runners', id))
        expect(stored?.tokenHash).toBe(await hashToken(token!))
        expect(String(bashes[3].body?.command)).toContain(ENGINE_URL)
    })

    it('records the step that failed, and Retry setup runs it all again', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'orgo', fields: { apiKey: 'orgo-key-1' } })
        fakeOrgo({ failOn: 'cloudflared-linux' })
        const id = await owner.action(api.orgo.create, { name: 'My VM', engineUrl: ENGINE_URL })
        await base.finishAllScheduledFunctions(vi.runAllTimers)
        expect((await owner.query(api.runners.list, {}))[0].setup).toEqual({ status: 'failed', step: 'Installing the tunnel', error: 'curl: (6) Could not resolve host' })

        fakeOrgo()
        await owner.action(api.orgo.retrySetup, { id, engineUrl: ENGINE_URL })
        await base.finishAllScheduledFunctions(vi.runAllTimers)
        expect((await owner.query(api.runners.list, {}))[0].setup).toEqual({ status: 'ready' })
    })

    it('shows Orgo refusing the key instead of failing silently', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        await owner.action(api.secrets.save, { service: 'orgo', fields: { apiKey: 'bad' } })
        vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }))
        await owner.action(api.orgo.create, { name: 'My VM', engineUrl: ENGINE_URL })
        expect((await owner.query(api.runners.list, {}))[0].setup).toMatchObject({ status: 'failed', error: expect.stringMatching(/rejected this API key/) })
    })

    it('starts, stops and deletes only your own computers, and never hands the Orgo key to engines', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const other = await user(base, 'Ali')
        await owner.action(api.secrets.save, { service: 'orgo', fields: { apiKey: 'orgo-key-1' } })
        await owner.action(api.secrets.save, { service: 'openai', fields: { apiKey: 'sk-1' } })
        const calls = fakeOrgo()
        const id = await owner.action(api.orgo.create, { name: 'My VM', engineUrl: ENGINE_URL })
        await base.finishAllScheduledFunctions(vi.runAllTimers)

        const token = String(calls.find((c) => c.path.endsWith('/bash'))?.body?.command).match(/OPENBOTS_TOKEN=(obr_[A-Za-z0-9_-]+)/)![1]
        expect((await base.query(api.runner.dashboard, { token })).secrets.map((s) => s.service)).toEqual(['openai'])

        await expect(other.action(api.orgo.stop, { id })).rejects.toThrow(/Not found/)
        await owner.action(api.orgo.stop, { id })
        await owner.action(api.orgo.start, { id })
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(expect.arrayContaining(['POST /computers/c1/stop', 'POST /computers/c1/start']))

        await expect(other.action(api.orgo.remove, { id })).rejects.toThrow(/Not found/)
        await owner.action(api.orgo.remove, { id })
        expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/computers/c1' })
        expect(await owner.query(api.runners.list, {})).toEqual([])
    })
})
