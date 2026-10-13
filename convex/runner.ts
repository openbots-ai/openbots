import { v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import { hashToken } from './lib/tokens'
import { creditsFor, dayKey, weekStart } from './lib/usage'

// The API your agent (runner/) calls. Every function takes the agent's token and checks it, and none of
// them accepts or returns message text, contact details or provider keys.

async function runnerFor(ctx: QueryCtx, token: string) {
    const tokenHash = await hashToken(token)
    const runner = await ctx.db
        .query('runners')
        .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
        .unique()
    if (!runner) throw new Error('This agent token is invalid or was revoked. Make a new one in Settings → Agent.')
    return runner
}

// Everything the agent needs to reply: your settings, agents, numbers and knowledge. Reactive, so edits in
// the dashboard reach the agent right away.
export const config = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        await runnerFor(ctx, token)
        const [ws, agents, numbers, knowledge] = await Promise.all([
            ctx.db.query('workspace').first(),
            ctx.db.query('agents').take(500),
            ctx.db.query('numbers').take(500),
            ctx.db.query('knowledge').take(500),
        ])
        if (!ws) return null
        const { ownerId, ownerEmail, notifyDigest, lastDigestDay, ...workspace } = ws
        return { workspace, agents, numbers, knowledge }
    },
})

// Says which budget is used up, if any. `today` comes from the agent so the query never reads the clock.
export const budget = query({
    args: { token: v.string(), today: v.string() },
    handler: async (ctx, { token, today }) => {
        await runnerFor(ctx, token)
        const ws = await ctx.db.query('workspace').first()
        if (!ws?.dailyBudget && !ws?.weeklyBudget) return null
        const rows = await ctx.db
            .query('usage')
            .withIndex('by_day', (q) => q.gte('day', weekStart(today)).lte('day', today))
            .take(5_000)
        const week = rows.reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        const day = rows.filter((r) => r.day === today).reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        if (ws.dailyBudget && day >= ws.dailyBudget) return `Today's usage budget (${ws.dailyBudget} credits) is used up.`
        if (ws.weeklyBudget && week >= ws.weeklyBudget) return `This week's usage budget (${ws.weeklyBudget} credits) is used up.`
        return null
    },
})

// The agent checks in every minute, for the online dot in Settings
export const heartbeat = mutation({
    args: { token: v.string(), version: v.string(), transport: v.string(), providers: v.record(v.string(), v.boolean()), demo: v.boolean() },
    handler: async (ctx, { token, ...status }) => {
        const runner = await runnerFor(ctx, token)
        await ctx.db.patch('runners', runner._id, { ...status, lastSeenAt: Date.now() })
    },
})

const COUNTS = ['conversations', 'newContacts', 'messagesIn', 'messagesOut', 'handoffs'] as const
const count = v.optional(v.number())
const activityArgs = v.object({ conversations: count, newContacts: count, messagesIn: count, messagesOut: count, handoffs: count })

// Adds to today's counts for one agent: model usage for the budget, and activity for Analytics
export const record = mutation({
    args: {
        token: v.string(),
        agentId: v.id('agents'),
        usage: v.optional(v.object({ slot: v.string(), model: v.string() })),
        activity: v.optional(activityArgs),
    },
    handler: async (ctx, { token, agentId, usage, activity }) => {
        await runnerFor(ctx, token)
        if (!(await ctx.db.get('agents', agentId))) return
        const day = dayKey(Date.now())
        if (usage) {
            const row = await ctx.db
                .query('usage')
                .withIndex('by_agent_and_slot_and_model_and_day', (q) => q.eq('agentId', agentId).eq('slot', usage.slot).eq('model', usage.model).eq('day', day))
                .unique()
            if (row) await ctx.db.patch('usage', row._id, { count: row.count + 1 })
            else await ctx.db.insert('usage', { agentId, ...usage, day, count: 1 })
        }
        if (activity) {
            for (const n of Object.values(activity)) if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 1000)) throw new Error('Counts must be small whole numbers')
            const row = await ctx.db
                .query('activity')
                .withIndex('by_agent_and_day', (q) => q.eq('agentId', agentId).eq('day', day))
                .unique()
            const next = Object.fromEntries(COUNTS.map((k) => [k, (row?.[k] ?? 0) + (activity[k] ?? 0)])) as Record<(typeof COUNTS)[number], number>
            if (row) await ctx.db.patch('activity', row._id, next)
            else await ctx.db.insert('activity', { agentId, day, ...next })
        }
    },
})
