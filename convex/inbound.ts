import { v } from 'convex/values'
import { internalMutation, mutation } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { handleKey } from './lib/handles'
import { receiveText } from './lib/inbox'

// A text that arrived on a connected texting account's webhook. Returns null when it isn't for one of this
// workspace's numbers (a number removed from the dashboard, or a message the account sent itself).
export const fromChannel = internalMutation({
    args: {
        connectionId: v.id('connections'),
        // The number it was sent to; BlueBubbles leaves it out (the connection is one Mac, one number)
        to: v.optional(v.string()),
        from: v.string(),
        body: v.string(),
        name: v.optional(v.string()),
        thread: v.optional(v.object({ key: v.string(), title: v.optional(v.string()) })),
    },
    handler: async (ctx, { connectionId, to, ...msg }) => {
        const conn = await ctx.db.get('connections', connectionId)
        if (!conn) return null
        const numbers = await ctx.db
            .query('numbers')
            .withIndex('by_connection', (q) => q.eq('connectionId', connectionId))
            .take(200)
        const key = to && handleKey(to)
        const number = key ? numbers.find((n) => n.key === key) : numbers[0]
        if (!number) return null
        return receiveText(ctx, { workspaceId: number.workspaceId, number }, msg)
    },
})

// The dashboard's "Test a text": goes through the same path as a real text (contact, memory, the real model
// with your key), but the conversation is marked as a test and its replies are never sent anywhere
export const simulate = mutation({
    args: { agentId: v.id('agents'), from: v.string(), body: v.string(), name: v.optional(v.string()) },
    handler: async (ctx, { agentId, ...msg }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', agentId)
        return receiveText(ctx, { workspaceId: ws._id, agentId, test: true }, msg)
    },
})
