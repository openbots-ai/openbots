import { v } from 'convex/values'
import { mutation, query, type MutationCtx } from './_generated/server'
import { currentWorkspace, owned, requireWorkspace } from './lib/access'
import { canComputerUse, NO_COMPUTER_USE } from './lib/computers'
import { requireKeyOffers } from './lib/keyModels'
import { isValidChoice } from './lib/models'
import { agentFields } from './schema'
import type { Doc } from './_generated/dataModel'

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

// Checks the fields, and that each changed model choice is one the workspace's keys can use
async function check(ctx: MutationCtx, ws: Doc<'workspace'>, { name, temperature, models }: { name: string; temperature?: number; models?: Record<string, string> }, before?: Record<string, string>) {
    if (!name.trim()) throw new Error('Give your agent a name')
    if (temperature !== undefined && (temperature < 0 || temperature > 1)) throw new Error('Creativity must be between 0 and 1')
    for (const [slot, choice] of Object.entries(models ?? {})) {
        if (!isValidChoice(slot, choice)) throw new Error(`${choice} can't be used for ${slot}`)
        // A saved choice the key stopped offering can stay; only new picks are checked against the keys
        if (before?.[slot] !== choice) await requireKeyOffers(ctx, ws._id, slot, choice)
    }
}

export const create = mutation({
    args: agentFields,
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        await check(ctx, ws, args)
        return ctx.db.insert('agents', { ...args, workspaceId: ws._id, name: args.name.trim(), updatedAt: Date.now() })
    },
})

export const update = mutation({
    args: { id: v.id('agents'), ...agentFields },
    handler: async (ctx, { id, name, role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, models }) => {
        const ws = await requireWorkspace(ctx)
        const agent = await owned(ctx, ws, 'agents', id)
        await check(ctx, ws, { name, temperature, models }, agent.models)
        // Explicit keys: an omitted optional (avatar, folder) arrives as undefined, which clears it
        await ctx.db.patch('agents', id, { name: name.trim(), role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, models, updatedAt: Date.now() })
    },
})

// Gives this agent its own computer for computer use, or (without one) the workspace's
export const setComputer = mutation({
    args: { id: v.id('agents'), computerId: v.optional(v.id('runners')) },
    handler: async (ctx, { id, computerId }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', id)
        if (computerId && !canComputerUse(await owned(ctx, ws, 'runners', computerId))) throw new Error(NO_COMPUTER_USE)
        await ctx.db.patch('agents', id, { computerId })
    },
})

// Conversations with this agent stay on your engine's machine; here only its numbers and knowledge are let go
export const remove = mutation({
    args: { id: v.id('agents') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', id)
        for await (const n of ctx.db.query('numbers').withIndex('by_agent', (q) => q.eq('agentId', id))) await ctx.db.patch('numbers', n._id, { agentId: undefined })
        for await (const k of ctx.db.query('knowledge').withIndex('by_workspace_and_agent', (q) => q.eq('workspaceId', ws._id).eq('agentId', id)))
            await ctx.db.patch('knowledge', k._id, { agentId: undefined })
        if (ws.defaultAgentId === id) await ctx.db.patch('workspace', ws._id, { defaultAgentId: undefined })
        await ctx.db.delete('agents', id)
    },
})
