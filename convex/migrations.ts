import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'

// Tables from before messages, contacts and credentials moved onto your agent. They're no longer in the schema,
// so they're named loosely.
const LEGACY = ['messages', 'conversations', 'contacts', 'notifications', 'connections'] as const
type Loose = { query: (t: string) => { take: (n: number) => Promise<{ _id: string }[]> }; delete: (id: string) => Promise<void> }

// Deletes message history, contacts, notifications and stored credentials left in Convex, and the workspace fields
// that went with them. Runs in batches until nothing is left: npx convex run migrations:purgeLegacy
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
        for (const ws of await ctx.db.query('workspace').take(1000)) {
            if (ws.notifyDigest !== undefined || ws.lastDigestDay !== undefined) await ctx.db.patch('workspace', ws._id, { notifyDigest: undefined, lastDigestDay: undefined })
        }
        return `deleted ${deleted}, done`
    },
})
