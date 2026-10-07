import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { handleKind } from './lib/handles'

export const list = query({
    args: {},
    handler: (ctx) => ctx.db.query('numbers').collect(),
})

export const create = mutation({
    args: { handle: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { handle, agentId }) => {
        const kind = handleKind(handle)
        if (!kind) throw new Error('Enter a phone number or an email address')
        return ctx.db.insert('numbers', { handle: handle.trim(), kind, agentId })
    },
})

export const assign = mutation({
    args: { id: v.id('numbers'), agentId: v.optional(v.id('agents')) },
    handler: (ctx, { id, agentId }) => ctx.db.patch(id, { agentId }),
})

export const remove = mutation({
    args: { id: v.id('numbers') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
