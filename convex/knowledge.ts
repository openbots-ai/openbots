import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'

const fields = { title: v.string(), body: v.string(), agentId: v.optional(v.id('agents')), shareWithContacts: v.optional(v.boolean()) }

function title(raw: string) {
    const t = raw.trim()
    if (!t) throw new Error('Give the document a title')
    return t
}

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db
            .query('knowledge')
            .withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', ws._id))
            .order('desc')
            .take(500)
    },
})

export const create = mutation({
    args: fields,
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        if (args.agentId) await owned(ctx, ws, 'agents', args.agentId)
        return ctx.db.insert('knowledge', { ...args, workspaceId: ws._id, title: title(args.title), updatedAt: Date.now() })
    },
})

export const update = mutation({
    args: { id: v.id('knowledge'), ...fields },
    handler: async (ctx, { id, body, agentId, shareWithContacts, ...rest }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'knowledge', id)
        if (agentId) await owned(ctx, ws, 'agents', agentId)
        await ctx.db.patch('knowledge', id, { title: title(rest.title), body, agentId, shareWithContacts, updatedAt: Date.now() })
    },
})

export const remove = mutation({
    args: { id: v.id('knowledge') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'knowledge', id)
        await ctx.db.delete('knowledge', id)
    },
})
