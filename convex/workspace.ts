import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { mutation as rawMutation, query as rawQuery } from './_generated/server'
import { mutation, query } from './lib/auth'
import { handleKind } from './lib/handles'
import { isValidChoice } from './lib/models'
import { workspaceSettings } from './schema'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const get = query({
    args: {},
    handler: (ctx) => ctx.db.query('workspace').first(),
})

// What the signed-in user can do here, so the dashboard knows which screen to show:
// 'owner' gets in, 'setup' creates the workspace, 'unclaimed' takes over one made before sign-in existed, 'denied' is someone else's
export const access = rawQuery({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx)
        if (!userId) return 'signedOut' as const
        const ws = await ctx.db.query('workspace').first()
        if (!ws) return 'setup' as const
        if (!ws.ownerId) return 'unclaimed' as const
        return ws.ownerId === userId ? ('owner' as const) : ('denied' as const)
    },
})

// First visit: the dashboard asks for these two names and creates the workspace, owned by whoever is signed in
export const create = rawMutation({
    args: { name: v.string(), ownerName: v.string(), timezone: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const ownerId = await getAuthUserId(ctx)
        if (!ownerId) throw new Error('Sign in to continue')
        if (await ctx.db.query('workspace').first()) throw new Error('This workspace is already set up')
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')
        return ctx.db.insert('workspace', { name, ownerName, ownerId, timezone: args.timezone })
    },
})

// A workspace made before sign-in existed has no owner: the first account to sign in takes it
export const claim = rawMutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx)
        if (!userId) throw new Error('Sign in to continue')
        const ws = await ctx.db.query('workspace').first()
        if (!ws || ws.ownerId) throw new Error('This workspace already has an owner')
        await ctx.db.patch('workspace', ws._id, { ownerId: userId })
    },
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string(), ...workspaceSettings },
    handler: async (ctx, args) => {
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')

        const ownerHandle = args.ownerHandle?.trim() || undefined
        if (ownerHandle && !handleKind(ownerHandle)) throw new Error('Enter a phone number or an Apple ID email for handoff alerts')
        if ((args.quietStart && !TIME.test(args.quietStart)) || (args.quietEnd && !TIME.test(args.quietEnd))) throw new Error('Quiet hours need a start and end time')
        if (args.replyDelaySec !== undefined && (args.replyDelaySec < 0 || args.replyDelaySec > 60)) throw new Error('Reply delay must be between 0 and 60 seconds')
        for (const budget of [args.dailyBudget, args.weeklyBudget]) if (budget !== undefined && !(budget > 0)) throw new Error('A budget must be more than 0 credits')
        if (args.defaultAgentId && !(await ctx.db.get('agents', args.defaultAgentId))) throw new Error('That agent no longer exists')

        // Every settings key is written explicitly, so one the client left out (undefined) is cleared.
        // Model choices are the exception: the Models page saves those through setModel.
        const settings = Object.fromEntries(
            Object.keys(workspaceSettings)
                .filter((k) => k !== 'models')
                .map((k) => [k, args[k as keyof typeof workspaceSettings]]),
        )
        const fields = { ...settings, name, ownerName, ownerHandle, newContactTag: args.newContactTag?.trim().toLowerCase() || undefined }

        const ws = await ctx.db.query('workspace').first()
        if (ws) await ctx.db.patch('workspace', ws._id, fields)
    },
})

// Sets the workspace-wide model for one slot (Models page)
export const setModel = mutation({
    args: { slot: v.string(), model: v.string() },
    handler: async (ctx, { slot, model }) => {
        if (!isValidChoice(slot, model)) throw new Error(`${model} can't be used for ${slot}`)
        const ws = await ctx.db.query('workspace').first()
        if (!ws) throw new Error('Workspace not set up yet')
        await ctx.db.patch('workspace', ws._id, { models: { ...ws.models, [slot]: model } })
    },
})

// Your configuration and counts, for the Settings → Export button. Messages and contacts live on your agent.
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const [ws, agents, numbers, knowledge, usage, activity] = await Promise.all([
            ctx.db.query('workspace').first(),
            ctx.db.query('agents').collect(),
            ctx.db.query('numbers').collect(),
            ctx.db.query('knowledge').collect(),
            ctx.db.query('usage').collect(),
            ctx.db.query('activity').collect(),
        ])
        // Your account id isn't part of the export
        const workspace = ws ? (({ ownerId, ...rest }) => rest)(ws) : null
        return { workspace, agents, numbers, knowledge, usage, activity }
    },
})
