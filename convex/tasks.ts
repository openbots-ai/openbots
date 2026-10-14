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
        if (!online.length) throw new Error('Add an agent in Connections first')
        if (request.kind !== 'recheck' && !online.some((r) => r.services?.some((s) => s.service === 'twilio' && !s.error))) throw new Error('Add your Twilio account to your engine first (see Connections)')
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
