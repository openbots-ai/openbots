import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export async function deleteConversation(ctx: MutationCtx, id: Id<'conversations'>) {
    const conversation = await ctx.db.get('conversations', id)
    if (!conversation) return
    for await (const m of ctx.db.query('messages').withIndex('by_conversation', (q) => q.eq('conversationId', id))) await ctx.db.delete('messages', m._id)
    for await (const n of ctx.db.query('notifications').withIndex('by_workspace_and_at', (q) => q.eq('workspaceId', conversation.workspaceId)))
        if (n.conversationId === id) await ctx.db.patch('notifications', n._id, { conversationId: undefined })
    await ctx.db.delete('conversations', id)
}
