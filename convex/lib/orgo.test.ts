// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { bash, createComputer, installSteps, openBotsWorkspace, OrgoError, ORGO_API } from './orgo'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('Orgo client', () => {
    it('sends the key as a bearer token and the documented body', async () => {
        const fetch = vi.fn(async () => json({ id: 'c1', status: 'running' }, 201))
        expect(await createComputer('key-1', 'w1', 'openbots-vm', fetch)).toEqual({ id: 'c1', status: 'running' })
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe(`${ORGO_API}/computers`)
        expect(init.method).toBe('POST')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-1')
        expect(JSON.parse(init.body as string)).toMatchObject({ workspace_id: 'w1', name: 'openbots-vm', os: 'linux' })
    })

    it('reuses the OpenBots workspace, or makes it', async () => {
        const existing = vi.fn(async () => json([{ id: 'w0', name: 'Other' }, { id: 'w1', name: 'OpenBots' }]))
        expect((await openBotsWorkspace('k', existing)).id).toBe('w1')
        const fresh = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? json({ id: 'w2', name: 'OpenBots' }) : json({ workspaces: [] })))
        expect((await openBotsWorkspace('k', fresh as typeof fetch)).id).toBe('w2')
    })

    it('turns Orgo’s refusals into messages the user can act on', async () => {
        await expect(bash('bad', 'c1', 'ls', 10, vi.fn(async () => json({}, 401)))).rejects.toThrow(OrgoError)
        await expect(bash('bad', 'c1', 'ls', 10, vi.fn(async () => json({}, 401)))).rejects.toThrow(/rejected this API key/)
        await expect(bash('k', 'c1', 'ls', 10, vi.fn(async () => json({}, 403)))).rejects.toThrow(/plan/)
        await expect(bash('k', 'c1', 'ls', 10, vi.fn(async () => new Response('boom', { status: 500 })))).rejects.toThrow(/500: boom/)
    })
})

describe('setting up a computer', () => {
    const steps = installSteps({ convexUrl: 'https://x.convex.cloud', token: "obr_ab'c", engineUrl: 'https://getopenbots.com/engine/openbots-engine.mjs' })

    it('writes the token into a private settings file, quoted safely', () => {
        expect(steps[0].command).toContain('umask 077')
        expect(steps[0].command).toContain(`OPENBOTS_TOKEN=obr_ab'\\''c`)
        expect(steps[0].command).toContain('OPENBOTS_TUNNEL=true')
    })

    it('stays within Orgo’s 300-second limit and keeps the engine running across restarts', () => {
        for (const s of steps) expect(s.timeout).toBeLessThanOrEqual(300)
        const start = steps.at(-1)!.command
        expect(start).toContain('Restart=always')
        expect(start).toContain('@reboot')
    })

    it('only the first step carries the token', () => {
        for (const s of steps.slice(1)) expect(s.command).not.toContain('obr_ab')
    })
})
