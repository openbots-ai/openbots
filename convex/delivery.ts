import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { decrypt } from './lib/crypto'
import { ConnectError, sendText, type Credentials } from './lib/providers'
import { deliveryStatus } from './schema'

// What it takes to send one agent message: the number it goes out from, its texting account, and who it's to
export const payload = internalQuery({
    args: { messageId: v.id('messages') },
    handler: async (ctx, { messageId }) => {
        const message = await ctx.db.get('messages', messageId)
        const conversation = message && (await ctx.db.get('conversations', message.conversationId))
        if (!message || !conversation?.numberId || conversation.test) return null
        const [contact, number] = await Promise.all([ctx.db.get('contacts', conversation.contactId), ctx.db.get('numbers', conversation.numberId)])
        const connection = number && (await ctx.db.get('connections', number.connectionId))
        if (!contact || !number || !connection) return null
        return {
            channel: number.channel,
            secret: connection.secret,
            from: number.handle,
            to: contact.handle,
            threadKey: conversation.threadKey,
            body: message.body,
        }
    },
})

// Sends an agent message through its number's texting account (Twilio, Sendblue or BlueBubbles)
export const send = internalAction({
    args: { messageId: v.id('messages') },
    handler: async (ctx, { messageId }) => {
        const data = await ctx.runQuery(internal.delivery.payload, { messageId })
        if (!data) return
        let error: string | undefined
        try {
            const creds = await decrypt<Credentials[typeof data.channel]>(data.secret)
            await sendText(data.channel, creds, { from: data.from, to: data.to, body: data.body, threadKey: data.threadKey })
        } catch (e) {
            error = e instanceof ConnectError ? e.message : `Couldn't send: ${e instanceof Error ? e.message : String(e)}`
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
