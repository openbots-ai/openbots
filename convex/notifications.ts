import { v } from 'convex/values'
import { env, internalAction, internalMutation, mutation, query } from './_generated/server'
import { notify } from './lib/notify'

export const list = query({
    args: {},
    handler: (ctx) => ctx.db.query('notifications').withIndex('by_at').order('desc').take(50),
})

// Capped so the badge stays cheap; the UI shows 99+ past that
export const unreadCount = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('notifications').withIndex('by_read_and_at', (q) => q.eq('read', false)).take(100)).length,
})

export const markRead = mutation({
    args: { id: v.id('notifications') },
    handler: (ctx, { id }) => ctx.db.patch('notifications', id, { read: true }),
})

export const markAllRead = mutation({
    args: {},
    handler: async (ctx) => {
        const unread = await ctx.db.query('notifications').withIndex('by_read_and_at', (q) => q.eq('read', false)).take(500)
        for (const n of unread) await ctx.db.patch('notifications', n._id, { read: true })
    },
})

export const clear = mutation({
    args: {},
    handler: async (ctx) => {
        for (const n of await ctx.db.query('notifications').take(500)) await ctx.db.delete('notifications', n._id)
    },
})

// Sends one notification email through Resend
export const email = internalAction({
    args: { to: v.string(), subject: v.string(), text: v.string() },
    handler: async (_ctx, { to, subject, text }) => {
        if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL) return
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
            body: JSON.stringify({ from: env.NOTIFY_FROM_EMAIL, to, subject, text }),
        })
        if (!res.ok) console.error(`Resend answered ${res.status}: ${await res.text()}`)
    },
})

const DAY = 86_400_000

// Runs hourly; sends the digest once a day, at 8am in the workspace's timezone
export const digest = internalMutation({
    args: {},
    handler: async (ctx) => {
        const ws = await ctx.db.query('workspace').first()
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

        const active = await ctx.db.query('conversations').withIndex('by_lastAt', (q) => q.gte('lastAt', now - DAY)).take(1000)
        const waiting = active.filter((c) => c.needsYou).length
        const body = active.length
            ? `${active.length} conversation${active.length === 1 ? '' : 's'} in the last 24 hours${waiting ? `, ${waiting} waiting on you` : ''}.\n\n${active
                  .slice(0, 10)
                  .map((c) => `• ${c.lastMessage}`)
                  .join('\n')}`
            : 'No conversations in the last 24 hours.'
        await notify(ctx, 'digest', 'Your daily digest', body)
    },
})
