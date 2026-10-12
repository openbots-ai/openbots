import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
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
    const ws = await ctx.db.get('workspace', conversation.workspaceId)
    const now = Date.now()
    const quiet = ws?.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(now, ws.timezone ?? 'UTC', ws.quietStart, ws.quietEnd) : 0
    const delay = Math.max((ws?.replyDelaySec ?? 2) * 1000, quiet)
    await ctx.db.patch('conversations', conversation._id, { replying: true, problem: quiet ? `Quiet hours: ${agent.name} will reply when they end.` : undefined })
    await ctx.scheduler.runAfter(delay, internal.replies.generate, { conversationId: conversation._id, messageId })
}

// Sends an agent message out through the number's texting account. Test conversations never send.
export async function queueDelivery(ctx: MutationCtx, messageId: Id<'messages'>, conversation: Doc<'conversations'>) {
    if (conversation.test) return
    const number = conversation.numberId && (await ctx.db.get('numbers', conversation.numberId))
    if (!number) return
    await ctx.db.patch('messages', messageId, { delivery: 'queued' })
    await ctx.scheduler.runAfter(0, internal.delivery.send, { messageId })
}

// Adds to the day's usage row for this agent, slot and model
export async function recordUsage(ctx: MutationCtx, workspaceId: Id<'workspace'>, agentId: Id<'agents'>, slot: string, model: string, at: number, count = 1) {
    const day = dayKey(at)
    const row = await ctx.db
        .query('usage')
        .withIndex('by_agent_and_slot_and_model_and_day', (q) => q.eq('agentId', agentId).eq('slot', slot).eq('model', model).eq('day', day))
        .unique()
    if (row) await ctx.db.patch('usage', row._id, { count: row.count + count })
    else await ctx.db.insert('usage', { workspaceId, agentId, slot, model, day, count })
}

export type Incoming = {
    from: string
    body: string
    name?: string
    // Group chats: the channel's thread id and the group's name
    thread?: { key: string; title?: string }
}

// Where a text landed: a real number, or (for Test a text) straight to an agent with no number
export type Target = { workspaceId: Id<'workspace'>; number?: Doc<'numbers'>; agentId?: Id<'agents'>; test?: boolean }

// A text arrived. Finds or creates the contact and conversation, stores the message and queues the agent's reply.
// In a group chat the agent only answers when someone uses its name.
export async function receiveText(ctx: MutationCtx, target: Target, msg: Incoming) {
    const body = msg.body.trim()
    if (!body) throw new Error('Message is empty')
    const fromKey = handleKey(msg.from)
    if (!fromKey) throw new Error(`"${msg.from}" isn't a phone number or email`)
    const { workspaceId, number } = target
    const test = !!target.test
    const ws = (await ctx.db.get('workspace', workspaceId))!
    const agentId = target.agentId ?? number?.agentId ?? ws.defaultAgentId
    const agent = agentId && (await ctx.db.get('agents', agentId))
    if (!agent || agent.workspaceId !== workspaceId) throw new Error(number ? `${number.handle} isn't assigned to an agent` : 'Pick an agent')

    const at = Date.now()
    let contact = await ctx.db
        .query('contacts')
        .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId).eq('key', fromKey))
        .first()
    if (contact) {
        await ctx.db.patch('contacts', contact._id, { lastSeenAt: at })
    } else {
        const name = msg.name?.trim() || msg.from.trim()
        const contactId = await ctx.db.insert('contacts', {
            workspaceId,
            name,
            handle: msg.from.trim(),
            key: fromKey,
            tags: ws.newContactTag ? [ws.newContactTag] : [],
            notes: '',
            agentId: agent._id,
            lastSeenAt: at,
        })
        contact = (await ctx.db.get('contacts', contactId))!
        await notify(ctx, workspaceId, 'new_contact', `${name} texted ${agent.name}`, `First message: “${body}”`)
    }

    const existing = msg.thread
        ? await ctx.db
              .query('conversations')
              .withIndex('by_workspace_and_thread', (q) => q.eq('workspaceId', workspaceId).eq('threadKey', msg.thread!.key))
              .first()
        : await ctx.db
              .query('conversations')
              .withIndex('by_contact_and_agent', (q) => q.eq('contactId', contact._id).eq('agentId', agent._id))
              .filter((q) => q.and(q.eq(q.field('threadKey'), undefined), q.eq(q.field('test'), test || undefined)))
              .first()
    const conversationId =
        existing?._id ??
        (await ctx.db.insert('conversations', {
            workspaceId,
            contactId: contact._id,
            agentId: agent._id,
            numberId: number?._id,
            test: test || undefined,
            threadKey: msg.thread?.key,
            title: msg.thread?.title,
            lastMessage: body,
            lastAt: at,
        }))
    const messageId = await ctx.db.insert('messages', { conversationId, from: 'contact', senderId: contact._id, body, at })
    await ctx.db.patch('conversations', conversationId, { lastMessage: body, lastAt: at, ...(number ? { numberId: number._id } : {}), ...(msg.thread?.title ? { title: msg.thread.title } : {}) })

    const conversation = (await ctx.db.get('conversations', conversationId))!
    const addressed = !msg.thread || new RegExp(`\\b${agent.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body)
    if (addressed) await scheduleReply(ctx, conversation, messageId)
    return { conversationId, messageId }
}
