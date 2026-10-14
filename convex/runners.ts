import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { TOKEN_PREFIX } from './lib/tokens'

// Your agents, with what each has set up, for Connections. Never returns the token hash.
export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('runners')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
            .take(50)
        return rows.map(({ tokenHash, ...r }) => r)
    },
})

// The browser makes the token and sends only its hash, so the token never reaches Convex
export const create = mutation({
    args: { name: v.string(), tokenHash: v.string() },
    handler: async (ctx, { name, tokenHash }) => {
        const ws = await requireWorkspace(ctx)
        const label = name.trim()
        if (!label) throw new Error('Give the engine a name, e.g. "Mac mini"')
        if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error(`Make the token in the dashboard (it starts with ${TOKEN_PREFIX})`)
        return ctx.db.insert('runners', { workspaceId: ws._id, name: label, tokenHash })
    },
})

// The engine using this token is cut off on its next call, and the keys locked for it are deleted
export const revoke = mutation({
    args: { id: v.id('runners') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'runners', id)
        for (const row of await ctx.db.query('secrets').withIndex('by_runnerId', (q) => q.eq('runnerId', id)).take(100)) await ctx.db.delete('secrets', row._id)
        await ctx.db.delete('runners', id)
    },
})

// Where your accounts reach this engine. Not secret, so it's stored as is.
export const setPublicUrl = mutation({
    args: { id: v.id('runners'), publicUrl: v.optional(v.string()) },
    handler: async (ctx, { id, publicUrl }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'runners', id)
        const url = publicUrl?.trim().replace(/\/+$/, '') || undefined
        if (url && !/^https?:\/\/[^\s/]+/.test(url)) throw new Error('Enter a URL starting with https://')
        if (url && url.length > 300) throw new Error('That URL is too long')
        await ctx.db.patch('runners', id, { publicUrl: url })
        return null
    },
})
