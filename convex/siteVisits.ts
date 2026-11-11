import { v } from 'convex/values'
import { env, internalMutation, query } from './_generated/server'
import { isSiteOwner, PUBLIC_PATHS } from './lib/visits'
import { dayKey } from './lib/usage'

const path = v.union(...PUBLIC_PATHS.map((p) => v.literal(p)))

// One visit to a public page, from the /visit endpoint (convex/http.ts). Keeps only a daily count per page: no IP,
// no ID, nothing that says who visited. `newVisitor` is the browser saying it hadn't been here yet today (UTC).
export const record = internalMutation({
    args: { path, newVisitor: v.boolean() },
    handler: async (ctx, { path, newVisitor }) => {
        const day = dayKey(Date.now())
        const row = await ctx.db
            .query('siteVisits')
            .withIndex('by_day_and_path', (q) => q.eq('day', day).eq('path', path))
            .unique()
        const visitors = newVisitor ? 1 : 0
        if (row) await ctx.db.patch('siteVisits', row._id, { views: row.views + 1, visitors: row.visitors + visitors })
        else await ctx.db.insert('siteVisits', { day, path, views: 1, visitors })
        return null
    },
})

// The daily counts since `since` (a UTC day), only for the site's owner (SITE_OWNER); everyone else gets null
export const summary = query({
    args: { since: v.string() },
    handler: async (ctx, { since }) => {
        if (!isSiteOwner(await ctx.auth.getUserIdentity(), env.SITE_OWNER)) return null
        const rows = await ctx.db
            .query('siteVisits')
            .withIndex('by_day_and_path', (q) => q.gte('day', since))
            .take(2000)
        return rows.map(({ day, path, views, visitors }) => ({ day, path, views, visitors }))
    },
})
