import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const get = query({
    args: {},
    handler: (ctx) => ctx.db.query('workspace').first(),
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string() },
    handler: async (ctx, args) => {
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')
        const ws = await ctx.db.query('workspace').first()
        if (ws) await ctx.db.patch(ws._id, { name, ownerName })
        else await ctx.db.insert('workspace', { name, ownerName })
    },
})
