import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { taskRequest } from './schema'

// Asks your agents to do something only they can, because only they have the credentials: check their keys again,
// or search, buy or reuse a Twilio number. The dashboard then watches the task (get) until an agent writes back.
export const request = mutation({
    args: { request: taskRequest },
    handler: async (ctx, { request }) => {
        const ws = await requireWorkspace(ctx)
        if ('agentId' in request && request.agentId) await owned(ctx, ws, 'agents', request.agentId)
        const online = await ctx.db
            .query('runners')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
            .take(50)
        if (!online.length) throw new Error('Add an engine in Connections first')
        if (request.kind !== 'recheck' && !online.some((r) => r.services?.some((s) => s.service === 'twilio' && !s.error))) throw new Error('Add your Twilio account in Connections first')
        if (request.kind === 'twilioTestText') {
            // Only from a Twilio number you've added in Numbers, to a real-looking phone number, and short
            const from = await ctx.db
                .query('numbers')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', request.from.replace(/\D/g, '')))
                .unique()
            if (!from || from.channel !== 'twilio') throw new Error('Send from one of your Twilio numbers in Numbers')
            const digits = request.to.replace(/\D/g, '')
            if (digits.length < 10 || digits.length > 15) throw new Error('Enter the phone number to text, with its area code')
            if (!request.body.trim() || request.body.length > 320) throw new Error('Write a message of up to 320 characters')
        }
        return ctx.db.insert('tasks', { workspaceId: ws._id, request, status: 'pending' })
    },
})

export const get = query({
    args: { id: v.id('tasks') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        const task = await owned(ctx, ws, 'tasks', id)
        return { status: task.status, result: task.result, error: task.error }
    },
})
