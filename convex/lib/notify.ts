import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

type Kind = Doc<'notifications'>['kind']

// Which workspace toggle governs each kind; new contacts and handoffs are on unless turned off
const enabled = (ws: Doc<'workspace'>, kind: Kind) =>
    kind === 'new_contact' ? ws.notifyNewContact !== false : kind === 'handoff' ? ws.notifyHandoff !== false : ws.notifyDigest === true

// Adds an inbox notification and, when the workspace has connected Resend and set an email, emails it too
export async function notify(ctx: MutationCtx, workspaceId: Id<'workspace'>, kind: Kind, title: string, body: string, conversationId?: Id<'conversations'>) {
    const ws = await ctx.db.get('workspace', workspaceId)
    if (!ws || !enabled(ws, kind)) return
    await ctx.db.insert('notifications', { workspaceId, kind, title, body, at: Date.now(), read: false, conversationId })
    const resend = await ctx.db
        .query('connections')
        .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', workspaceId).eq('provider', 'resend'))
        .first()
    if (ws.ownerEmail && resend) await ctx.scheduler.runAfter(0, internal.notifications.email, { connectionId: resend._id, to: ws.ownerEmail, subject: title, text: body })
}
