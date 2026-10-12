import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { currentWorkspace, owned, requireUser, requireWorkspace } from './lib/access'
import { handleKind } from './lib/handles'
import { isValidChoice } from './lib/models'
import { workspaceSettings } from './schema'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// The signed-in user's workspace, or null until they've set it up
export const get = query({
    args: {},
    handler: (ctx) => currentWorkspace(ctx),
})

// First visit after signing up: the dashboard asks for these two names and creates the workspace
export const create = mutation({
    args: { name: v.string(), ownerName: v.string(), timezone: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const userId = await requireUser(ctx)
        if (await currentWorkspace(ctx)) throw new Error('Your workspace is already set up')
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')
        const user = await ctx.db.get('users', userId)
        return ctx.db.insert('workspace', { userId, name, ownerName, timezone: args.timezone, ownerEmail: user?.email })
    },
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string(), ...workspaceSettings },
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')

        const ownerEmail = args.ownerEmail?.trim() || undefined
        if (ownerEmail && handleKind(ownerEmail) !== 'email') throw new Error('Enter a valid email address')
        if ((args.quietStart && !TIME.test(args.quietStart)) || (args.quietEnd && !TIME.test(args.quietEnd))) throw new Error('Quiet hours need a start and end time')
        if (args.replyDelaySec !== undefined && (args.replyDelaySec < 0 || args.replyDelaySec > 60)) throw new Error('Reply delay must be between 0 and 60 seconds')
        for (const budget of [args.dailyBudget, args.weeklyBudget]) if (budget !== undefined && !(budget > 0)) throw new Error('A budget must be more than 0 credits')
        if (args.defaultAgentId) await owned(ctx, ws, 'agents', args.defaultAgentId)

        // Every settings key is written explicitly, so one the client left out (undefined) is cleared.
        // Model choices are the exception: the Models page saves those through setModel.
        const settings = Object.fromEntries(
            Object.keys(workspaceSettings)
                .filter((k) => k !== 'models')
                .map((k) => [k, args[k as keyof typeof workspaceSettings]]),
        )
        await ctx.db.patch('workspace', ws._id, { ...settings, name, ownerName, ownerEmail, newContactTag: args.newContactTag?.trim().toLowerCase() || undefined })
    },
})

// Sets the workspace-wide model for one slot (Models page)
export const setModel = mutation({
    args: { slot: v.string(), model: v.string() },
    handler: async (ctx, { slot, model }) => {
        if (!isValidChoice(slot, model)) throw new Error(`${model} can't be used for ${slot}`)
        const ws = await requireWorkspace(ctx)
        await ctx.db.patch('workspace', ws._id, { models: { ...ws.models, [slot]: model } })
    },
})

// Everything in the workspace, for the Settings → Export button. Connection credentials are left out.
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const id = ws._id
        const [agents, contacts, knowledge, notifications, usage, numbers, conversations, connections] = await Promise.all([
            ctx.db.query('agents').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('contacts').withIndex('by_workspace_and_name', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('knowledge').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('notifications').withIndex('by_workspace_and_at', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('usage').withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('numbers').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('conversations').withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('connections').withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', id)).collect(),
        ])
        const messages = (
            await Promise.all(conversations.map((c) => ctx.db.query('messages').withIndex('by_conversation', (q) => q.eq('conversationId', c._id)).collect()))
        ).flat()
        return {
            workspace: ws,
            agents,
            numbers,
            contacts,
            conversations,
            messages,
            knowledge,
            usage,
            notifications,
            connections: connections.map(({ provider, label, details, status }) => ({ provider, label, details, status })),
        }
    },
})
