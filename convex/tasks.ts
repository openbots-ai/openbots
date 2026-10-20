import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { handleKey } from './lib/handles'
import { TASK_CANCELLED, TASK_EXPIRED, TASK_PENDING_MS, TASK_RUNNING_MS } from './lib/tasks'
import { taskRequest } from './schema'

// Asks your agents to do something only they can, because only they have the credentials: check their keys again,
// or search, buy or reuse a Twilio number. The dashboard then watches the task (get) until an agent writes back.
// One engine claims it (runner.claimTask); if none does in time, it expires (see lib/tasks.ts).
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
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', handleKey(request.from) ?? ''))
                .unique()
            if (!from || from.channel !== 'twilio') throw new Error('Send from one of your Twilio numbers in Numbers')
            const digits = request.to.replace(/\D/g, '')
            if (digits.length < 10 || digits.length > 15) throw new Error('Enter the phone number to text, with its area code')
            if (!request.body.trim() || request.body.length > 320) throw new Error('Write a message of up to 320 characters')
        }
        const id = await ctx.db.insert('tasks', { workspaceId: ws._id, request, status: 'pending' })
        await ctx.scheduler.runAfter(TASK_PENDING_MS, internal.tasks.expire, { id })
        return id
    },
})

// Closes a request nobody claimed in time, or one claimed but not answered in time (the engine crashed)
export const expire = internalMutation({
    args: { id: v.id('tasks') },
    handler: async (ctx, { id }) => {
        const task = await ctx.db.get('tasks', id)
        if (!task) return
        if (task.status === 'pending') return void (await ctx.db.patch('tasks', id, { status: 'failed', error: TASK_EXPIRED }))
        if (task.status !== 'running') return
        const left = task._creationTime + TASK_RUNNING_MS - Date.now()
        // Within a second counts as due, so a fraction of a millisecond left never reschedules forever
        if (left > 1000) await ctx.scheduler.runAfter(left, internal.tasks.expire, { id })
        else await ctx.db.patch('tasks', id, { status: 'failed', error: TASK_EXPIRED })
    },
})

// The dashboard stops waiting: withdraws the request unless an engine already took it. True if it was withdrawn.
export const cancel = mutation({
    args: { id: v.id('tasks') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        const task = await owned(ctx, ws, 'tasks', id)
        if (task.status !== 'pending') return false
        await ctx.db.patch('tasks', id, { status: 'failed', error: TASK_CANCELLED })
        return true
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
