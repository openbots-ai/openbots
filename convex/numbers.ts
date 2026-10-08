import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { handleKey, handleKind } from './lib/handles'

export const list = query({
    args: {},
    handler: (ctx) => ctx.db.query('numbers').take(500),
})

export const create = mutation({
    args: { handle: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { handle, agentId }) => {
        const kind = handleKind(handle)
        const key = handleKey(handle)
        if (!kind || !key) throw new Error('Enter a phone number or an email address')
        if (await ctx.db.query('numbers').withIndex('by_key', (q) => q.eq('key', key)).first()) throw new Error('That number is already added')
        return ctx.db.insert('numbers', { handle: handle.trim(), key, kind, agentId })
    },
})

export const assign = mutation({
    args: { id: v.id('numbers'), agentId: v.optional(v.id('agents')) },
    handler: (ctx, { id, agentId }) => ctx.db.patch('numbers', id, { agentId }),
})

export const remove = mutation({
    args: { id: v.id('numbers') },
    handler: async (ctx, { id }) => {
        // Conversations keep working; replies fall back to the agent's other number
        for await (const c of ctx.db.query('conversations')) if (c.numberId === id) await ctx.db.patch('conversations', c._id, { numberId: undefined })
        await ctx.db.delete('numbers', id)
    },
})
