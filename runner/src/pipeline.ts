import type { Doc, Id } from '../../convex/_generated/dataModel'
import { handleKey } from '../../convex/lib/handles'
import { NONE, resolveModels, type ModelOption } from '../../convex/lib/models'
import { MAX_TOKENS, parseReply, systemPrompt, toTurns } from '../../convex/lib/prompt'
import { msUntilQuietEnds } from '../../convex/lib/quiet'
import { dayKey } from '../../convex/lib/usage'
import { complete as completeWith, ReplyError, type Brains, type Prompt } from './brain'
import type { Conversation, Store } from './store'
import type { Incoming, Transport } from './transports/types'

// What the agent reads from Convex: your settings, agents, numbers and knowledge (see convex/runner.ts:config)
export type Config = {
    workspace: Omit<Doc<'workspace'>, 'ownerId' | 'ownerEmail' | 'notifyDigest' | 'lastDigestDay'>
    agents: Doc<'agents'>[]
    numbers: Doc<'numbers'>[]
    knowledge: Doc<'knowledge'>[]
}

// Counts sent to Convex for Analytics and the budget. Never names, numbers or text.
export type Activity = Partial<Record<'conversations' | 'newContacts' | 'messagesIn' | 'messagesOut' | 'handoffs', number>>

// The agent's link to Convex (sync.ts), kept behind an interface so tests can fake it
export interface Link {
    config(): Config | null
    budget(today: string): Promise<string | null>
    record(agentId: Id<'agents'>, data: { usage?: { slot: string; model: string }; activity?: Activity }): Promise<void>
}

export type Deps = {
    store: Store
    link: Link
    transport: Transport
    brains: Brains
    complete?: typeof completeWith
    now?: () => number
    log?: (line: string) => void
}

// How much history the model sees
const HISTORY = 40
// After a handoff the agent stays out of the conversation this long, so you can answer in Messages
export const PAUSE_MS = 24 * 3_600_000
const TYPING_LEAD_MS = 2_000

const describe = (e: unknown) => (e instanceof ReplyError ? e.message : `${e instanceof Error ? e.message : String(e)}`.slice(0, 200))

export class Pipeline {
    private timers = new Map<number, NodeJS.Timeout[]>()
    private complete: typeof completeWith
    private now: () => number
    private log: (line: string) => void

    constructor(private deps: Deps) {
        this.complete = deps.complete ?? completeWith
        this.now = deps.now ?? Date.now
        this.log = deps.log ?? console.log
    }

    private get config() {
        const config = this.deps.link.config()
        if (!config) throw new Error('Not connected to your workspace yet')
        return config
    }

    // Queued replies survive a restart: pick them back up, answering straight away if they're overdue
    resume() {
        for (const c of this.deps.store.pending()) if (c.pendingId) this.schedule(c.id, c.pendingId, Math.max(0, (c.dueAt ?? 0) - this.now()))
    }

    stop() {
        for (const list of this.timers.values()) list.forEach(clearTimeout)
        this.timers.clear()
    }

    // A text arrived on one of your numbers. Stores it, counts it, and queues the agent's reply.
    async receive(text: Incoming): Promise<{ markRead: boolean }> {
        const { store, link } = this.deps
        const { workspace: ws, numbers, agents } = this.config
        const body = text.body.trim()
        if (!body) throw new Error('Message is empty')
        const numberKey = handleKey(text.to)
        const fromKey = handleKey(text.from)
        if (!numberKey || !fromKey) throw new Error("That text didn't come from or to a phone number or email")
        // Your own replies to handoff alerts aren't conversations
        if (ws.ownerHandle && handleKey(ws.ownerHandle) === fromKey) return { markRead: true }
        const number = numbers.find((n) => n.key === numberKey)
        if (!number) throw new Error(`${text.to} isn't one of your iMessage numbers`)
        const agent = agents.find((a) => a._id === (number.agentId ?? ws.defaultAgentId))
        if (!agent) throw new Error(`${number.handle} isn't assigned to an agent`)

        const at = this.now()
        const { contact, isNew: newContact } = store.contact(fromKey, () => ({
            handle: text.from.trim(),
            name: text.name?.trim() || text.from.trim(),
            tags: ws.newContactTag ? [ws.newContactTag] : [],
        }))
        const { conversation } = store.conversation(contact.id, agent._id, number.handle, at)
        const messageId = store.addMessage(conversation.id, 'contact', body, at)
        store.updateConversation(conversation.id, { lastAt: at, number: number.handle })

        const counted = store.countOnce(dayKey(at), conversation.id)
        void link.record(agent._id, { activity: { messagesIn: 1, conversations: counted ? 1 : 0, newContacts: newContact ? 1 : 0 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        if (newContact && ws.notifyNewContact !== false) await this.alertOwner(number.handle, `${contact.name} texted ${agent.name} for the first time.`)

        await this.queue(store.getConversation(conversation.id)!, messageId, agent)
        return { markRead: ws.readReceipts !== false }
    }

    // Queues the reply to the newest contact message, honouring pauses, the reply delay and quiet hours
    private async queue(conversation: Conversation, messageId: number, agent: Doc<'agents'>) {
        const { store } = this.deps
        const ws = this.config.workspace
        if (conversation.pausedUntil && conversation.pausedUntil > this.now()) return
        if (agent.status !== 'live') {
            if (!conversation.needsYou) await this.handoff(conversation, agent, `${agent.name} is ${agent.status}, so it didn't reply. Set it live in the dashboard, or answer in Messages.`)
            return
        }
        const now = this.now()
        const quiet = ws.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(now, ws.timezone ?? 'UTC', ws.quietStart, ws.quietEnd) : 0
        const delay = Math.max((ws.replyDelaySec ?? 2) * 1000, quiet)
        store.updateConversation(conversation.id, { pendingId: messageId, dueAt: now + delay, needsYou: false })
        this.schedule(conversation.id, messageId, delay)
    }

    private schedule(conversationId: number, messageId: number, delay: number) {
        for (const t of this.timers.get(conversationId) ?? []) clearTimeout(t)
        const timers = [setTimeout(() => void this.reply(conversationId, messageId).catch((e) => this.log(`Reply failed: ${describe(e)}`)), delay)]
        const { transport } = this.deps
        if (transport.typing && this.deps.link.config()?.workspace.typingIndicator !== false) {
            timers.push(
                setTimeout(() => {
                    const c = this.deps.store.getConversation(conversationId)
                    const contact = c && this.deps.store.getContact(c.contactId)
                    if (c && contact) void transport.typing!({ from: c.number, to: contact.handle })
                }, Math.max(0, delay - TYPING_LEAD_MS)),
            )
        }
        this.timers.set(conversationId, timers)
    }

    // Writes and sends the reply, unless a newer text has its own reply queued or the agent stopped
    async reply(conversationId: number, messageId: number) {
        const { store, link, transport, brains } = this.deps
        const conversation = store.getConversation(conversationId)
        if (!conversation || conversation.pendingId !== messageId) return
        store.updateConversation(conversationId, { pendingId: null, dueAt: null })
        const { workspace: ws, agents, knowledge } = this.config
        const agent = agents.find((a) => a._id === conversation.agentId)
        const contact = store.getContact(conversation.contactId)
        if (!agent || !contact || agent.status !== 'live') return

        const now = this.now()
        const blocked = await link.budget(dayKey(now))
        if (blocked) return this.handoff(conversation, agent, `${blocked} Raise it in Settings, or answer in Messages.`)

        const models = resolveModels(ws.models, agent.models, agent.model)
        const prompt: Prompt = {
            system: systemPrompt({ agent, workspace: ws, contact, knowledge: knowledge.filter((k) => !k.agentId || k.agentId === agent._id).slice(0, 100), now }),
            turns: toTurns(store.history(conversationId, HISTORY)),
            temperature: agent.temperature,
            maxTokens: MAX_TOKENS[agent.replyLength ?? 'short'],
        }

        const brain = models.brain.option
        const backup = models.backup.option.id === NONE ? null : models.backup.option
        let result: { option: ModelOption; slot: string; text: string } | undefined
        let problem = ''
        try {
            result = { option: brain, slot: 'brain', text: await this.complete(brains, brain, prompt) }
        } catch (brainError) {
            problem = describe(brainError)
            // The Backup slot takes over when the brain's provider fails
            if (backup && backup.id !== brain.id) {
                try {
                    result = { option: backup, slot: 'backup', text: await this.complete(brains, backup, prompt) }
                } catch (backupError) {
                    problem = `${problem}. Backup ${backup.label} failed too: ${describe(backupError)}`
                }
            }
        }
        if (!result) return this.handoff(conversation, agent, `${agent.name} couldn't reply. ${problem}`)

        void link.record(agent._id, { usage: { slot: result.slot, model: result.option.id } }).catch((e) => this.log(`Couldn't record usage: ${describe(e)}`))
        const { body, handoff } = parseReply(result.text)
        // A reply that was only the marker still hands off, without sending an empty text
        if (body) {
            try {
                await transport.send({ from: conversation.number, to: contact.handle, body })
            } catch (e) {
                return this.handoff(conversation, agent, `The reply couldn't be sent: ${describe(e)}`)
            }
            const at = this.now()
            store.addMessage(conversationId, 'agent', body, at, result.option.id)
            store.updateConversation(conversationId, { lastAt: at })
            void link.record(agent._id, { activity: { messagesOut: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        }
        if (handoff) await this.handoff(conversation, agent, `${agent.name} asked you to step in.`)
    }

    // Steps the agent out of a conversation for a day and texts you why. The alert names the contact but never
    // quotes what they wrote; you read that in Messages.
    private async handoff(conversation: Conversation, agent: Doc<'agents'>, reason: string) {
        const { store, link } = this.deps
        store.updateConversation(conversation.id, { needsYou: true, pausedUntil: this.now() + PAUSE_MS, pendingId: null, dueAt: null })
        void link.record(agent._id, { activity: { handoffs: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        if (this.config.workspace.notifyHandoff === false) return
        const contact = store.getContact(conversation.contactId)
        await this.alertOwner(conversation.number, `${contact?.name ?? 'Someone'} needs you (${agent.name}). ${reason} ${agent.name} stays out of that chat for 24 hours.`)
    }

    // Texts the owner's own phone, from the agent's number
    private async alertOwner(from: string, body: string) {
        const to = this.config.workspace.ownerHandle
        if (!to) return this.log('Add your phone under Settings → General to get handoff texts')
        await this.deps.transport.send({ from, to, body }).catch((e) => this.log(`Couldn't text you: ${describe(e)}`))
    }
}
