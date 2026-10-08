import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { deleteConversation } from './lib/cascade'
import { handleKey } from './lib/handles'

const fields = {
    name: v.string(),
    handle: v.string(),
    tags: v.array(v.string()),
    notes: v.string(),
    agentId: v.optional(v.id('agents')),
}

// Trims, validates and refuses a handle another contact already has
async function clean(ctx: MutationCtx, args: { name: string; handle: string }, self?: Id<'contacts'>) {
    const name = args.name.trim()
    const handle = args.handle.trim()
    if (!name) throw new Error('Contact needs a name')
    const key = handleKey(handle)
    if (!key) throw new Error('Enter a phone number or an email address')
    const twin = await ctx.db.query('contacts').withIndex('by_key', (q) => q.eq('key', key)).first()
    if (twin && twin._id !== self) throw new Error(`${twin.name} already has that handle`)
    return { name, handle, key }
}

export const list = query({
    args: {},
    handler: (ctx) => ctx.db.query('contacts').withIndex('by_name').take(2000),
})

// One contact with their conversations, for the contact dialog
export const conversations = query({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        const rows = await ctx.db.query('conversations').withIndex('by_contact_and_agent', (q) => q.eq('contactId', id)).take(50)
        return Promise.all(rows.map(async (c) => ({ ...c, agentName: (await ctx.db.get('agents', c.agentId))?.name ?? 'Unknown' })))
    },
})

export const create = mutation({
    args: fields,
    handler: async (ctx, args) => ctx.db.insert('contacts', { ...args, ...(await clean(ctx, args)) }),
})

export const update = mutation({
    args: { id: v.id('contacts'), ...fields },
    handler: async (ctx, { id, tags, notes, agentId, ...rest }) => ctx.db.patch('contacts', id, { ...(await clean(ctx, rest, id)), tags, notes, agentId }),
})

export const remove = mutation({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        for (const c of await ctx.db.query('conversations').withIndex('by_contact_and_agent', (q) => q.eq('contactId', id)).collect()) await deleteConversation(ctx, c._id)
        await ctx.db.delete('contacts', id)
    },
})
