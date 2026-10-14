import { v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import { insertNumber } from './lib/numbers'
import { hashToken } from './lib/tokens'
import { creditsFor, dayKey, weekStart } from './lib/usage'
import { channel, keyModel, service, taskResult } from './schema'

// The API your agent (runner/) calls. Every function takes the agent's token, checks it, and stays inside that
// agent's workspace. None of them accepts or returns message text, contact details or readable credentials;
// `dashboard` returns keys locked for this engine only.

async function runnerFor(ctx: QueryCtx, token: string) {
    const tokenHash = await hashToken(token)
    const runner = await ctx.db
        .query('runners')
        .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
        .unique()
    if (!runner) throw new Error('This agent token is invalid or was revoked. Make a new one in Connections.')
    return runner
}

// Everything the agent needs to reply: your settings, agents, numbers and knowledge. Reactive, so edits in
// the dashboard reach the agent right away.
export const config = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const ws = await ctx.db.get('workspace', workspaceId)
        if (!ws) return null
        const [agents, numbers, knowledge] = await Promise.all([
            ctx.db.query('agents').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', workspaceId)).take(500),
            ctx.db.query('numbers').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId)).take(500),
            ctx.db.query('knowledge').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', workspaceId)).take(500),
        ])
        const { userId, notifyDigest, lastDigestDay, ...workspace } = ws
        return { workspace, agents, numbers, knowledge }
    },
})

// Says which budget is used up, if any. `today` comes from the agent so the query never reads the clock.
export const budget = query({
    args: { token: v.string(), today: v.string() },
    handler: async (ctx, { token, today }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const ws = await ctx.db.get('workspace', workspaceId)
        if (!ws?.dailyBudget && !ws?.weeklyBudget) return null
        const rows = await ctx.db
            .query('usage')
            .withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', workspaceId).gte('day', weekStart(today)).lte('day', today))
            .take(5_000)
        const week = rows.reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        const day = rows.filter((r) => r.day === today).reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        if (ws.dailyBudget && day >= ws.dailyBudget) return `Today's usage budget (${ws.dailyBudget} credits) is used up.`
        if (ws.weeklyBudget && week >= ws.weeklyBudget) return `This week's usage budget (${ws.weeklyBudget} credits) is used up.`
        return null
    },
})

// The agent checks in every minute with what it has set up: services (never their keys), the models its AI keys
// can use, and the lines its texting channels answer on
export const heartbeat = mutation({
    args: {
        token: v.string(),
        version: v.string(),
        services: v.array(v.object({ service, label: v.optional(v.string()), error: v.optional(v.string()) })),
        models: v.array(keyModel),
        channels: v.array(channel),
        lines: v.array(v.object({ channel, handle: v.string(), externalId: v.optional(v.string()) })),
        demo: v.boolean(),
        publicKey: v.optional(v.string()),
    },
    handler: async (ctx, { token, publicKey, ...status }) => {
        const runner = await runnerFor(ctx, token)
        if (status.models.length > 500 || status.lines.length > 200 || status.services.length > 20 || status.channels.length > 10) throw new Error('Too much to report')
        if (publicKey !== undefined && (publicKey.length > 1_000 || !/^[A-Za-z0-9+/=]+$/.test(publicKey))) throw new Error('Unreadable public key')
        // A new key pair (the engine's data folder was wiped) can't open values locked for the old one
        if (publicKey && runner.publicKey && publicKey !== runner.publicKey) {
            for (const row of await ctx.db.query('secrets').withIndex('by_runnerId', (q) => q.eq('runnerId', runner._id)).take(100)) await ctx.db.delete('secrets', row._id)
        }
        await ctx.db.patch('runners', runner._id, { ...status, ...(publicKey ? { publicKey } : {}), lastSeenAt: Date.now() })
    },
})

// The keys entered in the dashboard, locked for this engine, plus its public URL (reactive)
export const dashboard = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const runner = await runnerFor(ctx, token)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_runnerId', (q) => q.eq('runnerId', runner._id))
            .take(50)
        return { workspaceId: runner.workspaceId, runnerId: runner._id, publicUrl: runner.publicUrl, secrets: rows.map(({ service, sealed }) => ({ service, sealed })) }
    },
})

const count = v.optional(v.number())
const COUNTS = ['conversations', 'newContacts', 'messagesIn', 'messagesOut', 'handoffs'] as const

// Adds to today's counts for one agent: model usage for the budget, and activity for Analytics
export const record = mutation({
    args: {
        token: v.string(),
        agentId: v.id('agents'),
        usage: v.optional(v.object({ slot: v.string(), model: v.string() })),
        activity: v.optional(v.object({ conversations: count, newContacts: count, messagesIn: count, messagesOut: count, handoffs: count })),
    },
    handler: async (ctx, { token, agentId, usage, activity }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const agent = await ctx.db.get('agents', agentId)
        if (!agent || agent.workspaceId !== workspaceId) return
        const day = dayKey(Date.now())
        if (usage) {
            const row = await ctx.db
                .query('usage')
                .withIndex('by_agent_and_slot_and_model_and_day', (q) => q.eq('agentId', agentId).eq('slot', usage.slot).eq('model', usage.model).eq('day', day))
                .unique()
            if (row) await ctx.db.patch('usage', row._id, { count: row.count + 1 })
            else await ctx.db.insert('usage', { workspaceId, agentId, ...usage, day, count: 1 })
        }
        if (activity) {
            for (const n of Object.values(activity)) if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 1000)) throw new Error('Counts must be small whole numbers')
            const row = await ctx.db
                .query('activity')
                .withIndex('by_agent_and_day', (q) => q.eq('agentId', agentId).eq('day', day))
                .unique()
            const next = Object.fromEntries(COUNTS.map((k) => [k, (row?.[k] ?? 0) + (activity[k] ?? 0)])) as Record<(typeof COUNTS)[number], number>
            if (row) await ctx.db.patch('activity', row._id, next)
            else await ctx.db.insert('activity', { workspaceId, agentId, day, ...next })
        }
    },
})

// Requests from the dashboard waiting for this agent (reactive)
export const tasks = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const rows = await ctx.db
            .query('tasks')
            .withIndex('by_workspace_and_status', (q) => q.eq('workspaceId', workspaceId).eq('status', 'pending'))
            .take(20)
        return rows.map(({ _id, request }) => ({ _id, request }))
    },
})

// The agent's answer to a task. A bought or reused Twilio number is added to your numbers here.
export const finishTask = mutation({
    args: { token: v.string(), id: v.id('tasks'), result: v.optional(taskResult), error: v.optional(v.string()) },
    handler: async (ctx, { token, id, result, error }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const task = await ctx.db.get('tasks', id)
        // With several agents, the first one to answer closes the request
        if (!task || task.workspaceId !== workspaceId || task.status !== 'pending') return
        const { request } = task
        if (!error && result && 'sid' in result && (request.kind === 'twilioBuy' || request.kind === 'twilioUse')) {
            try {
                await insertNumber(ctx, { workspaceId, handle: result.phoneNumber, channel: 'twilio', externalId: result.sid, agentId: request.agentId })
            } catch (e) {
                error = e instanceof Error ? e.message : String(e)
            }
        }
        await ctx.db.patch('tasks', id, error ? { status: 'failed', error: error.slice(0, 300) } : { status: 'done', result })
    },
})
