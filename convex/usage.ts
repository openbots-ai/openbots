import { v } from 'convex/values'
import { query } from './_generated/server'
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
