import { internalMutation } from './_generated/server'
import { handleKey } from './lib/handles'

// One-off for deployments created before handles had lookup keys: npx convex run migrations:backfillKeys
export const backfillKeys = internalMutation({
    args: {},
    handler: async (ctx) => {
        let count = 0
        for await (const n of ctx.db.query('numbers')) {
            const key = handleKey(n.handle)
            if (!key || n.key === key) continue
            await ctx.db.patch('numbers', n._id, { key })
            count++
        }
        for await (const c of ctx.db.query('contacts')) {
            const key = handleKey(c.handle)
            if (!key || c.key === key) continue
            await ctx.db.patch('contacts', c._id, { key })
            count++
        }
        return `keyed ${count} handles`
    },
})
