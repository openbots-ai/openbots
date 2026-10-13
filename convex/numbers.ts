import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { insertNumber } from './lib/numbers'
import { channel } from './schema'

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db
            .query('numbers')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id))
            .take(500)
    },
})

export const assign = mutation({
    args: { id: v.id('numbers'), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { id, agentId }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'numbers', id)
        if (agentId) await owned(ctx, ws, 'agents', agentId)
        await ctx.db.patch('numbers', id, { agentId })
    },
})

// Stops using a number here. A Twilio number stays in your Twilio account (release it there to stop paying).
export const remove = mutation({
    args: { id: v.id('numbers') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'numbers', id)
        await ctx.db.delete('numbers', id)
    },
})

// A number one of your agent's channels answers on: a line it reported, or one you type in.
// Twilio numbers are added through the agent instead (tasks.request), which points their texts at it.
export const add = mutation({
    args: { handle: v.string(), channel, agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { handle, channel, agentId }) => {
        const ws = await requireWorkspace(ctx)
        if (channel === 'twilio') throw new Error('Add Twilio numbers with Get a number')
        if (agentId) await owned(ctx, ws, 'agents', agentId)
        return insertNumber(ctx, { workspaceId: ws._id, handle, channel, agentId })
    },
})
