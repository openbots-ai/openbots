import type { Doc, Id } from '../../convex/_generated/dataModel'
import { handleKey } from '../../convex/lib/handles'
import { keyModels, NONE, resolveModels, type KeyModel, type ModelOption } from '../../convex/lib/models'
import { knowledgeFor, MAX_TOKENS, parseReply, systemPrompt, toTurns } from '../../convex/lib/prompt'
import { msUntilQuietEnds } from '../../convex/lib/quiet'
import { dayKey, DEFAULT_CONTACT_REPLIES_PER_HOUR, NEW_CONTACT_ALERTS_PER_HOUR } from '../../convex/lib/usage'
import { complete as completeWith, ReplyError, SEARCHES, TOOL_PROVIDERS, type Brains, type Prompt } from './brain'
import { short, type ComputerTasks } from './computer/tasks'
import type { Fired } from './scheduler'
import type { Conversation, Job, Store } from './store'
import { computerTool, schedulingTools } from './tools'
import type { Channel, Incoming, Transport } from './transports/types'

// What the engine reads from Convex: your settings, agents, numbers and knowledge (see convex/runner.ts:config)
export type Config = {
    workspace: Omit<Doc<'workspace'>, 'userId' | 'notifyDigest' | 'lastDigestDay'>
    agents: Doc<'agents'>[]
    numbers: Doc<'numbers'>[]
    knowledge: Doc<'knowledge'>[]
    // This engine may do tasks on your computer (Settings, for a Windows or Mac engine)
    computerUse?: boolean
}

// Counts sent to Convex for Analytics and the budget. Never names, numbers or text.
export type Activity = Partial<Record<'conversations' | 'newContacts' | 'messagesIn' | 'messagesOut' | 'handoffs', number>>

// The engine's link to Convex (sync.ts), kept behind an interface so tests can fake it
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
    // Emails you, when the engine has Resend set up
    email?: (to: string, subject: string, text: string) => Promise<void>
    // Runs computer tasks on this machine, when it's a Windows or Mac computer (see computer/tasks.ts)
    computer?: Pick<ComputerTasks, 'busy' | 'current' | 'start' | 'handle'>
    // What's stopping computer use right now (a Mac missing a permission), or null
    computerProblem?: () => string | null
    complete?: typeof completeWith
    now?: () => number
    log?: (line: string) => void
}

// How much history the model sees
const HISTORY = 40
// After a handoff the agent stays out of the conversation this long, so you can answer yourself
export const PAUSE_MS = 24 * 3_600_000
const TYPING_LEAD_MS = 2_000
// A watch waits this long while its agent is paused or the budget is used up
const HOLD_MS = 60 * 60_000
// How late a check-in may still go out
const LATE_MS = 6 * 3_600_000
// A reminder or watch whose channel isn't running checks again this much later
const WAIT_MS = 5 * 60_000
// The window for the per-contact reply limit and the new-contact alert cap
const HOUR_MS = 60 * 60_000

// The calendar date at `ms` in `timeZone`
function localDate(ms: number, timeZone: string) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms).map((p) => [p.type, p.value]))
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

// How far `timeZone` is ahead of UTC at `ms`
function offsetAt(ms: number, timeZone: string) {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
            .formatToParts(ms)
            .map((x) => [x.type, x.value]),
    )
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(ms / 1000) * 1000
}

// The moment a local date (YYYY-MM-DD) and time (HH:MM) happen in `timeZone`, using the offset in force then (so
// daylight saving is right); a time a spring-forward skips lands within an hour of it.
export function zonedTime(date: string, time: string, timeZone: string) {
    const [y, mo, d] = date.split('-').map(Number)
    const [h, mi] = time.split(':').map(Number)
    const wall = Date.UTC(y, mo - 1, d, h, mi)
    let at = wall - offsetAt(wall, timeZone)
    at = wall - offsetAt(at, timeZone)
    return at
}

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
    update(parts: Partial<Pick<Deps, 'transports' | 'brains' | 'email' | 'computerProblem'>>) {
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
        // Texts from your own phone are a chat with your agent (see isOwner)
        const fromOwner = this.isOwner(text.from)
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
        if (newContact && !fromOwner && ws.notifyNewContact !== false) await this.newContactAlert(store.getConversation(conversation.id)!, `${contact.name} texted ${agent.name} for the first time.`)

        // Who and which agent, never what they wrote
        this.log(`Text from …${fromKey.slice(-4)} to ${agent.name}${fromOwner ? ' (you)' : ''}`)
        // While a computer task waits for your answer (or you say stop), your text is for the task, not a new reply
        if (fromOwner && !text.thread && this.deps.computer?.handle(conversation.id, body)) return { markRead: true }
        if (!text.thread || named(agent.name, body)) await this.queue(store.getConversation(conversation.id)!, messageId, agent)
        return { markRead: true }
    }

    // You texting your own agent from the phone in Settings: it helps you directly, even before it's live, and never
    // hands the chat to you or goes quiet, since you're the one it would hand it to
    private isOwner(handle: string) {
        const owner = this.config.workspace.ownerHandle
        return !!owner && handleKey(owner) === handleKey(handle)
    }

    // A note straight to you in your own chat, instead of a handoff alert about it
    private async tellOwner(conversation: Conversation, to: string, body: string) {
        await this.send(conversation, to, body).catch((e) => this.log(`Couldn't text you: ${describe(e)}`))
    }

    // Queues the reply to the newest message, honouring pauses, the reply delay and quiet hours
    private async queue(conversation: Conversation, messageId: number, agent: Doc<'agents'>) {
        const { store } = this.deps
        const ws = this.config.workspace
        const owner = this.isOwner(store.getContact(conversation.contactId)?.handle ?? '')
        if (!owner && conversation.pausedUntil && conversation.pausedUntil > this.now()) return this.log(`${agent.name} is staying out of that chat for now (it was handed to you)`)
        if (!owner && agent.status !== 'live') {
            // Not a request for help, so no 24-hour pause: once the agent is live it answers the next text
            if (!conversation.needsYou) await this.handoff(conversation, agent, `${agent.name} is ${agent.status}, so it didn't reply. Set it live in the dashboard, or answer yourself.`, { pause: false })
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
        const owner = !!contact && this.isOwner(contact.handle)
        if (!agent || !contact || (agent.status !== 'live' && !owner)) return

        const now = this.now()
        const blocked = await link.budget(dayKey(now))
        if (blocked && owner) return this.tellOwner(conversation, contact.handle, `${blocked} Raise it in Settings.`)
        if (blocked) return this.handoff(conversation, agent, `${blocked} Raise it in Settings, or answer yourself.`)
        // However much one person texts, the agent sends them only so many replies an hour (your own chats aren't limited)
        if (!owner) {
            const limit = ws.contactRepliesPerHour ?? DEFAULT_CONTACT_REPLIES_PER_HOUR
            if (store.repliesTo(contact.id, now - HOUR_MS) >= limit) return this.replyLimitReached(conversation, agent, contact.id, limit)
        }

        const models = resolveModels(ws.models, agent.models, agent.model, keyModels(this.deps.models()))
        const turns = this.turns(conversation)
        // Each model gets its own prompt: scheduling tools only in your own one-to-one chat (in a group the chat's
        // first sender may not be you), and only for a model that can run them. use_computer joins them when this engine
        // can use your computer and has an Anthropic key (read now: keys saved in Connections arrive while it runs).
        const computer = this.deps.computer
        // The task's questions and result go into this chat's history and counts, like any reply
        const taskSend = (body: string) => this.textInChat(conversationId, body)
        const promptFor = (option: ModelOption): Prompt => {
            // Read for each model, so a Backup sees a task the Brain's tool call just started.
            // A task running from this chat: the agent says it's in progress (and how to stop it) instead of offering another
            const running = owner && !conversation.threadKey ? computer?.current() : null
            const busyHere = running?.conversationId === conversation.id ? running : null
            const scheduling = owner && !conversation.threadKey && TOOL_PROVIDERS.includes(option.provider)
            const offerable = scheduling && !!computer && this.config.computerUse === true && !!this.deps.brains.keys.anthropic
            // A Mac missing a permission: no use_computer, and the agent can say what's missing
            const problem = offerable ? (this.deps.computerProblem?.() ?? null) : null
            const computing = offerable && !problem && !!computer && !computer.busy()
            const tools = scheduling ? schedulingTools({ store, agentId: agent._id, owner: contact.handle, number: conversation.number, channel: conversation.channel, now: this.now, timeZone: ws.timezone ?? 'UTC' }) : []
            if (computing) tools.push(computerTool((task) => computer.start(task, { agentId: agent._id, agentName: agent.name, conversationId, send: taskSend })))
            return {
                system: systemPrompt({
                    agent,
                    workspace: ws,
                    contact,
                    // Documents not marked "Share with contacts" stay in your own one-to-one chats
                    knowledge: knowledgeFor(knowledge, agent._id, owner && !conversation.threadKey),
                    now,
                    group: conversation.threadKey ? (conversation.title ?? 'a group') : undefined,
                    withOwner: owner,
                    sms: conversation.channel === 'twilio',
                    canSearch: SEARCHES.includes(option.provider),
                    canSchedule: scheduling,
                    canUseComputer: computing,
                    computerBusy: busyHere ? short(busyHere.task, 80) : undefined,
                    computerBusyElsewhere: !!running && !busyHere,
                    computerProblem: problem ?? undefined,
                }),
                turns,
                temperature: agent.temperature,
                maxTokens: MAX_TOKENS[agent.replyLength ?? 'short'],
                tools: tools.length ? tools : undefined,
            }
        }

        const brain = models.brain.option
        const backup = models.backup.option.id === NONE ? null : models.backup.option
        let result: { option: ModelOption; slot: string; text: string } | undefined
        let problem = ''
        try {
            result = { option: brain, slot: 'brain', text: await this.complete(brains, brain, promptFor(brain)) }
        } catch (brainError) {
            problem = describe(brainError)
            // The Backup slot takes over when the brain's provider fails
            if (backup && backup.id !== brain.id) {
                try {
                    result = { option: backup, slot: 'backup', text: await this.complete(brains, backup, promptFor(backup)) }
                } catch (backupError) {
                    problem = `${problem}. Backup ${backup.label} failed too: ${describe(backupError)}`
                }
            }
        }
        if (!result && owner) return this.tellOwner(conversation, contact.handle, `${agent.name} couldn’t reply: ${problem}`)
        if (!result) return this.handoff(conversation, agent, `${agent.name} couldn't reply. ${problem}`)

        void link.record(agent._id, { usage: { slot: result.slot, model: result.option.id } }).catch((e) => this.log(`Couldn't record usage: ${describe(e)}`))
        const { body, handoff } = parseReply(result.text)
        // A reply that was only the marker still hands off, without sending an empty text
        if (body) {
            try {
                await this.send(conversation, contact.handle, body)
            } catch (e) {
                if (owner) return this.log(`Couldn't send ${agent.name}'s reply to you: ${describe(e)}`)
                return this.handoff(conversation, agent, `The reply couldn't be sent: ${describe(e)}`)
            }
            const at = this.now()
            store.addMessage(conversationId, 'agent', body, at, { model: result.option.id })
            this.log(`${agent.name} replied to …${handleKey(contact.handle)?.slice(-4)} (${result.option.label})`)
            store.updateConversation(conversationId, { lastAt: at })
            void link.record(agent._id, { activity: { messagesOut: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        }
        if (handoff && !owner) await this.handoff(conversation, agent, `${agent.name} asked you to step in.`)
    }

    // A reminder or watch that came due (see scheduler.ts). Watches hold their alerts through quiet hours, and wait an
    // hour while the agent is paused or the budget is used up; reminders make no model call, so they always go.
    async fireJob(job: Job): Promise<Fired> {
        const ws = this.config.workspace
        const agent = this.config.agents.find((a) => a._id === job.agentId)
        if (!agent) return { outcome: 'failed' }
        const transport = this.deps.transports[job.channel]
        // The channel isn't running (yet): wait for it, and the heartbeat reports the waiting job
        if (!transport) {
            this.log(`${agent.name} has a ${job.kind} waiting for ${job.channel}, which isn't running`)
            return { outcome: 'later', inMs: WAIT_MS }
        }
        const text = (body: string) => transport.send({ from: job.number, to: job.to, body })
        if (job.kind === 'reminder') {
            // A send that throws is retried by the scheduler, a few minutes later
            await text(`Reminder: ${job.text}`)
            this.log(`${agent.name} sent a reminder to …${handleKey(job.to)?.slice(-4)}`)
            return { outcome: 'sent' }
        }
        const now = this.now()
        const quiet = ws.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(now, ws.timezone ?? 'UTC', ws.quietStart, ws.quietEnd) : 0
        if (quiet > 0) return { outcome: 'later', inMs: quiet }
        if (agent.status === 'paused' || (await this.deps.link.budget(dayKey(now)))) return { outcome: 'later', inMs: HOLD_MS }
        const result = await this.think(agent, `Check this for ${ws.ownerName}: ${job.text}. ${job.last ? `Last time: ${job.last}` : 'This is the first check.'} If nothing that matters changed since last time, reply only [[no-change]]. Otherwise reply with a short text saying what changed.`, now)
        if (!result) return { outcome: 'failed' }
        if (result.includes('[[no-change]]')) return { outcome: 'unchanged' }
        await text(result)
        this.log(`${agent.name} sent a watch update to …${handleKey(job.to)?.slice(-4)}`)
        return { outcome: 'sent', result }
    }

    // Check-ins due now. Today's and yesterday's occurrence (dated and weekday-checked by their own local day) are each
    // sent once: up to 6 hours late (an engine that was off sends a missed one once), or, when quiet hours held it, within
    // 6 hours of those quiet hours ending. Never during quiet hours, from a paused agent, or over budget.
    async fireCheckIns(now: number) {
        const { store } = this.deps
        const ws = this.config.workspace
        if (!ws.ownerHandle) return
        const tz = ws.timezone ?? 'UTC'
        const quietAt = (t: number) => (ws.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(t, tz, ws.quietStart, ws.quietEnd) : 0)
        if (quietAt(now) > 0) return
        const today = localDate(now, tz)
        const due: { agent: Doc<'agents'>; what: string; key: string }[] = []
        for (const agent of this.config.agents) {
            if (agent.status === 'paused') continue
            for (const c of agent.checkIns ?? []) {
                if (!c.on) continue
                for (const back of [0, 1]) {
                    const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back))
                    if (!c.days.includes(d.getUTCDay())) continue
                    const date = d.toISOString().slice(0, 10)
                    const key = `checkin:${agent._id}:${c.id}:${date}`
                    const at = zonedTime(date, c.time, tz)
                    const late = now - at
                    if (late < 0 || store.getMeta(key)) continue
                    const held = quietAt(at)
                    if (late <= LATE_MS || (held > 0 && now - (at + held) <= LATE_MS)) due.push({ agent, what: c.what, key })
                }
            }
        }
        if (!due.length) return
        // Checked before anything is marked sent, so check-ins still go out later today if you raise the cap
        if (await this.deps.link.budget(dayKey(now))) return
        const waiting: string[] = []
        for (const { agent, what, key } of due) {
            // The agent's number, including one that answers for the default agent (as in receive)
            const number = this.config.numbers.find((n) => (n.agentId ?? ws.defaultAgentId) === agent._id)
            const transport = number && this.deps.transports[number.channel]
            // Not marked sent, so it still goes out if the number or channel comes back within its window
            if (!number || !transport) {
                if (!waiting.includes(agent.name)) waiting.push(agent.name)
                continue
            }
            // Marked before thinking, so a failing model can't send it again every tick
            store.setMeta(key, '1')
            // One check-in going wrong must not stop the others (nothing it says is logged)
            try {
                const body = await this.think(agent, `It's time for your scheduled check-in with ${ws.ownerName}. Send them: ${what}`, now)
                if (!body) {
                    this.log(`${agent.name}'s check-in got no reply, so nothing was sent`)
                    continue
                }
                await transport.send({ from: number.handle, to: ws.ownerHandle, body })
                this.log(`${agent.name} sent a check-in`)
            } catch (e) {
                this.log(`${agent.name}'s check-in failed: ${describe(e)}`)
                await transport.send({ from: number.handle, to: ws.ownerHandle, body: `${agent.name}'s check-in couldn't be sent: ${describe(e)}` }).catch((e2) => this.log(`Couldn't text you: ${describe(e2)}`))
            }
        }
        // One line a tick at most
        if (waiting.length) this.log(`Check-ins waiting for a number or channel that isn't running: ${waiting.join(', ')}`)
    }

    // One reply from the agent's Brain to an instruction from the engine, for watches and check-ins
    private async think(agent: Doc<'agents'>, instruction: string, now: number) {
        const { brains, link } = this.deps
        const ws = this.config.workspace
        const models = resolveModels(ws.models, agent.models, agent.model, keyModels(this.deps.models()))
        const system = systemPrompt({
            agent,
            workspace: ws,
            contact: { name: ws.ownerName, handle: ws.ownerHandle ?? '', tags: [], notes: '' },
            knowledge: knowledgeFor(this.config.knowledge, agent._id, true),
            now,
            withOwner: true,
            sms: true,
            canSearch: SEARCHES.includes(models.brain.option.provider),
        })
        const text = await this.complete(brains, models.brain.option, { system, turns: [{ role: 'user', content: instruction }], temperature: agent.temperature, maxTokens: MAX_TOKENS.short })
        void link.record(agent._id, { usage: { slot: 'brain', model: models.brain.option.id } }).catch((e) => this.log(`Couldn't record usage: ${describe(e)}`))
        return text.trim()
    }

    // Whether textInChat can reach the chat: 'ready', 'waiting' for its channel to run, or 'gone' (the chat was deleted)
    chatReach(conversationId: number): 'ready' | 'waiting' | 'gone' {
        const conversation = this.deps.store.getConversation(conversationId)
        if (!conversation || !this.deps.store.getContact(conversation.contactId)) return 'gone'
        return this.deps.transports[conversation.channel] ? 'ready' : 'waiting'
    }

    // A text from the agent into one chat (a computer task's question or result), kept in its history and counts.
    // Throws if the chat or its channel is gone.
    async textInChat(conversationId: number, body: string) {
        const { store, link } = this.deps
        const conversation = store.getConversation(conversationId)
        const contact = conversation && store.getContact(conversation.contactId)
        if (!conversation || !contact) throw new Error('That chat is gone')
        await this.send(conversation, contact.handle, body)
        const at = this.now()
        store.addMessage(conversationId, 'agent', body, at)
        store.updateConversation(conversationId, { lastAt: at })
        void link.record(conversation.agentId as Id<'agents'>, { activity: { messagesOut: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
    }

    // Sends through the channel the conversation came in on (to the group, for a group chat)
    private async send(conversation: Conversation, to: string, body: string) {
        const transport = this.deps.transports[conversation.channel]
        if (!transport) throw new Error(`this agent doesn't have ${conversation.channel} set up`)
        await transport.send({ from: conversation.number, to, body, threadKey: conversation.threadKey })
    }

    // Steps the agent out of a conversation for a day and tells you why. The alert names the contact but never quotes
    // what they wrote; you read that on your phone.
    // Flags the chat for you and alerts you. By default the agent then stays out of it for 24 hours so you can answer.
    private async handoff(conversation: Conversation, agent: Doc<'agents'>, reason: string, { pause = true } = {}) {
        const { store, link } = this.deps
        // Logged here too, so the reason is visible even when the alert can't be delivered (no phone in Settings)
        this.log(`${agent.name} handed a chat to you: ${reason}`)
        store.updateConversation(conversation.id, { needsYou: true, pausedUntil: pause ? this.now() + PAUSE_MS : null, pendingId: null, dueAt: null })
        void link.record(agent._id, { activity: { handoffs: 1 } }).catch((e) => this.log(`Couldn't record counts: ${describe(e)}`))
        if (this.config.workspace.notifyHandoff === false) return
        const who = conversation.title ?? store.getContact(conversation.contactId)?.name ?? 'Someone'
        await this.alertOwner(conversation, `${who} needs you (${agent.name}). ${reason}${pause ? ` ${agent.name} stays out of that chat for 24 hours.` : ''}`)
    }

    // The agent stops replying to someone who reached the per-contact limit, and tells you once (again only if they
    // reach it again more than an hour later)
    private async replyLimitReached(conversation: Conversation, agent: Doc<'agents'>, contactId: number, limit: number) {
        const { store } = this.deps
        const key = `replylimit:${contactId}`
        const told = Number(store.getMeta(key) ?? 0)
        if (this.now() - told < HOUR_MS) return this.log(`${agent.name} didn't reply: it already sent that contact ${limit} replies in the last hour`)
        store.setMeta(key, String(this.now()))
        await this.handoff(conversation, agent, `${agent.name} sent them ${limit} replies in the last hour, the most it sends one person, so it stopped replying for now. Answer yourself, or raise the limit in Settings → Usage budget.`, { pause: false })
    }

    // Tells you about a new contact, at most a few times an hour: the next one says more are texting and the rest wait
    // for the hour to pass, so a flood of strangers can't flood your phone and inbox too
    private async newContactAlert(conversation: Conversation, body: string) {
        const { store } = this.deps
        const now = this.now()
        const [start, count] = (store.getMeta('newcontact:alerts') ?? '0:0').split(':').map(Number)
        const fresh = now - start >= HOUR_MS
        const n = fresh ? 1 : count + 1
        store.setMeta('newcontact:alerts', `${fresh ? now : start}:${n}`)
        if (n <= NEW_CONTACT_ALERTS_PER_HOUR) return this.alertOwner(conversation, body)
        if (n > NEW_CONTACT_ALERTS_PER_HOUR + 1) return this.log('New contact (alert held: too many this hour)')
        const minutes = Math.max(1, Math.ceil((start + HOUR_MS - now) / 60_000))
        await this.alertOwner(conversation, `More new people are texting your agents: ${n} in the last hour. New-contact alerts are held for the next ${minutes} minutes. Your agents still reply, up to your limits in Settings.`)
    }

    // Texts your own phone from the conversation's number, and emails you when the engine has Resend set up
    private async alertOwner(conversation: Conversation, body: string) {
        const ws = this.config.workspace
        if (ws.ownerEmail && this.deps.email) await this.deps.email(ws.ownerEmail, body.split('. ')[0], body).catch((e) => this.log(`Couldn't email you: ${describe(e)}`))
        if (!ws.ownerHandle) return this.log('Add your phone under Settings → General to get handoff texts')
        const transport = this.deps.transports[conversation.channel]
        if (!transport) return
        await transport.send({ from: conversation.number, to: ws.ownerHandle, body }).catch((e) => this.log(`Couldn't text you: ${describe(e)}`))
    }
}
