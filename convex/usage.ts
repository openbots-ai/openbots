import { v } from 'convex/values'
import { query } from './lib/auth'
import { addDays } from './lib/usage'

// Eight weeks of usage ending on `today` (the client's date, passed in so the query never reads the clock)
export const summary = query({
    args: { today: v.string() },
    handler: async (ctx, { today }) => {
        const rows = await ctx.db
            .query('usage')
            .withIndex('by_day', (q) => q.gte('day', addDays(today, -55)).lte('day', today))
            .take(20_000)
        return rows.map(({ agentId, slot, model, day, count }) => ({ agentId, slot, model, day, count }))
    },
})

// Analytics headline counts from your agents' daily totals (no names, numbers or messages), from `since` (a day key)
export const activity = query({
    args: { since: v.string() },
    handler: async (ctx, { since }) => {
        const rows = await ctx.db
            .query('activity')
            .withIndex('by_day', (q) => q.gte('day', since))
            .take(10_000)
        const total = (k: 'conversations' | 'newContacts' | 'messagesIn' | 'messagesOut' | 'handoffs') => rows.reduce((s, r) => s + r[k], 0)
        return { conversations: total('conversations'), newContacts: total('newContacts'), messagesIn: total('messagesIn'), messagesOut: total('messagesOut'), handoffs: total('handoffs') }
    },
})
