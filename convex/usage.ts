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

// Headline counts for Analytics. `since` comes from the client so the query never reads the clock.
// Each count is capped (shown as e.g. "1k+") to keep the read bounded.
export const overview = query({
    args: { since: v.number() },
    handler: async (ctx, { since }) => {
        const CAP = 1_000
        const [active, waiting, contacts, newContacts] = await Promise.all([
            ctx.db.query('conversations').withIndex('by_lastAt', (q) => q.gte('lastAt', since)).take(CAP + 1),
            ctx.db.query('conversations').withIndex('by_needsYou_and_lastAt', (q) => q.eq('needsYou', true)).take(CAP + 1),
            ctx.db.query('contacts').take(CAP + 1),
            ctx.db.query('contacts').withIndex('by_creation_time', (q) => q.gte('_creationTime', since)).take(CAP + 1),
        ])
        const count = (rows: unknown[]) => ({ n: Math.min(rows.length, CAP), more: rows.length > CAP })
        return { active: count(active), waiting: count(waiting), contacts: count(contacts), newContacts: count(newContacts) }
    },
})
