import type { Doc, Id } from '../../convex/_generated/dataModel'
import { handleKey } from '../../convex/lib/handles'
import { keyModels, NONE, resolveModels, type KeyModel, type ModelOption } from '../../convex/lib/models'
import { MAX_TOKENS, parseReply, systemPrompt, toTurns } from '../../convex/lib/prompt'
import { msUntilQuietEnds } from '../../convex/lib/quiet'
import { dayKey } from '../../convex/lib/usage'
import { complete as completeWith, ReplyError, type Brains, type Prompt } from './brain'
import type { Conversation, Store } from './store'
import type { Channel, Incoming, Transport } from './transports/types'

// What the agent reads from Convex: your settings, agents, numbers and knowledge (see convex/runner.ts:config)
export type Config = {
    workspace: Omit<Doc<'workspace'>, 'userId' | 'notifyDigest' | 'lastDigestDay'>
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
    // The channels this agent has set up, by name
    transports: Partial<Record<Channel, Transport>>
    brains: Brains
    // The models this agent's AI keys can use (see models.ts:checkKeys)
    models: () => KeyModel[]
    // Emails you, when the agent has Resend set up
    email?: (to: string, subject: string, text: string) => Promise<void>
    complete?: typeof completeWith
    now?: () => number
    log?: (line: string) => void
}

// How much history the model sees
const HISTORY = 40
// After a handoff the agent stays out of the conversation this long, so you can answer yourself
export const PAUSE_MS = 24 * 3_600_000
const TYPING_LEAD_MS = 2_000

const describe = (e: unknown) => (e instanceof ReplyError ? e.message : `${e instanceof Error ? e.message : String(e)}`.slice(0, 200))
const named = (name: string, text: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)

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

    // New channels, keys or email after a change in the dashboard; texts already queued use them when they go out
    update(parts: Partial<Pick<Deps, 'transports' | 'brains' | 'email'>>) {
        Object.assign(this.deps, parts)
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

    // A text arrived on one of your channels. Stores it, counts it, and queues the agent's reply. In a group chat the
    // agent only answers when someone uses its name.
    async receive(text: Incoming): Promise<{ markRead: boolean }> {
        const { store, link } = this.deps
        const { workspace: ws, numbers, agents } = this.config
        const body = text.body.trim()
        if (!body) throw new Error('Message is empty')
        const fromKey = handleKey(text.from)
        if (!fromKey) throw new Error("That text didn't come from a phone number or email")
        // Your own replies to handoff alerts aren't conversations
        if (ws.ownerHandle && handleKey(ws.ownerHandle) === fromKey) return { markRead: true }
        // The number it was sent to, or for a channel with one address (BlueBubbles) that channel's number
        const toKey = text.to ? handleKey(text.to) : null
        const number = toKey ? numbers.find((n) => n.key === toKey) : numbers.find((n) => n.channel === text.channel)
        if (!number) throw new Error(text.to ? `${text.to} isn't one of your numbers` : `Add your ${text.channel} number in Numbers`)
        const agent = agents.find((a) => a._id === (number.agentId ?? ws.defaultAgentId))
        if (!agent) throw new Error(`${number.handle} isn't assigned to an agent`)

        const at = this.now()
        const { contact, isNew: newContact } = store.contact(fromKey, () => ({
            handle: text.from.trim(),
            name: text.name?.trim() || text.from.trim(),
            tags: ws.newContactTag ? [ws.newContactTag] : [],
        }))
        const { conversation } = store.conversation({ contactId: contact.id, agentId: agent._id, number: number.handle, channel: number.channel, at, thread: text.thread })
        const messageId = store.addMessage(conversation.id, 'contact', body, at, { senderId: contact.id })
        store.updateConversation(conversation.id, { lastAt: at, number: number.handle, channel: number.channel })

        const counted = store.countOnce(dayKey(at), conversation.id)
        void link.record(agent._id, { activity: { messagesIn: 1, conversations: counted ? 1 : 0, newContacts: newContact ? 1 : 0 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        if (newContact && ws.notifyNewContact !== false) await this.alertOwner(store.getConversation(conversation.id)!, `${contact.name} texted ${agent.name} for the first time.`)

        if (!text.thread || named(agent.name, body)) await this.queue(store.getConversation(conversation.id)!, messageId, agent)
        return { markRead: true }
    }

    // Queues the reply to the newest message, honouring pauses, the reply delay and quiet hours
    private async queue(conversation: Conversation, messageId: number, agent: Doc<'agents'>) {
        const { store } = this.deps
        const ws = this.config.workspace
        if (conversation.pausedUntil && conversation.pausedUntil > this.now()) return
        if (agent.status !== 'live') {
            if (!conversation.needsYou) await this.handoff(conversation, agent, `${agent.name} is ${agent.status}, so it didn't reply. Set it live in the dashboard, or answer yourself.`)
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
        const c = this.deps.store.getConversation(conversationId)
        const transport = c && this.deps.transports[c.channel]
        // The typing bubble, one-to-one chats only
        if (c && !c.threadKey && transport?.typing) {
            timers.push(
                setTimeout(() => {
                    const contact = this.deps.store.getContact(c.contactId)
                    if (contact) void transport.typing!({ from: c.number, to: contact.handle })
                }, Math.max(0, delay - TYPING_LEAD_MS)),
            )
        }
        this.timers.set(conversationId, timers)
    }

    // The conversation as model turns; in a group each message starts with who sent it
    private turns(conversation: Conversation) {
        const { store } = this.deps
        const names = new Map<number, string>()
        const nameOf = (id?: number) => {
            if (id === undefined) return 'Someone'
            if (!names.has(id)) names.set(id, store.getContact(id)?.name ?? 'Someone')
            return names.get(id)!
        }
        const history = store.history(conversation.id, HISTORY)
        return toTurns(conversation.threadKey ? history.map((m) => (m.from === 'contact' ? { ...m, body: `${nameOf(m.senderId)}: ${m.body}` } : m)) : history)
    }

    // Writes and sends the reply, unless a newer text has its own reply queued or the agent stopped
    async reply(conversationId: number, messageId: number) {
        const { store, link, brains } = this.deps
        const conversation = store.getConversation(conversationId)
        if (!conversation || conversation.pendingId !== messageId) return
        store.updateConversation(conversationId, { pendingId: null, dueAt: null })
        const { workspace: ws, agents, knowledge } = this.config
        const agent = agents.find((a) => a._id === conversation.agentId)
        const contact = store.getContact(conversation.contactId)
        if (!agent || !contact || agent.status !== 'live') return

        const now = this.now()
        const blocked = await link.budget(dayKey(now))
        if (blocked) return this.handoff(conversation, agent, `${blocked} Raise it in Settings, or answer yourself.`)

        const models = resolveModels(ws.models, agent.models, agent.model, keyModels(this.deps.models()))
        const prompt: Prompt = {
            system: systemPrompt({
                agent,
                workspace: ws,
                contact,
                knowledge: knowledge.filter((k) => !k.agentId || k.agentId === agent._id).slice(0, 100),
                now,
                group: conversation.threadKey ? (conversation.title ?? 'a group') : undefined,
            }),
            turns: this.turns(conversation),
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
                await this.send(conversation, contact.handle, body)
            } catch (e) {
                return this.handoff(conversation, agent, `The reply couldn't be sent: ${describe(e)}`)
            }
            const at = this.now()
            store.addMessage(conversationId, 'agent', body, at, { model: result.option.id })
            store.updateConversation(conversationId, { lastAt: at })
            void link.record(agent._id, { activity: { messagesOut: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        }
        if (handoff) await this.handoff(conversation, agent, `${agent.name} asked you to step in.`)
    }

    // Sends through the channel the conversation came in on (to the group, for a group chat)
    private async send(conversation: Conversation, to: string, body: string) {
        const transport = this.deps.transports[conversation.channel]
        if (!transport) throw new Error(`this agent doesn't have ${conversation.channel} set up`)
        await transport.send({ from: conversation.number, to, body, threadKey: conversation.threadKey })
    }

    // Steps the agent out of a conversation for a day and tells you why. The alert names the contact but never quotes
    // what they wrote; you read that on your phone.
    private async handoff(conversation: Conversation, agent: Doc<'agents'>, reason: string) {
        const { store, link } = this.deps
        store.updateConversation(conversation.id, { needsYou: true, pausedUntil: this.now() + PAUSE_MS, pendingId: null, dueAt: null })
        void link.record(agent._id, { activity: { handoffs: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        if (this.config.workspace.notifyHandoff === false) return
        const who = conversation.title ?? store.getContact(conversation.contactId)?.name ?? 'Someone'
        await this.alertOwner(conversation, `${who} needs you (${agent.name}). ${reason} ${agent.name} stays out of that chat for 24 hours.`)
    }

    // Texts your own phone from the conversation's number, and emails you when the agent has Resend set up
    private async alertOwner(conversation: Conversation, body: string) {
        const ws = this.config.workspace
        if (ws.ownerEmail && this.deps.email) await this.deps.email(ws.ownerEmail, body.split('. ')[0], body).catch((e) => this.log(`Couldn't email you: ${describe(e)}`))
        if (!ws.ownerHandle) return this.log('Add your phone under Settings → General to get handoff texts')
        const transport = this.deps.transports[conversation.channel]
        if (!transport) return
        await transport.send({ from: conversation.number, to: ws.ownerHandle, body }).catch((e) => this.log(`Couldn't text you: ${describe(e)}`))
    }
}
