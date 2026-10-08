import { v } from 'convex/values'
import { internal } from './_generated/api'
import { env, internalAction, internalMutation, internalQuery } from './_generated/server'
import { deliveryStatus } from './schema'
import { demoMode, keyFor } from './lib/llm'
import { resolveModels } from './lib/models'

// What the relay needs to send one agent message: which of your numbers it goes out from, and to whom
export const payload = internalQuery({
    args: { messageId: v.id('messages') },
    handler: async (ctx, { messageId }) => {
        const message = await ctx.db.get('messages', messageId)
        const conversation = message && (await ctx.db.get('conversations', message.conversationId))
        if (!message || !conversation) return null
        const [contact, number] = await Promise.all([
            ctx.db.get('contacts', conversation.contactId),
            conversation.numberId ? ctx.db.get('numbers', conversation.numberId) : ctx.db.query('numbers').withIndex('by_agent', (q) => q.eq('agentId', conversation.agentId)).first(),
        ])
        if (!contact) return null
        return { messageId, conversationId: conversation._id, from: number?.handle ?? null, to: contact.handle, body: message.body }
    },
})

const post = (url: string, data: unknown) =>
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(env.OUTBOUND_SECRET ? { Authorization: `Bearer ${env.OUTBOUND_SECRET}` } : {}) },
        body: JSON.stringify(data),
    })

export const typingTarget = internalQuery({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const conversation = await ctx.db.get('conversations', conversationId)
        if (!conversation?.replying) return null
        const [contact, number, agent, ws] = await Promise.all([
            ctx.db.get('contacts', conversation.contactId),
            conversation.numberId ? ctx.db.get('numbers', conversation.numberId) : null,
            ctx.db.get('agents', conversation.agentId),
            ctx.db.query('workspace').first(),
        ])
        // No bubble when the reply can't be written (its provider has no key and this isn't a demo)
        if (!contact || !agent || (!keyFor(resolveModels(ws?.models, agent.models, agent.model).brain.option.provider) && !demoMode())) return null
        return { conversationId, from: number?.handle ?? null, to: contact.handle }
    },
})

// Asks the relay to show the typing bubble; best effort, a failure never blocks the reply
export const typing = internalAction({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const url = env.OUTBOUND_WEBHOOK_URL
        const target = await ctx.runQuery(internal.delivery.typingTarget, { conversationId })
        if (!url || !target) return
        await post(url, { type: 'typing', ...target }).catch(() => undefined)
    },
})

// POSTs an agent message to your iMessage relay (OUTBOUND_WEBHOOK_URL)
export const send = internalAction({
    args: { messageId: v.id('messages') },
    handler: async (ctx, { messageId }) => {
        const url = env.OUTBOUND_WEBHOOK_URL
        const data = await ctx.runQuery(internal.delivery.payload, { messageId })
        if (!url || !data) return
        let error: string | undefined
        try {
            const res = await post(url, { type: 'message', ...data })
            if (!res.ok) error = `Relay answered ${res.status}: ${(await res.text()).slice(0, 200)}`
        } catch (e) {
            error = `Couldn't reach the relay: ${e instanceof Error ? e.message : String(e)}`
        }
        await ctx.runMutation(internal.delivery.mark, { messageId, delivery: error ? 'failed' : 'sent', error })
    },
})

export const mark = internalMutation({
    args: { messageId: v.id('messages'), delivery: deliveryStatus, error: v.optional(v.string()) },
    handler: async (ctx, { messageId, delivery, error }) => {
        if (await ctx.db.get('messages', messageId)) await ctx.db.patch('messages', messageId, { delivery, deliveryError: error })
    },
})
