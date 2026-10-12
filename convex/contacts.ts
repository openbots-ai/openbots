import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { deleteConversation } from './lib/cascade'
import { handleKey } from './lib/handles'

const fields = {
    name: v.string(),
    handle: v.string(),
    tags: v.array(v.string()),
    notes: v.string(),
    agentId: v.optional(v.id('agents')),
}

// Trims, validates and refuses a handle another contact in this workspace already has
async function clean(ctx: MutationCtx, ws: Doc<'workspace'>, args: { name: string; handle: string; agentId?: Id<'agents'> }, self?: Id<'contacts'>) {
    const name = args.name.trim()
    const handle = args.handle.trim()
    if (!name) throw new Error('Contact needs a name')
    const key = handleKey(handle)
    if (!key) throw new Error('Enter a phone number or an email address')
    const twin = await ctx.db
        .query('contacts')
        .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', key))
        .first()
    if (twin && twin._id !== self) throw new Error(`${twin.name} already has that handle`)
    if (args.agentId) await owned(ctx, ws, 'agents', args.agentId)
    return { name, handle, key }
}

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db
            .query('contacts')
            .withIndex('by_workspace_and_name', (q) => q.eq('workspaceId', ws._id))
            .take(2000)
    },
})

// One contact's conversations, for the contact dialog
export const conversations = query({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'contacts', id)
        const rows = await ctx.db
            .query('conversations')
            .withIndex('by_contact_and_agent', (q) => q.eq('contactId', id))
            .take(50)
        return Promise.all(rows.map(async (c) => ({ ...c, agentName: (await ctx.db.get('agents', c.agentId))?.name ?? 'Unknown' })))
    },
})

export const create = mutation({
    args: fields,
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db.insert('contacts', { ...args, ...(await clean(ctx, ws, args)), workspaceId: ws._id })
    },
})

export const update = mutation({
    args: { id: v.id('contacts'), ...fields },
    handler: async (ctx, { id, tags, notes, ...rest }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'contacts', id)
        await ctx.db.patch('contacts', id, { ...(await clean(ctx, ws, rest, id)), tags, notes, agentId: rest.agentId })
    },
})

export const remove = mutation({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'contacts', id)
        for (const c of await ctx.db.query('conversations').withIndex('by_contact_and_agent', (q) => q.eq('contactId', id)).collect()) await deleteConversation(ctx, c._id)
        await ctx.db.delete('contacts', id)
    },
})
