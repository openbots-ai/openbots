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
        if (!label) throw new Error('Give the agent a name, e.g. "Mac mini"')
        if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error(`Make the token in the dashboard (it starts with ${TOKEN_PREFIX})`)
        return ctx.db.insert('runners', { workspaceId: ws._id, name: label, tokenHash })
    },
})

// The agent using this token is cut off on its next call
export const revoke = mutation({
    args: { id: v.id('runners') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'runners', id)
        await ctx.db.delete('runners', id)
    },
})
