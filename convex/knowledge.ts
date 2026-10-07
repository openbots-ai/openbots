import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const fields = { title: v.string(), body: v.string(), agentId: v.optional(v.id('agents')) }

function title(raw: string) {
    const t = raw.trim()
    if (!t) throw new Error('Give the document a title')
    return t
}

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('knowledge').collect()).sort((a, b) => b.updatedAt - a.updatedAt),
})

export const create = mutation({
    args: fields,
    handler: (ctx, args) => ctx.db.insert('knowledge', { ...args, title: title(args.title), updatedAt: Date.now() }),
})

export const update = mutation({
    args: { id: v.id('knowledge'), ...fields },
    handler: (ctx, { id, body, agentId, ...rest }) => ctx.db.patch(id, { title: title(rest.title), body, agentId, updatedAt: Date.now() }),
})

export const remove = mutation({
    args: { id: v.id('knowledge') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
