import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { handleKind } from './lib/handles'
import { isValidChoice } from './lib/models'
import { workspaceSettings } from './schema'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const get = query({
    args: {},
    handler: (ctx) => ctx.db.query('workspace').first(),
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string(), ...workspaceSettings },
    handler: async (ctx, args) => {
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')

        const ownerEmail = args.ownerEmail?.trim() || undefined
        if (ownerEmail && handleKind(ownerEmail) !== 'email') throw new Error('Enter a valid email address')
        if ((args.quietStart && !TIME.test(args.quietStart)) || (args.quietEnd && !TIME.test(args.quietEnd))) throw new Error('Quiet hours need a start and end time')
        if (args.replyDelaySec !== undefined && (args.replyDelaySec < 0 || args.replyDelaySec > 60)) throw new Error('Reply delay must be between 0 and 60 seconds')
        if (args.defaultAgentId && !(await ctx.db.get(args.defaultAgentId))) throw new Error('That agent no longer exists')

        // Every settings key is written explicitly, so one the client left out (undefined) is cleared.
        // Model choices are the exception: the Models page saves those through setModel.
        const settings = Object.fromEntries(
            Object.keys(workspaceSettings)
                .filter((k) => k !== 'models')
                .map((k) => [k, args[k as keyof typeof workspaceSettings]]),
        )
        const fields = { ...settings, name, ownerName, ownerEmail, newContactTag: args.newContactTag?.trim().toLowerCase() || undefined }

        const ws = await ctx.db.query('workspace').first()
        if (ws) await ctx.db.patch(ws._id, fields)
        else await ctx.db.insert('workspace', fields)
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

// Everything in the workspace, for the Settings → Export button
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const [workspace, agents, numbers, contacts, conversations, messages, knowledge] = await Promise.all([
            ctx.db.query('workspace').first(),
            ctx.db.query('agents').collect(),
            ctx.db.query('numbers').collect(),
            ctx.db.query('contacts').collect(),
            ctx.db.query('conversations').collect(),
            ctx.db.query('messages').collect(),
            ctx.db.query('knowledge').collect(),
        ])
        return { workspace, agents, numbers, contacts, conversations, messages, knowledge }
    },
})
