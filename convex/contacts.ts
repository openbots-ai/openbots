import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteConversation } from './lib/cascade'
import { handleKind } from './lib/handles'

const fields = {
    name: v.string(),
    handle: v.string(),
    tags: v.array(v.string()),
    notes: v.string(),
    agentId: v.optional(v.id('agents')),
}

function clean(args: { name: string; handle: string }) {
    const name = args.name.trim()
    const handle = args.handle.trim()
    if (!name) throw new Error('Contact needs a name')
    if (!handleKind(handle)) throw new Error('Enter a phone number or an email address')
    return { name, handle }
}

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('contacts').collect()).sort((a, b) => a.name.localeCompare(b.name)),
})

export const create = mutation({
    args: fields,
    handler: (ctx, args) => ctx.db.insert('contacts', { ...args, ...clean(args) }),
})

export const update = mutation({
    args: { id: v.id('contacts'), ...fields },
    handler: (ctx, { id, tags, notes, agentId, ...rest }) => ctx.db.patch(id, { ...clean(rest), tags, notes, agentId }),
})

export const remove = mutation({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        for (const c of await ctx.db.query('conversations').collect()) if (c.contactId === id) await deleteConversation(ctx, c._id)
        await ctx.db.delete(id)
    },
})
