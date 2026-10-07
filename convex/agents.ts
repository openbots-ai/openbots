import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteConversation } from './lib/cascade'
import { agentFields } from './schema'

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('agents').collect()).sort((a, b) => b.updatedAt - a.updatedAt),
})

// Takes a plain string so a stale or hand-edited ?id= resolves to null instead of a validator error
export const get = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const agentId = ctx.db.normalizeId('agents', id)
        return agentId ? ctx.db.get(agentId) : null
    },
})

export const create = mutation({
    args: agentFields,
    handler: async (ctx, args) => {
        const name = args.name.trim()
        if (!name) throw new Error('Give your agent a name')
        return ctx.db.insert('agents', { ...args, name, updatedAt: Date.now() })
    },
})

export const update = mutation({
    args: { id: v.id('agents'), ...agentFields },
    handler: async (ctx, { id, name, role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength }) => {
        if (!name.trim()) throw new Error('Give your agent a name')
        if (temperature !== undefined && (temperature < 0 || temperature > 1)) throw new Error('Creativity must be between 0 and 1')
        // Explicit keys: an omitted optional (avatar, folder) arrives as undefined, which clears it
        await ctx.db.patch(id, { name: name.trim(), role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, updatedAt: Date.now() })
    },
})

export const remove = mutation({
    args: { id: v.id('agents') },
    handler: async (ctx, { id }) => {
        for (const n of await ctx.db.query('numbers').collect()) if (n.agentId === id) await ctx.db.patch(n._id, { agentId: undefined })
        for (const c of await ctx.db.query('contacts').collect()) if (c.agentId === id) await ctx.db.patch(c._id, { agentId: undefined })
        for (const k of await ctx.db.query('knowledge').collect()) if (k.agentId === id) await ctx.db.patch(k._id, { agentId: undefined })
        for (const c of await ctx.db.query('conversations').collect()) if (c.agentId === id) await deleteConversation(ctx, c._id)
        const ws = await ctx.db.query('workspace').first()
        if (ws?.defaultAgentId === id) await ctx.db.patch(ws._id, { defaultAgentId: undefined })
        await ctx.db.delete(id)
    },
})
