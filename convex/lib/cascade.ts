import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export async function deleteConversation(ctx: MutationCtx, id: Id<'conversations'>) {
    const messages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', id))
        .collect()
    for (const m of messages) await ctx.db.delete(m._id)
    await ctx.db.delete(id)
}
