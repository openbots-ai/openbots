import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
    args: { since: v.optional(v.number()) },
    handler: async (ctx, { since }) => {
        const rows = await ctx.db
            .query('conversations')
            .withIndex('by_lastAt', (q) => q.gte('lastAt', since ?? 0))
            .order('desc')
            .collect()
        return Promise.all(
            rows.map(async (c) => {
                const [contact, agent] = await Promise.all([ctx.db.get(c.contactId), ctx.db.get(c.agentId)])
                return { ...c, contactName: contact?.name ?? 'Unknown', contactHandle: contact?.handle ?? '', agentName: agent?.name ?? 'Unknown' }
            }),
        )
    },
})

export const thread = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const conversationId = ctx.db.normalizeId('conversations', id)
        const conversation = conversationId && (await ctx.db.get(conversationId))
        if (!conversation) return null
        const [contact, agent] = await Promise.all([ctx.db.get(conversation.contactId), ctx.db.get(conversation.agentId)])
        if (!contact || !agent) return null
        const messages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
            .collect()
        return { conversation, contact, agent, messages }
    },
})

// The operator replies on the agent's behalf; stored only
export const send = mutation({
    args: { id: v.id('conversations'), body: v.string() },
    handler: async (ctx, { id, body }) => {
        const text = body.trim()
        if (!text) throw new Error('Message is empty')
        const at = Date.now()
        await ctx.db.insert('messages', { conversationId: id, from: 'agent', body: text, at })
        await ctx.db.patch(id, { lastMessage: text, lastAt: at })
    },
})
