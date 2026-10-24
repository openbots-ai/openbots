// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')

async function setup() {
    const base = convexTest(schema, modules)
    rateLimiter.register(base)
    const owner = base.withIdentity({ subject: 'sam', tokenIdentifier: 'test|sam' })
    await owner.mutation(api.workspace.create, { name: "Sam's agents", ownerName: 'Sam', timezone: 'UTC' })
    const token = newToken()
    const tokenHash = await hashToken(token)
    return { base, owner, token, tokenHash }
}

describe('pairing a computer', () => {
    it('joins your workspace once you approve its code, and its own token then works', async () => {
        const { base, owner, token, tokenHash } = await setup()
        const { code } = await base.mutation(api.pairing.start, { tokenHash, name: 'Spare MacBook', os: 'mac' })
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
        expect(await base.query(api.pairing.status, { tokenHash, now: Date.now() })).toBe('waiting')
        await expect(base.query(api.runner.config, { token })).rejects.toThrow(/invalid or was revoked/)

        // Typed loosely in the dashboard, it still matches
        expect(await owner.query(api.pairing.lookup, { code: code.toLowerCase().replace('-', ' ') })).toMatchObject({ name: 'Spare MacBook', os: 'mac', approved: false })
        await owner.mutation(api.pairing.approve, { code })
        expect(await base.query(api.pairing.status, { tokenHash, now: Date.now() })).toBe('approved')
        expect((await owner.query(api.runners.list, {})).map((r) => [r.name, r.os])).toEqual([['Spare MacBook', 'mac']])
        expect(await base.query(api.runner.config, { token })).not.toBeNull()
        await expect(owner.mutation(api.pairing.approve, { code })).rejects.toThrow(/already connected/)
    })

    it('expires after ten minutes, and needs a signed-in owner to look up or approve', async () => {
        const { base, owner, tokenHash } = await setup()
        const { code, expiresAt } = await base.mutation(api.pairing.start, { tokenHash, name: 'PC', os: 'windows' })
        expect(await base.query(api.pairing.status, { tokenHash, now: expiresAt + 1 })).toBe('expired')
        await expect(base.query(api.pairing.lookup, { code })).rejects.toThrow(/Sign in/)
        await expect(base.mutation(api.pairing.approve, { code })).rejects.toThrow(/Sign in/)
        expect(await owner.query(api.pairing.lookup, { code: 'ZZZZ-ZZZZ' })).toBeNull()
        await expect(owner.mutation(api.pairing.approve, { code: 'ZZZZ-ZZZZ' })).rejects.toThrow(/expired or doesn’t exist/)
    })

    it('takes only a fresh token hash', async () => {
        const { base, tokenHash } = await setup()
        await expect(base.mutation(api.pairing.start, { tokenHash: 'obr_not-a-hash', name: 'PC', os: 'linux' })).rejects.toThrow(/hash/)
        await base.mutation(api.pairing.start, { tokenHash, name: 'PC', os: 'linux' })
        await expect(base.mutation(api.pairing.start, { tokenHash, name: 'PC', os: 'linux' })).rejects.toThrow(/new token/)
    })
})
