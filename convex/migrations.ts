import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { env, internalMutation } from './_generated/server'
import { handleKey } from './lib/handles'

// Tables from before messages, contacts and credentials moved onto your engine. They're no longer in the schema,
// so they're named loosely.
const LEGACY = ['messages', 'conversations', 'contacts', 'notifications', 'connections'] as const
type Loose = { query: (t: string) => { take: (n: number) => Promise<{ _id: string }[]> }; delete: (id: string) => Promise<void> }

type LegacyWorkspace = { _id: Id<'workspace'>; userId?: string; ownerId?: string }
const WORKSPACE_TABLES = ['agents', 'numbers', 'knowledge', 'usage', 'activity', 'runners', 'tasks'] as const

// Brings rows from before sign-in and agent channels up to the current schema: a workspace still owned through
// `ownerId` moves to `userId` (replacing an empty workspace made for that user at sign-up), retired workspace
// settings go, and numbers without a channel become `relay`. npx convex run migrations:upgradeLegacy
export const upgradeLegacy = internalMutation({
    args: {},
    handler: async (ctx) => {
        const done: string[] = []
        const removed = new Set<string>()
        for (const ws of (await ctx.db.query('workspace').take(1000)) as unknown as LegacyWorkspace[]) {
            if (removed.has(ws._id)) continue
            const patch: Record<string, undefined | string> = { ownerId: undefined, readReceipts: undefined, typingIndicator: undefined }
            if (!ws.userId) {
                if (!ws.ownerId) throw new Error(`Workspace ${ws._id} has no owner; delete it or set userId by hand`)
                const fresh = await ctx.db
                    .query('workspace')
                    .withIndex('by_user', (q) => q.eq('userId', ws.ownerId!))
                    .unique()
                if (fresh) {
                    for (const table of WORKSPACE_TABLES) {
                        const used = await (ctx.db as unknown as Loose).query(table).take(1000)
                        if (used.some((doc) => (doc as unknown as { workspaceId: string }).workspaceId === fresh._id))
                            throw new Error(`User ${ws.ownerId} has two workspaces with data (${ws._id}, ${fresh._id}); merge them by hand`)
                    }
                    await ctx.db.delete('workspace', fresh._id)
                    removed.add(fresh._id)
                    done.push(`removed empty workspace ${fresh._id}`)
                }
                patch.userId = ws.ownerId
                done.push(`workspace ${ws._id} now belongs to ${ws.ownerId}`)
            }
            await ctx.db.patch('workspace', ws._id, patch as never)
        }
        let numbers = 0
        for (const n of await ctx.db.query('numbers').take(5000)) {
            if (!n.channel) {
                await ctx.db.patch('numbers', n._id, { channel: 'relay' })
                numbers++
            }
        }
        done.push(`${numbers} numbers set to relay`)
        return done.join('; ')
    },
})

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

// Keys your numbers again after handleKey started keeping country codes (+47 9xxxxxxx no longer matches +1 479xxxxxxx,
// and US numbers gained their leading 1). npx convex run migrations:rekeyHandles
export const rekeyHandles = internalMutation({
    args: {},
    handler: async (ctx) => {
        let changed = 0
        for (const n of await ctx.db.query('numbers').take(5000)) {
            const key = handleKey(n.handle)
            if (key && key !== n.key) {
                await ctx.db.patch('numbers', n._id, { key })
                changed++
            }
        }
        return `${changed} numbers keyed again`
    },
})

// Hands a workspace made under Convex Auth (email and password) to that person's Clerk account. Sign in with Clerk
// once, copy your user id (user_…) from the Clerk dashboard, then:
//   npx convex run migrations:moveToClerk '{"email":"you@example.com","clerkUserId":"user_…"}'
// If that Clerk account already set up a workspace, add "replace":true to delete it and everything in it first.
export const moveToClerk = internalMutation({
    args: { email: v.string(), clerkUserId: v.string(), replace: v.optional(v.boolean()) },
    handler: async (ctx, { email, clerkUserId, replace }) => {
        const issuer = env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/+$/, '')
        if (!issuer) throw new Error('Set CLERK_JWT_ISSUER_DOMAIN first')
        // The old Convex Auth table, no longer in the schema
        const users = (await (ctx.db as unknown as Loose).query('users').take(1000)) as unknown as { _id: string; email?: string }[]
        const user = users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
        if (!user) throw new Error(`No Convex Auth account for ${email}`)
        const ws = await ctx.db
            .query('workspace')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique()
        if (!ws) throw new Error(`${email} has no workspace`)
        const tokenIdentifier = `${issuer}|${clerkUserId}`
        const fresh = await ctx.db
            .query('workspace')
            .withIndex('by_user', (q) => q.eq('userId', tokenIdentifier))
            .unique()
        let removed = 0
        if (fresh) {
            if (!replace) throw new Error(`That Clerk account already set up workspace ${fresh._id}; pass "replace":true to delete it`)
            const db = ctx.db as unknown as Loose
            for (const table of [...WORKSPACE_TABLES, 'secrets', 'allowedPeople', 'ignoredSenders', 'ownerCodes']) {
                for (const doc of await db.query(table).take(1000)) {
                    if ((doc as unknown as { workspaceId: string }).workspaceId !== fresh._id) continue
                    await db.delete(doc._id)
                    removed++
                }
            }
            await ctx.db.delete('workspace', fresh._id)
        }
        await ctx.db.patch('workspace', ws._id, { userId: tokenIdentifier })
        return `workspace ${ws._id} now belongs to ${clerkUserId}${fresh ? ` (deleted workspace ${fresh._id} and ${removed} rows in it)` : ''}`
    },
})
