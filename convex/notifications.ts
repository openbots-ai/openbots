import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { currentWorkspace, owned, requireWorkspace } from './lib/access'
import { decrypt } from './lib/crypto'
import { notify } from './lib/notify'
import { sendEmail, type Credentials } from './lib/providers'

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await currentWorkspace(ctx)
        if (!ws) return []
        return ctx.db
            .query('notifications')
            .withIndex('by_workspace_and_at', (q) => q.eq('workspaceId', ws._id))
            .order('desc')
            .take(50)
    },
})

// Capped so the badge stays cheap; the UI shows 99+ past that
export const unreadCount = query({
    args: {},
    handler: async (ctx) => {
        const ws = await currentWorkspace(ctx)
        if (!ws) return 0
        return (
            await ctx.db
                .query('notifications')
                .withIndex('by_workspace_and_read_and_at', (q) => q.eq('workspaceId', ws._id).eq('read', false))
                .take(100)
        ).length
    },
})

export const markRead = mutation({
    args: { id: v.id('notifications') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'notifications', id)
        await ctx.db.patch('notifications', id, { read: true })
    },
})

export const markAllRead = mutation({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const unread = await ctx.db
            .query('notifications')
            .withIndex('by_workspace_and_read_and_at', (q) => q.eq('workspaceId', ws._id).eq('read', false))
            .take(500)
        for (const n of unread) await ctx.db.patch('notifications', n._id, { read: true })
    },
})

// Sends one notification email through the workspace's own Resend account
export const email = internalAction({
    args: { connectionId: v.id('connections'), to: v.string(), subject: v.string(), text: v.string() },
    handler: async (ctx, { connectionId, to, subject, text }) => {
        const secret = await ctx.runQuery(internal.notifications.resendSecret, { connectionId })
        if (!secret) return
        try {
            await sendEmail(await decrypt<Credentials['resend']>(secret), to, subject, text)
        } catch (e) {
            await ctx.runMutation(internal.connections.setStatus, { id: connectionId, error: e instanceof Error ? e.message : String(e) })
        }
    },
})

export const resendSecret = internalQuery({
    args: { connectionId: v.id('connections') },
    handler: async (ctx, { connectionId }) => (await ctx.db.get('connections', connectionId))?.secret ?? null,
})

const DAY = 86_400_000

// Hourly: walks the workspaces a page at a time and sends each one's digest at 8am in its timezone
export const digest = internalMutation({
    args: { cursor: v.optional(v.union(v.string(), v.null())) },
    handler: async (ctx, { cursor }) => {
        const page = await ctx.db.query('workspace').paginate({ numItems: 100, cursor: cursor ?? null })
        for (const ws of page.page) if (ws.notifyDigest) await ctx.scheduler.runAfter(0, internal.notifications.digestOne, { workspaceId: ws._id })
        if (!page.isDone) await ctx.scheduler.runAfter(0, internal.notifications.digest, { cursor: page.continueCursor })
    },
})

export const digestOne = internalMutation({
    args: { workspaceId: v.id('workspace') },
    handler: async (ctx, { workspaceId }) => {
        const ws = await ctx.db.get('workspace', workspaceId)
        if (!ws?.notifyDigest) return
        const now = Date.now()
        const timeZone = ws.timezone ?? 'UTC'
        let hour: number
        let today: string
        try {
            hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now))
            today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
        } catch {
            hour = new Date(now).getUTCHours()
            today = new Date(now).toISOString().slice(0, 10)
        }
        if (hour !== 8 || ws.lastDigestDay === today) return
        await ctx.db.patch('workspace', ws._id, { lastDigestDay: today })

        const active = await ctx.db
            .query('conversations')
            .withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', ws._id).gte('lastAt', now - DAY))
            .take(1000)
        const waiting = active.filter((c) => c.needsYou).length
        const body = active.length
            ? `${active.length} conversation${active.length === 1 ? '' : 's'} in the last 24 hours${waiting ? `, ${waiting} waiting on you` : ''}.\n\n${active
                  .slice(0, 10)
                  .map((c) => `• ${c.lastMessage}`)
                  .join('\n')}`
            : 'No conversations in the last 24 hours.'
        await notify(ctx, ws._id, 'digest', 'Your daily digest', body)
    },
})
