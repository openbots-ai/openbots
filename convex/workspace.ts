import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { currentWorkspace, owned, requireUser, requireWorkspace } from './lib/access'
import { handleKind } from './lib/handles'
import { requireKeyOffers } from './lib/keyModels'
import { isValidChoice } from './lib/models'
import { DEFAULT_DAILY_BUDGET, withDefaults } from './lib/usage'
import { workspaceSettings } from './schema'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// The signed-in user's workspace, or null until they've set it up. Limits it hasn't set show their defaults.
export const get = query({
    args: {},
    handler: async (ctx) => {
        const ws = await currentWorkspace(ctx)
        return ws && withDefaults(ws)
    },
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
        return ctx.db.insert('workspace', { userId, name, ownerName, timezone: args.timezone, ownerEmail: user?.email, dailyBudget: DEFAULT_DAILY_BUDGET })
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
        const ownerHandle = args.ownerHandle?.trim() || undefined
        if (ownerHandle && !handleKind(ownerHandle)) throw new Error('Enter a phone number or an Apple ID email for handoff texts')
        if ((args.quietStart && !TIME.test(args.quietStart)) || (args.quietEnd && !TIME.test(args.quietEnd))) throw new Error('Quiet hours need a start and end time')
        if (args.replyDelaySec !== undefined && (args.replyDelaySec < 0 || args.replyDelaySec > 60)) throw new Error('Reply delay must be between 0 and 60 seconds')
        for (const budget of [args.dailyBudget, args.weeklyBudget]) if (budget !== undefined && !(budget > 0)) throw new Error('A budget must be more than 0 credits')
        if (args.contactRepliesPerHour !== undefined && !(Number.isInteger(args.contactRepliesPerHour) && args.contactRepliesPerHour >= 1 && args.contactRepliesPerHour <= 1000)) throw new Error('Replies per contact must be a whole number from 1 to 1000')
        if (args.defaultAgentId) await owned(ctx, ws, 'agents', args.defaultAgentId)

        // Every settings key is written explicitly, so one the client left out (undefined) is cleared.
        // Model choices are the exception: the Models page saves those through setModel.
        const settings = Object.fromEntries(
            Object.keys(workspaceSettings)
                .filter((k) => k !== 'models')
                .map((k) => [k, args[k as keyof typeof workspaceSettings]]),
        )
        await ctx.db.patch('workspace', ws._id, { ...settings, name, ownerName, ownerEmail, ownerHandle, newContactTag: args.newContactTag?.trim().toLowerCase() || undefined })
    },
})

// Sets the workspace-wide model for one slot (Models page)
export const setModel = mutation({
    args: { slot: v.string(), model: v.string() },
    handler: async (ctx, { slot, model }) => {
        if (!isValidChoice(slot, model)) throw new Error(`${model} can't be used for ${slot}`)
        const ws = await requireWorkspace(ctx)
        if (ws.models?.[slot] !== model) await requireKeyOffers(ctx, ws._id, slot, model)
        await ctx.db.patch('workspace', ws._id, { models: { ...ws.models, [slot]: model } })
    },
})

// Your configuration and counts, for the Settings → Export button. Conversations and contacts live on your engine.
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const id = ws._id
        const [agents, knowledge, usage, activity, numbers] = await Promise.all([
            ctx.db.query('agents').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('knowledge').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('usage').withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('activity').withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('numbers').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', id)).collect(),
        ])
        const { userId, ...workspace } = ws
        return { workspace, agents, numbers, knowledge, usage, activity }
    },
})
