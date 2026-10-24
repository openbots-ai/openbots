import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { mutation, query } from './_generated/server'
import { requireWorkspace } from './lib/access'

// Connecting a computer without pasting anything: the engine (or the desktop app) makes its own token, sends only
// its hash here and shows a short code; you approve that code in the dashboard, signed in, and the computer joins
// your workspace. The token never leaves the computer.

const PAIR_MS = 10 * 60_000
// No look-alikes (0/O, 1/I/L), so the code is easy to read off a screen
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const os = v.union(v.literal('windows'), v.literal('mac'), v.literal('linux'), v.literal('other'))

const limiter = new RateLimiter(components.rateLimiter, {
    // Starting a pairing needs no sign-in, so it's capped across everyone
    pairingStart: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 120 },
})

const newCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4)}`
}
// However it was typed: case, spaces and a missing dash don't matter
const normalize = (raw: string) => {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : null
}

// The computer asks to join. Returns the code to show and when it expires.
export const start = mutation({
    args: { tokenHash: v.string(), name: v.string(), os },
    handler: async (ctx, { tokenHash, name, os }) => {
        if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error('Send the hash of a fresh token')
        const label = name.trim().slice(0, 60) || 'My computer'
        await limiter.limit(ctx, 'pairingStart', { throws: true })
        const now = Date.now()
        // Tidy a few expired requests each time, so the table stays small
        for (const old of await ctx.db
            .query('pairings')
            .withIndex('by_expiresAt', (q) => q.lt('expiresAt', now - PAIR_MS))
            .take(20))
            await ctx.db.delete('pairings', old._id)
        if (await ctx.db.query('pairings').withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash)).first()) throw new Error('Make a new token for each pairing')
        let code = newCode()
        while (await ctx.db.query('pairings').withIndex('by_code', (q) => q.eq('code', code)).first()) code = newCode()
        const expiresAt = now + PAIR_MS
        await ctx.db.insert('pairings', { code, tokenHash, name: label, os, expiresAt })
        return { code, expiresAt }
    },
})

// For the waiting computer: approved yet? Only the computer knows the hash of its own token, so nothing else can
// watch this. `now` comes from the caller, since queries don't read the clock.
export const status = query({
    args: { tokenHash: v.string(), now: v.number() },
    handler: async (ctx, { tokenHash, now }) => {
        const p = await ctx.db
            .query('pairings')
            .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
            .first()
        if (!p) return 'expired' as const
        if (p.approvedAt) return 'approved' as const
        return p.expiresAt < now ? ('expired' as const) : ('waiting' as const)
    },
})

// For the dashboard's approval screen: which computer is asking
export const lookup = query({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        await requireWorkspace(ctx)
        const code = normalize(args.code)
        const p = code && (await ctx.db.query('pairings').withIndex('by_code', (q) => q.eq('code', code)).first())
        if (!p) return null
        return { code: p.code, name: p.name, os: p.os, expiresAt: p.expiresAt, approved: !!p.approvedAt }
    },
})

// You approve the code: the computer joins your workspace under the name it gave
export const approve = mutation({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        const code = normalize(args.code)
        const p = code && (await ctx.db.query('pairings').withIndex('by_code', (q) => q.eq('code', code)).first())
        if (!p || p.expiresAt < Date.now()) throw new Error('That code has expired or doesn’t exist. Check the code on the computer.')
        if (p.approvedAt) throw new Error('That computer is already connected')
        const runnerId = await ctx.db.insert('runners', { workspaceId: ws._id, name: p.name, tokenHash: p.tokenHash, os: p.os })
        await ctx.db.patch('pairings', p._id, { approvedAt: Date.now() })
        return runnerId
    },
})
