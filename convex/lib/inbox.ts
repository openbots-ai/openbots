import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { env, type MutationCtx } from '../_generated/server'
import { handleKey } from './handles'
import { notify } from './notify'
import { msUntilQuietEnds } from './quiet'
import { dayKey } from './usage'

// Queues the agent's reply to the newest contact message, honouring the reply delay and quiet hours.
// Agents that aren't live leave the conversation for you instead.
export async function scheduleReply(ctx: MutationCtx, conversation: Doc<'conversations'>, messageId: Id<'messages'>) {
    const agent = await ctx.db.get('agents', conversation.agentId)
    if (!agent) return
    if (agent.status !== 'live') {
        await ctx.db.patch('conversations', conversation._id, { needsYou: true, replying: false, problem: `${agent.name} is ${agent.status}, so it won't reply. Answer here, or set it live.` })
        return
    }
    const ws = await ctx.db.query('workspace').first()
    const now = Date.now()
    const quiet = ws?.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(now, ws.timezone ?? 'UTC', ws.quietStart, ws.quietEnd) : 0
    const delay = Math.max((ws?.replyDelaySec ?? 2) * 1000, quiet)
    await ctx.db.patch('conversations', conversation._id, { replying: true, problem: quiet ? `Quiet hours: ${agent.name} will reply when they end.` : undefined })
    await ctx.scheduler.runAfter(delay, internal.replies.generate, { conversationId: conversation._id, messageId })
    // The relay shows the typing bubble just before the reply goes out (on by default)
    if (env.OUTBOUND_WEBHOOK_URL && ws?.typingIndicator !== false) {
        await ctx.scheduler.runAfter(Math.max(0, delay - 2_000), internal.delivery.typing, { conversationId: conversation._id })
    }
}

// Hands an agent message to the relay when one is configured
export async function queueDelivery(ctx: MutationCtx, messageId: Id<'messages'>) {
    if (!env.OUTBOUND_WEBHOOK_URL) return
    await ctx.db.patch('messages', messageId, { delivery: 'queued' })
    await ctx.scheduler.runAfter(0, internal.delivery.send, { messageId })
}

// Adds to the day's usage row for this agent, slot and model
export async function recordUsage(ctx: MutationCtx, agentId: Id<'agents'>, slot: string, model: string, at: number, count = 1) {
    const day = dayKey(at)
    const row = await ctx.db
        .query('usage')
        .withIndex('by_agent_and_slot_and_model_and_day', (q) => q.eq('agentId', agentId).eq('slot', slot).eq('model', model).eq('day', day))
        .unique()
    if (row) await ctx.db.patch('usage', row._id, { count: row.count + count })
    else await ctx.db.insert('usage', { agentId, slot, model, day, count })
}

// A text arrived from `from` to one of your iMessage numbers (`to`). Finds or creates the contact and
// conversation, stores the message and queues the agent's reply.
export async function receiveText(ctx: MutationCtx, args: { to: string; from: string; body: string; name?: string }) {
    const body = args.body.trim()
    if (!body) throw new Error('Message is empty')
    const numberKey = handleKey(args.to)
    const fromKey = handleKey(args.from)
    if (!numberKey) throw new Error(`"${args.to}" isn't a phone number or email`)
    if (!fromKey) throw new Error(`"${args.from}" isn't a phone number or email`)

    const number = await ctx.db.query('numbers').withIndex('by_key', (q) => q.eq('key', numberKey)).first()
    if (!number) throw new Error(`${args.to} isn't one of your iMessage numbers`)
    const ws = await ctx.db.query('workspace').first()
    const agentId = number.agentId ?? ws?.defaultAgentId
    const agent = agentId && (await ctx.db.get('agents', agentId))
    if (!agent) throw new Error(`${number.handle} isn't assigned to an agent`)

    const at = Date.now()
    let contact = await ctx.db.query('contacts').withIndex('by_key', (q) => q.eq('key', fromKey)).first()
    if (contact) {
        await ctx.db.patch('contacts', contact._id, { lastSeenAt: at })
    } else {
        const name = args.name?.trim() || args.from.trim()
        const contactId = await ctx.db.insert('contacts', {
            name,
            handle: args.from.trim(),
            key: fromKey,
            tags: ws?.newContactTag ? [ws.newContactTag] : [],
            notes: '',
            agentId: agent._id,
            lastSeenAt: at,
        })
        contact = (await ctx.db.get('contacts', contactId))!
        await notify(ctx, 'new_contact', `${name} texted ${agent.name}`, `First message: “${body}”`)
    }

    const existing = await ctx.db
        .query('conversations')
        .withIndex('by_contact_and_agent', (q) => q.eq('contactId', contact._id).eq('agentId', agent._id))
        .first()
    const conversationId =
        existing?._id ?? (await ctx.db.insert('conversations', { contactId: contact._id, agentId: agent._id, numberId: number._id, lastMessage: body, lastAt: at }))
    const messageId = await ctx.db.insert('messages', { conversationId, from: 'contact', body, at })
    await ctx.db.patch('conversations', conversationId, { lastMessage: body, lastAt: at, numberId: number._id })
    await scheduleReply(ctx, (await ctx.db.get('conversations', conversationId))!, messageId)
    // Tells the relay whether to send a read receipt (on by default)
    return { conversationId, messageId, markRead: ws?.readReceipts !== false }
}
