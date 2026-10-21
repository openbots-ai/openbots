import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { handleKey, handleKind } from './lib/handles'
import { IGNORED_KEPT, MAX_ALLOWED } from './lib/owner'

// Settings → Allowed people: the only people besides you that your agents answer. The engine ignores texts from
// everyone else without reading them into a model, storing them or replying, so strangers can't spend your AI keys
// or texting credit.

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('allowedPeople')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id))
            .take(MAX_ALLOWED)
        return rows.map(({ _id, name, handle }) => ({ _id, name, handle })).sort((a, b) => a.name.localeCompare(b.name))
    },
})

export const add = mutation({
    args: { name: v.string(), handle: v.string() },
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        const name = args.name.trim()
        const handle = args.handle.trim()
        const key = handleKey(handle)
        if (!name) throw new Error('Give them a name')
        if (name.length > 80) throw new Error('That name is too long')
        if (!key || !handleKind(handle)) throw new Error('Enter a phone number with its area code, or an Apple ID email')
        const [twin, ours, count] = await Promise.all([
            ctx.db
                .query('allowedPeople')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', key))
                .first(),
            ctx.db
                .query('numbers')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', key))
                .first(),
            ctx.db
                .query('allowedPeople')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id))
                .take(MAX_ALLOWED),
        ])
        if (twin) throw new Error(`${twin.name} already has that number`)
        if (ours) throw new Error('That’s one of your agents’ numbers')
        if (count.length >= MAX_ALLOWED) throw new Error(`You can allow up to ${MAX_ALLOWED} people`)
        const id = await ctx.db.insert('allowedPeople', { workspaceId: ws._id, name, handle, key })
        // No longer a stranger
        const ignored = await ctx.db
            .query('ignoredSenders')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', key))
            .first()
        if (ignored) await ctx.db.delete('ignoredSenders', ignored._id)
        return id
    },
})

// They're ignored from their next text on
export const remove = mutation({
    args: { id: v.id('allowedPeople') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'allowedPeople', id)
        await ctx.db.delete('allowedPeople', id)
        return null
    },
})

// How many texts were ignored on `today` (the client's date, so the query never reads the clock), and the numbers of
// the last few people who sent them. Never what they wrote: that never leaves their phone and your engine.
export const ignored = query({
    args: { today: v.string() },
    handler: async (ctx, { today }) => {
        const ws = await requireWorkspace(ctx)
        const [days, recent] = await Promise.all([
            ctx.db
                .query('activity')
                .withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', ws._id).eq('day', today))
                .take(500),
            ctx.db
                .query('ignoredSenders')
                .withIndex('by_workspace_and_at', (q) => q.eq('workspaceId', ws._id))
                .order('desc')
                .take(IGNORED_KEPT),
        ])
        return { today: days.reduce((s, r) => s + (r.ignored ?? 0), 0), recent: recent.map(({ _id, handle, at }) => ({ _id, handle, at })) }
    },
})

// Takes one number off the ignored list without allowing it
export const dismiss = mutation({
    args: { id: v.id('ignoredSenders') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'ignoredSenders', id)
        await ctx.db.delete('ignoredSenders', id)
        return null
    },
})
