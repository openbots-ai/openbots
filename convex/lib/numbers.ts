import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { handleKey, handleKind } from './handles'

export type NewNumber = { workspaceId: Id<'workspace'>; handle: string; agentId?: Id<'agents'>; channel: Doc<'numbers'>['channel']; externalId?: string }

// Adds one of your numbers, refusing duplicates and a Twilio "number" that isn't a phone
export async function insertNumber(ctx: MutationCtx, n: NewNumber) {
    const kind = handleKind(n.handle)
    const key = handleKey(n.handle)
    if (!kind || !key) throw new Error('Enter a phone number or an email address')
    if (n.channel === 'twilio' && kind !== 'phone') throw new Error('Twilio numbers are phone numbers')
    const twin = await ctx.db
        .query('numbers')
        .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', n.workspaceId).eq('key', key))
        .first()
    if (twin) throw new Error('That number is already added')
    return ctx.db.insert('numbers', { ...n, handle: n.handle.trim(), key, kind })
}
