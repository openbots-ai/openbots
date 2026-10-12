import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { currentWorkspace, owned, requireWorkspace } from './lib/access'
import { deleteConversation } from './lib/cascade'
import { queueDelivery, scheduleReply } from './lib/inbox'

export const list = query({
    args: { since: v.optional(v.number()), needsYou: v.optional(v.boolean()) },
    handler: async (ctx, { since, needsYou }) => {
        const ws = await requireWorkspace(ctx)
        const rows = needsYou
            ? await ctx.db
                  .query('conversations')
                  .withIndex('by_workspace_and_needsYou_and_lastAt', (q) => q.eq('workspaceId', ws._id).eq('needsYou', true))
                  .order('desc')
                  .take(300)
            : await ctx.db
                  .query('conversations')
                  .withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', ws._id).gte('lastAt', since ?? 0))
                  .order('desc')
                  .take(300)
        return Promise.all(
            rows.map(async (c) => {
                const [contact, agent] = await Promise.all([ctx.db.get('contacts', c.contactId), ctx.db.get('agents', c.agentId)])
                return { ...c, contactName: contact?.name ?? 'Unknown', contactHandle: contact?.handle ?? '', agentName: agent?.name ?? 'Unknown' }
            }),
        )
    },
})

// How many conversations are waiting on you, for the sidebar badge (capped; the UI shows 99+)
export const needsYouCount = query({
    args: {},
    handler: async (ctx) => {
        const ws = await currentWorkspace(ctx)
        if (!ws) return 0
        return (
            await ctx.db
                .query('conversations')
                .withIndex('by_workspace_and_needsYou_and_lastAt', (q) => q.eq('workspaceId', ws._id).eq('needsYou', true))
                .take(100)
        ).length
    },
})

export const thread = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const ws = await currentWorkspace(ctx)
        const conversationId = ctx.db.normalizeId('conversations', id)
        const conversation = ws && conversationId && (await ctx.db.get('conversations', conversationId))
        if (!conversation || conversation.workspaceId !== ws._id) return null
        const [contact, agent, number] = await Promise.all([
            ctx.db.get('contacts', conversation.contactId),
            ctx.db.get('agents', conversation.agentId),
            conversation.numberId ? ctx.db.get('numbers', conversation.numberId) : null,
        ])
        if (!contact || !agent) return null
        // The latest 500; older history stays in the export
        const messages = (
            await ctx.db
                .query('messages')
                .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
                .order('desc')
                .take(500)
        ).reverse()
        // Group chats show who said what
        const senderIds = [...new Set(messages.flatMap((m) => (m.senderId && m.senderId !== contact._id ? [m.senderId] : [])))]
        const senders = Object.fromEntries(await Promise.all(senderIds.map(async (sid) => [sid, (await ctx.db.get('contacts', sid))?.name ?? 'Someone'] as const)))
        return { conversation, contact, agent, number, messages, senders: { ...senders, [contact._id]: contact.name } as Record<string, string> }
    },
})

// You reply on the agent's behalf; it's delivered like the agent's own replies and clears "needs you"
export const send = mutation({
    args: { id: v.id('conversations'), body: v.string() },
    handler: async (ctx, { id, body }) => {
        const ws = await requireWorkspace(ctx)
        const conversation = await owned(ctx, ws, 'conversations', id)
        const text = body.trim()
        if (!text) throw new Error('Message is empty')
        const at = Date.now()
        const messageId = await ctx.db.insert('messages', { conversationId: id, from: 'agent', body: text, at, by: 'you' })
        await ctx.db.patch('conversations', id, { lastMessage: text, lastAt: at, needsYou: undefined, problem: undefined })
        await queueDelivery(ctx, messageId, conversation)
    },
})

// Marks a conversation handled without replying
export const resolve = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'conversations', id)
        await ctx.db.patch('conversations', id, { needsYou: undefined, problem: undefined })
    },
})

// Asks the agent to answer the latest text again (after fixing a key or setting the agent live)
export const retry = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        const conversation = await owned(ctx, ws, 'conversations', id)
        const last = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', id))
            .order('desc')
            .first()
        if (last?.from !== 'contact') throw new Error('The last message is already a reply')
        await ctx.db.patch('conversations', id, { needsYou: undefined, problem: undefined })
        await scheduleReply(ctx, { ...conversation, needsYou: undefined }, last._id)
    },
})

export const remove = mutation({
    args: { id: v.id('conversations') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'conversations', id)
        await deleteConversation(ctx, id)
    },
})
