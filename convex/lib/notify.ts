import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { env, type MutationCtx } from '../_generated/server'

type Kind = Doc<'notifications'>['kind']

// Which workspace toggle governs each kind; new contacts and handoffs are on unless turned off
const enabled = (ws: Doc<'workspace'> | null, kind: Kind) =>
    kind === 'new_contact' ? ws?.notifyNewContact !== false : kind === 'handoff' ? ws?.notifyHandoff !== false : ws?.notifyDigest === true

// Adds an inbox notification and, when email is set up, emails it to the owner
export async function notify(ctx: MutationCtx, kind: Kind, title: string, body: string, conversationId?: Id<'conversations'>) {
    const ws = await ctx.db.query('workspace').first()
    if (!enabled(ws, kind)) return
    await ctx.db.insert('notifications', { kind, title, body, at: Date.now(), read: false, conversationId })
    if (ws?.ownerEmail && env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL) {
        await ctx.scheduler.runAfter(0, internal.notifications.email, { to: ws.ownerEmail, subject: title, text: body })
    }
}
