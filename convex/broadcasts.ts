import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('broadcasts').collect()).sort((a, b) => b.scheduledFor - a.scheduledFor),
})

export const create = mutation({
    args: { title: v.string(), body: v.string(), agentId: v.id('agents'), tag: v.string(), scheduledFor: v.number() },
    handler: (ctx, args) => {
        if (!args.title.trim() || !args.body.trim() || !args.tag) throw new Error('Title, message and audience are required')
        return ctx.db.insert('broadcasts', { ...args, title: args.title.trim(), body: args.body.trim(), status: 'scheduled' })
    },
})

// Simulated: marks it sent; nothing leaves the building
export const send = mutation({
    args: { id: v.id('broadcasts') },
    handler: (ctx, { id }) => ctx.db.patch(id, { status: 'sent', scheduledFor: Date.now() }),
})

export const remove = mutation({
    args: { id: v.id('broadcasts') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
