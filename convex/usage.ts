import { v } from 'convex/values'
import { query } from './_generated/server'
import { requireWorkspace } from './lib/access'
import { addDays } from './lib/usage'

// Eight weeks of usage ending on `today` (the client's date, passed in so the query never reads the clock)
export const summary = query({
    args: { today: v.string() },
    handler: async (ctx, { today }) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('usage')
            .withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', ws._id).gte('day', addDays(today, -55)).lte('day', today))
            .take(20_000)
        return rows.map(({ agentId, slot, model, day, count }) => ({ agentId, slot, model, day, count }))
    },
})

// Headline counts for Analytics. `since` comes from the client so the query never reads the clock.
// Each count is capped (shown as e.g. "1k+") to keep the read bounded.
export const overview = query({
    args: { since: v.number() },
    handler: async (ctx, { since }) => {
        const ws = await requireWorkspace(ctx)
        const CAP = 1_000
        const [active, waiting, contacts] = await Promise.all([
            ctx.db
                .query('conversations')
                .withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', ws._id).gte('lastAt', since))
                .take(CAP + 1),
            ctx.db
                .query('conversations')
                .withIndex('by_workspace_and_needsYou_and_lastAt', (q) => q.eq('workspaceId', ws._id).eq('needsYou', true))
                .take(CAP + 1),
            ctx.db
                .query('contacts')
                .withIndex('by_workspace_and_name', (q) => q.eq('workspaceId', ws._id))
                .take(CAP + 1),
        ])
        const count = (rows: unknown[]) => ({ n: Math.min(rows.length, CAP), more: rows.length > CAP })
        return { active: count(active), waiting: count(waiting), contacts: count(contacts), newContacts: count(contacts.filter((c) => c._creationTime >= since)) }
    },
})
