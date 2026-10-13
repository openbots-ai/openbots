import { internal } from './_generated/api'
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
        return `keyed ${count} handles`
    },
})

// Tables from before messages moved onto your agent. They're no longer in the schema, so they're named loosely.
const LEGACY = ['messages', 'conversations', 'contacts', 'notifications'] as const
type Loose = { query: (t: string) => { take: (n: number) => Promise<{ _id: string }[]> }; delete: (id: string) => Promise<void> }

// Deletes message history, contacts and notifications left in Convex, and the workspace fields that went
// with them. Runs in batches until nothing is left: npx convex run migrations:purgeLegacy
export const purgeLegacy = internalMutation({
    args: {},
    handler: async (ctx) => {
        const db = ctx.db as unknown as Loose
        let deleted = 0
        for (const table of LEGACY) {
            for (const doc of await db.query(table).take(500 - deleted)) {
                await db.delete(doc._id)
                deleted++
            }
            if (deleted >= 500) break
        }
        if (deleted >= 500) {
            await ctx.scheduler.runAfter(0, internal.migrations.purgeLegacy, {})
            return `deleted ${deleted}, continuing`
        }
        const ws = await ctx.db.query('workspace').first()
        if (ws) await ctx.db.patch('workspace', ws._id, { ownerEmail: undefined, notifyDigest: undefined, lastDigestDay: undefined })
        return `deleted ${deleted}, done`
    },
})
