import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { currentWorkspace, owned, requireWorkspace } from './lib/access'
import { deleteConversation } from './lib/cascade'
import { isValidChoice } from './lib/models'
import { agentFields } from './schema'

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db
            .query('agents')
            .withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', ws._id))
            .order('desc')
            .take(500)
    },
})

// Takes a plain string so a stale or hand-edited ?id= resolves to null instead of a validator error
export const get = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const ws = await currentWorkspace(ctx)
        const agentId = ctx.db.normalizeId('agents', id)
        const agent = ws && agentId && (await ctx.db.get('agents', agentId))
        return agent && agent.workspaceId === ws._id ? agent : null
    },
})

function check({ name, temperature, models }: { name: string; temperature?: number; models?: Record<string, string> }) {
    if (!name.trim()) throw new Error('Give your agent a name')
    if (temperature !== undefined && (temperature < 0 || temperature > 1)) throw new Error('Creativity must be between 0 and 1')
    for (const [slot, choice] of Object.entries(models ?? {})) if (!isValidChoice(slot, choice)) throw new Error(`${choice} can't be used for ${slot}`)
}

export const create = mutation({
    args: agentFields,
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        check(args)
        return ctx.db.insert('agents', { ...args, workspaceId: ws._id, name: args.name.trim(), updatedAt: Date.now() })
    },
})

export const update = mutation({
    args: { id: v.id('agents'), ...agentFields },
    handler: async (ctx, { id, name, role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, models }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', id)
        check({ name, temperature, models })
        // Explicit keys: an omitted optional (avatar, folder) arrives as undefined, which clears it
        await ctx.db.patch('agents', id, { name: name.trim(), role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, models, updatedAt: Date.now() })
    },
})

export const remove = mutation({
    args: { id: v.id('agents') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', id)
        for await (const n of ctx.db.query('numbers').withIndex('by_agent', (q) => q.eq('agentId', id))) await ctx.db.patch('numbers', n._id, { agentId: undefined })
        for await (const c of ctx.db.query('contacts').withIndex('by_agent', (q) => q.eq('agentId', id))) await ctx.db.patch('contacts', c._id, { agentId: undefined })
        for await (const k of ctx.db.query('knowledge').withIndex('by_workspace_and_agent', (q) => q.eq('workspaceId', ws._id).eq('agentId', id)))
            await ctx.db.patch('knowledge', k._id, { agentId: undefined })
        for (const c of await ctx.db.query('conversations').withIndex('by_agent', (q) => q.eq('agentId', id)).collect()) await deleteConversation(ctx, c._id)
        if (ws.defaultAgentId === id) await ctx.db.patch('workspace', ws._id, { defaultAgentId: undefined })
        await ctx.db.delete('agents', id)
    },
})
