// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { KeyModel } from '../../convex/lib/models'
import { complete as realComplete, ReplyError, type Brains, type complete } from './brain'
import { listModels } from './models'
import { Vault } from './crypto'
import { PAUSE_MS, Pipeline, zonedTime, type Activity, type Config, type Deps, type Link } from './pipeline'
import { RETRY_MS, Scheduler } from './scheduler'
import { ComputerTasks } from './computer/tasks'
import { Store } from './store'
import { MacTransport, textFromAttributedBody } from './transports/mac'
import type { Channel, Incoming, Outgoing, Transport } from './transports/types'

const AGENT = 'agent1' as Id<'agents'>
const WS = 'ws' as Id<'workspace'>
const OWNER = '+1 (650) 555-0000'
// What the engine's keys can use
const KEYS: KeyModel[] = [
    { provider: 'openai', id: 'gpt-5.1', label: 'gpt-5.1' },
    { provider: 'openai', id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
]

function config(overrides: { agent?: Partial<Doc<'agents'>>; workspace?: Partial<Config['workspace']>; computerUse?: boolean } = {}): Config {
    return {
        computerUse: overrides.computerUse,
        workspace: { _id: WS, _creationTime: 0, name: 'Test', ownerName: 'Sam', timezone: 'UTC', replyDelaySec: 0, ownerHandle: OWNER, ...overrides.workspace },
        agents: [{ _id: AGENT, _creationTime: 0, workspaceId: WS, name: 'Pip', role: 'Assistant', hue: 0, prompt: 'Be brief.', greeting: 'hi', status: 'live', updatedAt: 0, ...overrides.agent }],
        numbers: [
            { _id: 'n1' as Id<'numbers'>, _creationTime: 0, workspaceId: WS, handle: '+1 (415) 555-0101', key: '14155550101', kind: 'phone', channel: 'relay', agentId: AGENT },
            { _id: 'n2' as Id<'numbers'>, _creationTime: 0, workspaceId: WS, handle: 'pip@icloud.com', key: 'pip@icloud.com', kind: 'email', channel: 'bluebubbles', agentId: AGENT },
        ],
        knowledge: [],
    }
}

class FakeLink implements Link {
    records: { usage?: { slot: string; model: string }; activity?: Activity }[] = []
    blocked: string | null = null
    constructor(public current: Config) {}
    config = () => this.current
    budget = async () => this.blocked
    record = async (_: Id<'agents'>, data: { usage?: { slot: string; model: string }; activity?: Activity }) => {
        this.records.push(data)
    }
    total = (k: keyof Activity) => this.records.reduce((s, r) => s + (r.activity?.[k] ?? 0), 0)
}

class FakeTransport implements Transport {
    constructor(readonly channel: Channel = 'relay') {}
    sent: Outgoing[] = []
    fail = false
    start = async () => {}
    stop = async () => {}
    send = async (m: Outgoing) => {
        if (this.fail) throw new Error('relay down')
        this.sent.push(m)
    }
}

const brains: Brains = { keys: { openai: 'k', anthropic: 'k' }, demo: false }
let dir: string

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openbots-test-'))
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
})

type Complete = typeof complete
const model = (impl: Complete) => vi.fn<Complete>(impl)

function setup(cfg = config(), complete = model(async () => 'sure, booked for friday'), keys: { brains?: Brains; models?: KeyModel[]; computer?: Deps['computer'] } = {}) {
    const vault = Vault.open(dir)
    const store = new Store(join(dir, 'openbots.db'), vault)
    const link = new FakeLink(cfg)
    const transport = new FakeTransport()
    const bubbles = new FakeTransport('bluebubbles')
    const pipeline = new Pipeline({ store, link, transports: { relay: transport, bluebubbles: bubbles }, brains: keys.brains ?? brains, models: () => keys.models ?? KEYS, computer: keys.computer, complete, log: () => {} })
    const text = (body: string, from = '+1 212 555 0187') => pipeline.receive({ channel: 'relay', to: '4155550101', from, body, name: 'Dana' })
    return { store, link, transport, bubbles, pipeline, complete, text, vault }
}

describe('vault', () => {
    it('round-trips, and refuses a value moved to another row or tampered with', () => {
        const vault = Vault.open(dir)
        const sealed = vault.seal('meet at 5', 'message:1')
        expect(sealed).not.toContain('meet')
        expect(vault.open(sealed, 'message:1')).toBe('meet at 5')
        expect(() => vault.open(sealed, 'message:2')).toThrow()
        const [v, iv, body] = sealed.split(':')
        const flipped = Buffer.from(body, 'base64')
        flipped[0] ^= 1
        expect(() => vault.open(`${v}:${iv}:${flipped.toString('base64')}`, 'message:1')).toThrow()
    })

    it('keys contacts saved before country codes were kept again, so they are still found', () => {
        const vault = Vault.open(dir)
        const path = join(dir, 'openbots.db')
        const old = new Store(path, vault)
        // Saved under the old key, which dropped the US 1
        const { contact } = old.contact('2125550187', () => ({ handle: '+1 212 555 0187', name: 'Dana', tags: [] }))
        old.deleteMeta('contacts.keys')
        old.close()
        const store = new Store(path, vault)
        expect(store.contact('12125550187', () => ({ handle: 'new', name: 'new', tags: [] }))).toEqual({ contact, isNew: false })
        store.close()
    })

    it('keeps its key readable only by you, and reuses it', () => {
        const a = Vault.open(dir)
        expect(statSync(join(dir, 'key')).mode & 0o777).toBe(0o600)
        expect(Vault.open(dir).open(a.seal('hi', 'x'), 'x')).toBe('hi')
    })
})

describe('agent', () => {
    it('replies from the same number, and keeps nothing readable on disk', async () => {
        const { transport, link, store, text } = setup()
        expect(await text('can you book a table for friday?')).toEqual({ markRead: true })
        await vi.runAllTimersAsync()
        expect(transport.sent).toEqual([
            { from: '+1 (415) 555-0101', to: OWNER, body: 'Dana texted Pip for the first time.' },
            { from: '+1 (415) 555-0101', to: '+1 212 555 0187', body: 'sure, booked for friday' },
        ])
        expect(link.total('messagesIn')).toBe(1)
        expect(link.total('messagesOut')).toBe(1)
        expect(link.total('newContacts')).toBe(1)
        expect(link.records.find((r) => r.usage)?.usage).toEqual({ slot: 'brain', model: 'openai:gpt-5.1' })
        // Nothing sent to Convex carries text or numbers
        expect(JSON.stringify(link.records)).not.toMatch(/friday|212|Dana/)

        store.close()
        for (const file of readdirSync(dir)) {
            const raw = readFileSync(join(dir, file)).toString('latin1')
            for (const secret of ['friday', 'Dana', '2125550187', '212 555']) expect(raw, `${file} contains ${secret}`).not.toContain(secret)
        }
        // And the rows really are there, just sealed
        const db = new DatabaseSync(join(dir, 'openbots.db'))
        expect((db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n).toBe(2)
        db.close()
    })

    it('counts a conversation once a day, and remembers the contact', async () => {
        const { link, text } = setup()
        await text('hi')
        await vi.runAllTimersAsync()
        await text('again')
        await vi.runAllTimersAsync()
        expect(link.total('conversations')).toBe(1)
        expect(link.total('newContacts')).toBe(1)
        expect(link.total('messagesIn')).toBe(2)
    })

    it('answers only the newest text when several arrive during the delay', async () => {
        const { complete, text } = setup(config({ workspace: { replyDelaySec: 5 } }))
        await text('one')
        await text('two')
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(1)
        expect(complete.mock.calls[0]?.[2].turns).toEqual([{ role: 'user', content: 'one\ntwo' }])
    })

    it('waits for quiet hours to end', async () => {
        vi.setSystemTime(Date.UTC(2026, 9, 8, 23, 0))
        const { transport, text } = setup(config({ workspace: { quietEnabled: true, quietStart: '22:00', quietEnd: '08:00' } }))
        await text('late night question')
        const replies = () => transport.sent.filter((m) => m.to !== OWNER)
        await vi.advanceTimersByTimeAsync(8 * 3_600_000)
        expect(replies()).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(3_600_000)
        expect(replies()).toHaveLength(1)
    })

    it('hands off to you without quoting the contact, then stays out for a day', async () => {
        const { transport, link, text, complete } = setup(undefined, model(async () => 'let me check with Sam [[handoff]]'))
        await text('can I get a refund on order 5512?')
        await vi.runAllTimersAsync()
        const [toContact, toOwner] = transport.sent.slice(-2)
        expect(toContact.body).toBe('let me check with Sam')
        expect(toOwner.to).toBe(OWNER)
        expect(toOwner.body).toMatch(/Dana needs you \(Pip\)/)
        expect(toOwner.body).not.toContain('refund')
        expect(link.total('handoffs')).toBe(1)

        await text('hello?')
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(1)
        vi.setSystemTime(Date.now() + PAUSE_MS + 1)
        await text('anyone?')
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(2)
    })

    it('falls back to the Backup model, and hands off when both fail', async () => {
        const flaky = model(async (_, option) => {
            if (option.id === 'openai:gpt-5.1') throw new Error('rate limited')
            return 'from backup'
        })
        const first = setup(config(), flaky)
        await first.text('hi')
        await vi.runAllTimersAsync()
        expect(first.transport.sent.at(-1)?.body).toBe('from backup')
        expect(first.link.records.find((r) => r.usage)?.usage).toEqual({ slot: 'backup', model: 'anthropic:claude-sonnet-5-5' })
        first.store.close()
        rmSync(dir, { recursive: true, force: true })

        const broken = setup(config(), model(async () => {
            throw new ReplyError('Add your OpenAI key in Connections or on your engine so gpt-5.1 can reply')
        }))
        await broken.text('hi')
        await vi.runAllTimersAsync()
        expect(broken.transport.sent.at(-1)).toMatchObject({ to: OWNER, body: expect.stringMatching(/Add your OpenAI key in Connections or on your engine.*failed too/) })
    })

    it('hands off when the budget is used up or the agent is paused', async () => {
        const { transport, link, text, complete } = setup()
        link.blocked = "Today's usage budget (5 credits) is used up."
        await text('hi')
        await vi.runAllTimersAsync()
        expect(complete).not.toHaveBeenCalled()
        expect(transport.sent.at(-1)?.body).toMatch(/budget/)

        link.current = config({ agent: { status: 'paused' } })
        await text('hi', '+1 212 555 0999')
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toMatch(/Pip is paused/)
    })

    it('replies as soon as a draft agent is set live, without the 24-hour handoff pause', async () => {
        const { transport, link, text, complete } = setup()
        link.current = config({ agent: { status: 'draft' } })
        await text('hello?')
        await vi.runAllTimersAsync()
        expect(complete).not.toHaveBeenCalled()
        expect(transport.sent.at(-1)?.body).toMatch(/Pip is draft/)
        expect(transport.sent.at(-1)?.body).not.toMatch(/24 hours/)

        link.current = config()
        await text('are you there now?')
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(1)
    })

    it('chats with you from your own phone: no handoffs, no 24-hour pause, even with a draft agent', async () => {
        const replies = ['Let me check on that. [[handoff]]', 'Sure, here it is.']
        const { transport, link, text, complete } = setup(config({ agent: { status: 'draft' } }), model(async () => replies.shift() ?? 'ok'))
        await text('can you look into flights?', OWNER)
        await vi.runAllTimersAsync()
        await text('thanks, and?', OWNER)
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(2)
        expect(transport.sent.map((m) => [m.to, m.body])).toEqual([
            [OWNER, 'Let me check on that.'],
            [OWNER, 'Sure, here it is.'],
        ])
        // You're told about strangers, not about yourself
        expect(transport.sent.some((m) => /needs you|first time/.test(m.body))).toBe(false)
        expect(link.records.some((r) => r.activity?.handoffs)).toBe(false)
    })

    it('tells you why when it can’t reply to you, and answers again once that’s fixed', async () => {
        let broke = true
        const { transport, text } = setup(config(), model(async () => {
            if (broke) throw new Error('You have no credits remaining.')
            return 'back now'
        }))
        await text('hello?', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)).toMatchObject({ to: OWNER, body: expect.stringMatching(/couldn’t reply.*no credits remaining/) })
        broke = false
        await text('hello again', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)).toMatchObject({ to: OWNER, body: 'back now' })
    })

    it('lets you set a reminder by text, in your timezone, and texts you when it’s due', async () => {
        const complete = model(async (_b, _o, p) => {
            const remind = p.tools?.find((t) => t.name === 'set_reminder')
            return remind ? await remind.run({ at: '2026-10-14T17:00:00-06:00', text: 'call mom' }) : 'no tools'
        })
        const { text, transport, store } = setup(config({ workspace: { timezone: 'America/Regina' } }), complete)
        vi.setSystemTime(Date.parse('2026-10-14T20:00:00Z'))
        await text('remind me at 5 to call mom', OWNER)
        await vi.runAllTimersAsync()
        const [job] = store.jobsFor(AGENT)
        expect(job).toMatchObject({ kind: 'reminder', text: 'call mom', dueAt: Date.parse('2026-10-14T23:00:00Z') })
        // Confirmed in your timezone, not UTC
        expect(transport.sent.at(-1)?.body).toBe(`Reminder set (#${job.id}) for Wed, Oct 14, 5:00 PM (UTC-06:00)`)
    })

    it('refuses a reminder in the past or without text, and stores nothing', async () => {
        const answers: string[] = []
        const complete = model(async (_b, _o, p) => {
            const remind = p.tools!.find((t) => t.name === 'set_reminder')!
            answers.push(await remind.run({ at: '2020-01-01T00:00:00Z', text: 'x' }).catch((e: Error) => `Error: ${e.message}`))
            answers.push(await remind.run({ in_minutes: 5 }).catch((e: Error) => `Error: ${e.message}`))
            return 'ok'
        })
        const { text, store } = setup(config(), complete)
        await text('remind me', OWNER)
        await vi.runAllTimersAsync()
        expect(answers[0]).toMatch(/already passed/)
        expect(answers[1]).toMatch(/what to remind/)
        expect(store.jobsFor(AGENT)).toEqual([])
    })

    it('refuses a time without its UTC offset, and an end time it can’t read', async () => {
        const answers: string[] = []
        const complete = model(async (_b, _o, p) => {
            const tool = (name: string) => p.tools!.find((t) => t.name === name)!
            const run = (name: string, input: Record<string, unknown>) => tool(name).run(input).catch((e: Error) => `Error: ${e.message}`)
            answers.push(await run('set_reminder', { at: '2026-10-14T17:00:00', text: 'call mom' }))
            answers.push(await run('set_reminder', { at: '2026-10-15', text: 'call mom' }))
            answers.push(await run('watch', { what: 'Uni ranking', until: 'next friday' }))
            answers.push(await run('watch', { what: 'Uni ranking', until: '2026-10-20T00:00:00' }))
            return 'ok'
        })
        const { text, store } = setup(config(), complete)
        vi.setSystemTime(Date.parse('2026-10-14T20:00:00Z'))
        await text('remind me', OWNER)
        await vi.runAllTimersAsync()
        for (const a of answers) expect(a).toMatch(/with its UTC offset/)
        expect(store.jobsFor(AGENT)).toEqual([])
    })

    it('gives a Backup that can’t run tools no tools and no scheduling line', async () => {
        const complete = model(async (_b, option) => {
            if (option.provider === 'openai') throw new Error('rate limited')
            return 'from gemini'
        })
        const keys: KeyModel[] = [...KEYS, { provider: 'google', id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]
        const { text, transport } = setup(config({ agent: { models: { brain: 'openai:gpt-5.1', backup: 'google:gemini-2.5-flash' } } }), complete, { brains: { keys: { openai: 'k', google: 'k' }, demo: false }, models: keys })
        await text('remind me at 5', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('from gemini')
        const [brainCall, backupCall] = complete.mock.calls
        expect(brainCall?.[2].tools?.length).toBeGreaterThan(0)
        expect(backupCall?.[1].provider).toBe('google')
        expect(backupCall?.[2].tools).toBeUndefined()
        expect(backupCall?.[2].system).not.toMatch(/set reminders/)
    })

    it('gives someone else no scheduling tools', async () => {
        const complete = model(async (_b, _o, p) => (p.tools?.length ? 'had tools' : 'no tools'))
        const { text, transport } = setup(config(), complete)
        await text('remind me tomorrow', '+1 212 555 0187')
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tools')
    })

    it('gives texts from your number over SMS no tools, computer use or task answers, since caller ID can be faked', async () => {
        const answered: string[] = []
        const computer = { busy: () => false, current: () => null, start: () => 'Started', handle: (_id: number, text: string) => (answered.push(text), false) }
        const complete = model(async (_b, _o, p) => (p.tools?.length ? 'had tools' : 'no tools'))
        const cfg = config({ computerUse: true })
        cfg.numbers.push({ _id: 'n3' as Id<'numbers'>, _creationTime: 0, workspaceId: WS, handle: '+1 (415) 555-0199', key: '14155550199', kind: 'phone', channel: 'twilio', agentId: AGENT })
        const { pipeline, transport, store } = setup(cfg, complete, { computer })
        const twilio = new FakeTransport('twilio')
        pipeline.update({ transports: { relay: transport, twilio } })

        await pipeline.receive({ channel: 'twilio', to: '+14155550199', from: OWNER, body: 'YES' })
        await vi.runAllTimersAsync()
        expect(twilio.sent.at(-1)?.body).toBe('no tools')
        expect(complete.mock.calls.at(-1)?.[2].system).toMatch(/came over SMS.*text you over iMessage/)
        // SMS that reaches an iMessage channel (a Mac forwarding your iPhone's texts) is no better
        await pipeline.receive({ channel: 'relay', to: '4155550101', from: OWNER, body: 'YES', sms: true })
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tools')
        expect(answered).toEqual([])

        // A reply still queued when the engine restarts remembers its text came over SMS
        await pipeline.receive({ channel: 'twilio', to: '+14155550199', from: OWNER, body: 'remind me at 5' })
        pipeline.stop()
        const again = new Pipeline({ store, link: new FakeLink(cfg), transports: { relay: transport, twilio }, brains, models: () => KEYS, computer, complete, log: () => {} })
        again.resume()
        await vi.runAllTimersAsync()
        expect(twilio.sent.at(-1)?.body).toBe('no tools')

        // Over iMessage you get them all back
        await again.receive({ channel: 'relay', to: '4155550101', from: OWNER, body: 'YES' })
        await vi.runAllTimersAsync()
        expect(answered).toEqual(['YES'])
        expect(transport.sent.at(-1)?.body).toBe('had tools')
        expect(complete.mock.calls.at(-1)?.[2].system).not.toMatch(/came over SMS/)
    })

    it('never takes a number from another country for yours because the digits match', async () => {
        const complete = model(async (_b, _o, p) => (p.tools?.length ? 'had tools' : 'no tools'))
        const { text, transport } = setup(config({ workspace: { ownerHandle: '+1 479 123 4567' } }), complete)
        // Norway's +47 912 34 567 and the US +1 479 123 4567 share their digits
        await text('remind me at 5', '+47 912 34 567')
        await vi.runAllTimersAsync()
        expect(transport.sent.map((m) => m.body)).toEqual(['Dana texted Pip for the first time.', 'no tools'])
        await text('remind me at 5', '(479) 123-4567')
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('had tools')
    })

    it('gives no scheduling tools in a group chat, even one you started', async () => {
        const complete = model(async (_b, _o, p) => (p.tools?.length || /set reminders/.test(p.system) ? 'had tools' : 'no tools'))
        const { bubbles, pipeline } = setup(config(), complete)
        const group = (from: string, body: string, name: string) => pipeline.receive({ channel: 'bluebubbles', from, body, name, thread: { key: 'iMessage;+;chat7', title: 'Plans' } })
        await group(OWNER, 'Pip, remind me at 5 to call mom', 'Sam')
        await vi.runAllTimersAsync()
        await group('+1 212 555 0187', 'Pip, remind everyone tomorrow', 'Dana')
        await vi.runAllTimersAsync()
        expect(complete).toHaveBeenCalledTimes(2)
        expect(bubbles.sent.filter((m) => m.threadKey).map((m) => m.body)).toEqual(['no tools', 'no tools'])
    })

    it('offers no scheduling tools when your Brain can’t run them', async () => {
        const complete = model(async (_b, _o, p) => (p.tools?.length ? 'had tools' : 'no tools'))
        const gemini: KeyModel[] = [{ provider: 'google', id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }]
        const { text, transport } = setup(config({ agent: { models: { brain: 'google:gemini-2.5-flash', backup: 'none' } } }), complete, { brains: { keys: { google: 'k' }, demo: false }, models: gemini })
        await text('remind me tomorrow', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tools')
        expect(complete.mock.calls[0]?.[1].provider).toBe('google')
        expect(complete.mock.calls[0]?.[2].system).not.toMatch(/set reminders/)
    })

    it('offers use_computer in your own chat when computer use is on, and starts the task', async () => {
        const started: { task: string; agentId: string; conversationId: number }[] = []
        let send: ((body: string) => Promise<void>) | undefined
        const computer = {
            busy: () => false,
            current: () => null,
            handle: () => false,
            start: (task: string, ctx: { agentId: string; conversationId: number; send: (body: string) => Promise<void> }) => {
                started.push({ task, agentId: ctx.agentId, conversationId: ctx.conversationId })
                send = ctx.send
                return 'Started'
            },
        }
        const complete = model(async (_b, _o, p) => {
            const tool = p.tools?.find((t) => t.name === 'use_computer')
            if (!tool) return 'no tool'
            return tool.run({ task: 'open Notepad and type hello' })
        })
        const { text, transport, store, link } = setup(config({ computerUse: true }), complete, { computer })
        await text('open notepad and type hello', OWNER)
        await vi.runAllTimersAsync()
        expect(started).toEqual([{ task: 'open Notepad and type hello', agentId: AGENT, conversationId: expect.any(Number) }])
        expect(complete.mock.calls[0]?.[2].system).toMatch(/do tasks on their computer/)
        // Its texts go to you, from the number you used
        await send!('Done.')
        expect(transport.sent.at(-1)).toEqual({ from: '+1 (415) 555-0101', to: OWNER, body: 'Done.', threadKey: undefined })
        // And into the chat's history and counts, like any reply
        const out = link.total('messagesOut')
        await send!('Booked it.')
        expect(store.history(started[0].conversationId, 10).at(-1)).toMatchObject({ from: 'agent', body: 'Booked it.' })
        expect(link.total('messagesOut')).toBe(out + 1)
    })

    it('passes the model a start that fails, and offers no use_computer while a task runs', async () => {
        const answers: string[] = []
        const computer = {
            busy: () => false,
            current: () => null,
            handle: () => false,
            start: () => {
                throw new Error('I\'m still working on “book Nopa”. Text stop to cancel it first.')
            },
        }
        const complete = model(async (_b, _o, p) => {
            const tool = p.tools?.find((t) => t.name === 'use_computer')
            answers.push(tool ? await tool.run({ task: 'open notepad' }).catch((e: Error) => `Error: ${e.message}`) : 'no tool')
            return 'ok'
        })
        const { text } = setup(config({ computerUse: true }), complete, { computer })
        await text('open notepad', OWNER)
        await vi.runAllTimersAsync()
        expect(answers).toEqual(['Error: I\'m still working on “book Nopa”. Text stop to cancel it first.'])

        const busy = { busy: () => true, current: () => ({ task: 'book Nopa', conversationId: 1 }), handle: () => false, start: vi.fn(() => 'Started') }
        const tools: string[][] = []
        const second = setup(config({ computerUse: true }), model(async (_b, _o, p) => (tools.push(p.tools?.map((t) => t.name) ?? []), 'ok')), { computer: busy })
        await second.text('open notepad', OWNER)
        await vi.runAllTimersAsync()
        expect(tools[0]).toContain('set_reminder')
        expect(tools[0]).not.toContain('use_computer')
    })

    describe('doesn’t offer use_computer', () => {
        const cases: { name: string; computerUse: boolean; from?: string; brains?: Brains; noComputer?: boolean }[] = [
            { name: 'to a stranger', computerUse: true, from: '+1 212 555 0187' },
            { name: 'when computer use is off', computerUse: false },
            { name: 'without an Anthropic key', computerUse: true, brains: { keys: { openai: 'k' }, demo: false } },
            { name: 'when this engine has no computer (Linux)', computerUse: true, noComputer: true },
        ]
        for (const c of cases) {
            it(c.name, async () => {
                const computer = { busy: () => false, current: () => null, handle: () => false, start: vi.fn(() => 'Started') }
                const tools: string[][] = []
                const systems: string[] = []
                const complete = model(async (_b, _o, p) => {
                    tools.push(p.tools?.map((t) => t.name) ?? [])
                    systems.push(p.system)
                    return 'ok'
                })
                const { text, transport } = setup(config({ computerUse: c.computerUse }), complete, { computer: c.noComputer ? undefined : computer, brains: c.brains })
                await text('open notepad', c.from ?? OWNER)
                await vi.runAllTimersAsync()
                expect(transport.sent.at(-1)?.body).toBe('ok')
                expect(tools.length).toBeGreaterThan(0)
                for (const names of tools) expect(names).not.toContain('use_computer')
                for (const s of systems) expect(s).not.toMatch(/do tasks on their computer/)
                expect(computer.start).not.toHaveBeenCalled()
            })
        }
    })

    it('lets a Backup see a task the Brain started before it failed', async () => {
        let running: { task: string; conversationId: number } | null = null
        const computer = {
            busy: () => !!running,
            current: () => running,
            handle: () => false,
            start: (task: string, ctx: { conversationId: number }) => ((running = { task, conversationId: ctx.conversationId }), 'Started'),
        }
        const backup: { system: string; tools: string[] }[] = []
        const complete = model(async (_b, option, p) => {
            if (option.id === 'openai:gpt-5.1') {
                await p.tools!.find((t) => t.name === 'use_computer')!.run({ task: 'book Nopa' })
                throw new Error('rate limited')
            }
            backup.push({ system: p.system, tools: p.tools?.map((t) => t.name) ?? [] })
            return 'on it'
        })
        const { text, transport } = setup(config({ computerUse: true }), complete, { computer })
        await text('book nopa', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('on it')
        expect(backup[0].system).toContain("You're already doing a task on their computer (“book Nopa”)")
        expect(backup[0].tools).not.toContain('use_computer')
    })

    it('never takes your text in a group as a task’s answer or as stop', async () => {
        const tasks = new ComputerTasks({ run: async (_t, h) => ((await h.ask('Pay $40?')), { outcome: 'done', summary: 'Paid.', actions: 1 }) })
        const handle = vi.spyOn(tasks, 'handle')
        const complete = model(async () => 'ok')
        const { bubbles, pipeline, store } = setup(config({ computerUse: true }), complete, { computer: tasks })
        const group = { key: 'iMessage;+;chat7', title: 'Plans' }
        await pipeline.receive({ channel: 'bluebubbles', from: OWNER, body: 'Pip, hi all', name: 'Sam', thread: group })
        await vi.runAllTimersAsync()
        // A task reporting to the group's own chat, waiting for an answer
        const id = 1
        expect(store.getConversation(id)?.threadKey).toBe(group.key)
        tasks.start('pay', { agentId: AGENT, agentName: 'Pip', conversationId: id, send: async () => {} })
        await vi.advanceTimersByTimeAsync(0)
        for (const body of ['stop', 'YES']) {
            await pipeline.receive({ channel: 'bluebubbles', from: OWNER, body, name: 'Sam', thread: group })
            // Long enough for a reply, well short of the 30 minutes a question waits
            await vi.advanceTimersByTimeAsync(60_000)
        }
        expect(handle).not.toHaveBeenCalled()
        // Still waiting for an answer
        expect(tasks.busy()).toBe(true)
        expect(bubbles.sent.map((m) => m.body)).toEqual(['ok'])
    })

    it('doesn’t offer use_computer in a group chat you started', async () => {
        const computer = { busy: () => false, current: () => null, handle: vi.fn(() => true), start: vi.fn(() => 'Started') }
        const complete = model(async (_b, _o, p) => (p.tools?.some((t) => t.name === 'use_computer') ? 'had it' : 'ok'))
        const { bubbles, pipeline } = setup(config({ computerUse: true }), complete, { computer })
        await pipeline.receive({ channel: 'bluebubbles', from: OWNER, body: 'Pip, open notepad', name: 'Sam', thread: { key: 'iMessage;+;chat7', title: 'Plans' } })
        await vi.runAllTimersAsync()
        expect(bubbles.sent.at(-1)?.body).toBe('ok')
        // A group text is never taken as the task's answer
        expect(computer.handle).not.toHaveBeenCalled()
    })

    it('reads the Anthropic key when it replies, so a key added later turns use_computer on', async () => {
        const computer = { busy: () => false, current: () => null, handle: () => false, start: () => 'Started' }
        const complete = model(async (_b, _o, p) => (p.tools?.some((t) => t.name === 'use_computer') ? 'had it' : 'no tool'))
        const { text, transport, pipeline } = setup(config({ computerUse: true }), complete, { computer, brains: { keys: { openai: 'k' }, demo: false } })
        await text('open notepad', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tool')
        pipeline.update({ brains: { keys: { openai: 'k', anthropic: 'a' }, demo: false } })
        await text('open notepad', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('had it')
    })

    it('takes your text as the answer while a task waits, instead of replying', async () => {
        const handled: [number, string][] = []
        const computer = { busy: () => true, current: () => null, start: () => 'Started', handle: (id: number, text: string) => (handled.push([id, text]), true) }
        const complete = model(async () => 'should not reply')
        const { text, transport, link } = setup(config({ computerUse: true }), complete, { computer })
        expect(await text('YES', OWNER)).toEqual({ markRead: true })
        await vi.runAllTimersAsync()
        expect(handled.map(([, t]) => t)).toEqual(['YES'])
        expect(complete).not.toHaveBeenCalled()
        expect(transport.sent).toHaveLength(0)
        // Still counted as a text in
        expect(link.total('messagesIn')).toBe(1)
    })

    it('replies as usual while a task runs and isn’t waiting, and says the task is in progress', async () => {
        const computer = { busy: () => true, current: () => ({ task: 'book a table at Nopa', conversationId: 1 }), start: () => 'Started', handle: () => false }
        const complete = model(async () => 'still on it')
        const { text, transport } = setup(config({ computerUse: true }), complete, { computer })
        await text('how’s it going?', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('still on it')
        expect(complete.mock.calls[0]?.[2].system).toContain("You're already doing a task on their computer (“book a table at Nopa”). Tell them it's in progress; they can text stop to cancel it.")
        // Someone else's chat doesn't hear about it
        await text('hi', '+1 212 555 0187')
        await vi.runAllTimersAsync()
        expect(complete.mock.calls.at(-1)?.[2].system).not.toMatch(/doing a task on their computer/)
    })

    it('says a task is in progress only in the chat it reports to; your other chats hear one runs elsewhere', async () => {
        const computer = { busy: () => true, current: () => ({ task: 'book a table at Nopa', conversationId: 999 }), start: () => 'Started', handle: () => false }
        const complete = model(async () => 'hi')
        const { text } = setup(config({ computerUse: true }), complete, { computer })
        await text('hey', OWNER)
        await vi.runAllTimersAsync()
        const system = complete.mock.calls[0]?.[2].system
        expect(system).not.toContain('Nopa')
        expect(system).toContain("You're already doing a task on their computer from another chat; only one runs at a time.")
        // Someone else's chat hears nothing about it
        await text('hi', '+1 212 555 0187')
        await vi.runAllTimersAsync()
        expect(complete.mock.calls.at(-1)?.[2].system).not.toMatch(/task on their computer/)
    })

    it('doesn’t offer use_computer while this computer has a problem, and tells the agent what’s missing', async () => {
        const computer = { busy: () => false, current: () => null, handle: () => false, start: vi.fn(() => 'Started') }
        let problem: string | null = 'Allow Screen Recording for the engine in System Settings → Privacy & Security, then restart it.'
        const complete = model(async (_b, _o, p) => (p.tools?.some((t) => t.name === 'use_computer') ? 'had it' : 'no tool'))
        const { text, transport, pipeline } = setup(config({ computerUse: true }), complete, { computer })
        pipeline.update({ computerProblem: () => problem })
        await text('open Notes', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tool')
        expect(complete.mock.calls[0]?.[2].system).toContain(`Computer use isn't available yet: ${problem}`)
        expect(complete.mock.calls[0]?.[2].system).not.toMatch(/do tasks on their computer/)
        // Strangers never hear about it
        await text('hi', '+1 212 555 0187')
        await vi.runAllTimersAsync()
        expect(complete.mock.calls.at(-1)?.[2].system).not.toMatch(/Computer use/)
        problem = null
        await text('open Notes', OWNER)
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('had it')
    })

    it('says whether it can text into a chat', async () => {
        const { text, pipeline } = setup(config(), model(async () => 'hi'))
        await text('hey', OWNER)
        await vi.runAllTimersAsync()
        expect(pipeline.chatReach(1)).toBe('ready')
        expect(pipeline.chatReach(404)).toBe('gone')
        pipeline.update({ transports: {} })
        expect(pipeline.chatReach(1)).toBe('waiting')
    })

    it('texts you in a chat and keeps it in that chat’s history and counts', async () => {
        const { text, transport, store, link, pipeline } = setup(config(), model(async () => 'hi'))
        await text('hey', OWNER)
        await vi.runAllTimersAsync()
        // Your chat is the first one
        const id = 1
        const before = link.total('messagesOut')
        await pipeline.textInChat(id, 'I was restarted, so I stopped “x”. Text me to start it again.')
        expect(transport.sent.at(-1)?.body).toBe('I was restarted, so I stopped “x”. Text me to start it again.')
        expect(store.history(id, 10).at(-1)?.body).toBe('I was restarted, so I stopped “x”. Text me to start it again.')
        expect(link.total('messagesOut')).toBe(before + 1)
        await expect(pipeline.textInChat(404, 'x')).rejects.toThrow()
    })

    it('fires a reminder from the number you used, and a watch only when something changed', async () => {
        const complete = model(async (_b, _o, p) => (p.turns.at(-1)!.content.includes('Last time: #1') ? '[[no-change]]' : 'Now #2 in Canada'))
        const { pipeline, transport, store } = setup(config(), complete)
        const reminder = store.addJob({ kind: 'reminder', agentId: AGENT, to: OWNER, number: '+1 (415) 555-0101', channel: 'relay', dueAt: 0, everyMin: null, until: null, text: 'stretch' })
        expect(await pipeline.fireJob(store.jobsFor(AGENT).find((j) => j.id === reminder)!)).toEqual({ outcome: 'sent' })
        expect(transport.sent.at(-1)).toMatchObject({ from: '+1 (415) 555-0101', to: OWNER, body: 'Reminder: stretch' })

        const watchId = store.addJob({ kind: 'watch', agentId: AGENT, to: OWNER, number: '+1 (415) 555-0101', channel: 'relay', dueAt: 0, everyMin: 30, until: null, text: 'Uni ranking' })
        store.updateJob(watchId, { last: '#1 in Canada' })
        expect(await pipeline.fireJob(store.jobsFor(AGENT).find((j) => j.id === watchId)!)).toEqual({ outcome: 'unchanged' })
        store.updateJob(watchId, { last: '#3 in Canada' })
        const sent = transport.sent.length
        expect(await pipeline.fireJob(store.jobsFor(AGENT).find((j) => j.id === watchId)!)).toEqual({ outcome: 'sent', result: 'Now #2 in Canada' })
        expect(transport.sent).toHaveLength(sent + 1)
    })

    it('counts an empty watch check as failed, and sends nothing', async () => {
        const { pipeline, transport, store } = setup(config(), model(async () => '   '))
        const id = store.addJob({ kind: 'watch', agentId: AGENT, to: OWNER, number: '+1 (415) 555-0101', channel: 'relay', dueAt: 0, everyMin: 30, until: null, text: 'Uni ranking' })
        const sent = transport.sent.length
        expect(await pipeline.fireJob(store.jobsFor(AGENT).find((j) => j.id === id)!)).toEqual({ outcome: 'failed' })
        expect(transport.sent).toHaveLength(sent)
    })

    it('sends a check-in at its time in your timezone, once a day, and not on other days', async () => {
        const complete = model(async () => 'Sunny, 12°C today')
        const checkIns = [{ id: 'a', days: [3], time: '08:00', what: 'Weather in Saskatoon', on: true }]
        const { pipeline, transport } = setup(config({ workspace: { timezone: 'America/Regina' }, agent: { checkIns } }), complete)
        // Wednesday 2026-10-14, 07:59 in Regina (UTC-6)
        await pipeline.fireCheckIns(Date.parse('2026-10-14T13:59:00Z'))
        expect(transport.sent).toHaveLength(0)
        await pipeline.fireCheckIns(Date.parse('2026-10-14T14:00:30Z'))
        await pipeline.fireCheckIns(Date.parse('2026-10-14T14:01:00Z'))
        expect(transport.sent.map((m) => [m.to, m.body])).toEqual([[OWNER, 'Sunny, 12°C today']])
        // Thursday: not a check-in day
        await pipeline.fireCheckIns(Date.parse('2026-10-15T14:00:30Z'))
        expect(transport.sent).toHaveLength(1)
    })

    it('holds a check-in through quiet hours, then sends it once when they end', async () => {
        const checkIns = [{ id: 'a', days: [3], time: '07:00', what: 'Weather in Saskatoon', on: true }]
        const ws = { timezone: 'America/Regina', quietEnabled: true, quietStart: '22:00', quietEnd: '08:00' }
        const { pipeline, transport } = setup(config({ workspace: ws, agent: { checkIns } }), model(async () => 'Sunny'))
        // 07:30 in Regina: due, but quiet
        await pipeline.fireCheckIns(Date.parse('2026-10-14T13:30:00Z'))
        expect(transport.sent).toHaveLength(0)
        // 08:00 and 08:01: quiet hours are over
        await pipeline.fireCheckIns(Date.parse('2026-10-14T14:00:00Z'))
        await pipeline.fireCheckIns(Date.parse('2026-10-14T14:01:00Z'))
        expect(transport.sent.map((m) => m.body)).toEqual(['Sunny'])
    })

    it('keeps going when one check-in fails, sends nothing for an empty reply, and doesn’t retry either', async () => {
        const complete = model(async (_b, _o, p) => {
            const asked = p.turns.at(-1)!.content
            if (asked.includes('broken')) throw new Error('model down')
            return asked.includes('blank') ? '  ' : 'All good'
        })
        const checkIns = ['broken', 'blank', 'fine'].map((what) => ({ id: what, days: [3], time: '08:00', what, on: true }))
        const { pipeline, transport } = setup(config({ agent: { checkIns } }), complete)
        // Wednesday 08:00 UTC
        await pipeline.fireCheckIns(Date.parse('2026-10-14T08:00:00Z'))
        expect(transport.sent.map((m) => m.body)).toEqual(["Pip's check-in couldn't be sent: model down", 'All good'])
        await pipeline.fireCheckIns(Date.parse('2026-10-14T08:01:00Z'))
        expect(complete).toHaveBeenCalledTimes(3)
    })

    it('sends a check-in that falls inside overnight quiet hours once they end the next morning', async () => {
        const checkIns = [{ id: 'a', days: [3], time: '22:30', what: 'Tomorrow’s weather', on: true }]
        const ws = { timezone: 'America/Regina', quietEnabled: true, quietStart: '22:00', quietEnd: '08:00' }
        const { pipeline, transport, store } = setup(config({ workspace: ws, agent: { checkIns } }), model(async () => 'Rain tomorrow'))
        // Wednesday 22:30 and Thursday 07:59 in Regina: quiet
        await pipeline.fireCheckIns(Date.parse('2026-10-15T04:30:00Z'))
        await pipeline.fireCheckIns(Date.parse('2026-10-15T13:59:00Z'))
        expect(transport.sent).toHaveLength(0)
        // Thursday 08:00 and 08:01: sent once, marked on Wednesday's date
        await pipeline.fireCheckIns(Date.parse('2026-10-15T14:00:00Z'))
        await pipeline.fireCheckIns(Date.parse('2026-10-15T14:01:00Z'))
        expect(transport.sent.map((m) => m.body)).toEqual(['Rain tomorrow'])
        expect(store.getMeta(`checkin:${AGENT}:a:2026-10-14`)).toBe('1')
    })

    it('works out when a local time happens, across daylight saving', () => {
        expect(new Date(zonedTime('2026-10-14', '08:00', 'America/Regina')).toISOString()).toBe('2026-10-14T14:00:00.000Z')
        expect(new Date(zonedTime('2026-07-01', '08:00', 'America/New_York')).toISOString()).toBe('2026-07-01T12:00:00.000Z')
        expect(new Date(zonedTime('2026-01-01', '08:00', 'America/New_York')).toISOString()).toBe('2026-01-01T13:00:00.000Z')
        expect(new Date(zonedTime('2026-03-29', '08:00', 'Europe/London')).toISOString()).toBe('2026-03-29T07:00:00.000Z')
    })

    it('holds check-ins over budget until the cap is raised, and sends none from a paused agent', async () => {
        const checkIns = [{ id: 'a', days: [3], time: '08:00', what: 'Weather', on: true }]
        const { pipeline, transport, link, complete } = setup(config({ agent: { checkIns } }), model(async () => 'Sunny'))
        link.blocked = 'Today’s budget is used up.'
        await pipeline.fireCheckIns(Date.parse('2026-10-14T08:00:00Z'))
        expect(transport.sent).toHaveLength(0)
        expect(complete).not.toHaveBeenCalled()
        // Not marked sent, so it goes once the cap is raised
        link.blocked = null
        await pipeline.fireCheckIns(Date.parse('2026-10-14T09:00:00Z'))
        expect(transport.sent.map((m) => m.body)).toEqual(['Sunny'])

        const paused = setup(config({ agent: { checkIns, status: 'paused' } }), model(async () => 'Sunny'))
        await paused.pipeline.fireCheckIns(Date.parse('2026-10-14T08:00:00Z'))
        expect(paused.transport.sent).toHaveLength(0)
        expect(paused.complete).not.toHaveBeenCalled()
    })

    it('holds a watch for an hour over budget or while paused, but still sends reminders', async () => {
        const add = (store: Store, kind: 'reminder' | 'watch') => {
            const id = store.addJob({ kind, agentId: AGENT, to: OWNER, number: '+1 (415) 555-0101', channel: 'relay', dueAt: 0, everyMin: kind === 'watch' ? 30 : null, until: null, text: 'stretch' })
            return store.jobsFor(AGENT).find((j) => j.id === id)!
        }
        const paused = setup(config({ agent: { status: 'paused' } }))
        expect(await paused.pipeline.fireJob(add(paused.store, 'watch'))).toEqual({ outcome: 'later', inMs: 3_600_000 })
        expect(await paused.pipeline.fireJob(add(paused.store, 'reminder'))).toEqual({ outcome: 'sent' })
        expect(paused.transport.sent.map((m) => m.body)).toEqual(['Reminder: stretch'])
        expect(paused.complete).not.toHaveBeenCalled()

        const over = setup()
        over.link.blocked = 'Today’s budget is used up.'
        expect(await over.pipeline.fireJob(add(over.store, 'watch'))).toEqual({ outcome: 'later', inMs: 3_600_000 })
        expect(await over.pipeline.fireJob(add(over.store, 'reminder'))).toEqual({ outcome: 'sent' })
        expect(over.complete).not.toHaveBeenCalled()
    })

    it('holds a reminder while its channel isn’t running, and sends it once the channel is back', async () => {
        const { pipeline, store } = setup()
        vi.setSystemTime(Date.parse('2026-10-14T12:00:00Z'))
        const id = store.addJob({ kind: 'reminder', agentId: AGENT, to: OWNER, number: '+1 306 555 0199', channel: 'twilio', dueAt: Date.now(), everyMin: null, until: null, text: 'stretch' })
        const scheduler = new Scheduler({ store, now: Date.now, fire: (job) => pipeline.fireJob(job), tellOwner: async () => {}, checkIns: async () => {}, log: () => {} })
        expect(await pipeline.fireJob(store.jobsFor(AGENT)[0])).toEqual({ outcome: 'later', inMs: 5 * 60_000 })
        await scheduler.tick()
        expect(store.jobsFor(AGENT)).toEqual([expect.objectContaining({ id, dueAt: Date.now() + 5 * 60_000 })])

        const twilio = new FakeTransport('twilio')
        pipeline.update({ transports: { twilio } })
        vi.setSystemTime(Date.now() + 5 * 60_000)
        await scheduler.tick()
        await scheduler.tick()
        expect(twilio.sent).toEqual([{ from: '+1 306 555 0199', to: OWNER, body: 'Reminder: stretch' }])
        expect(store.jobsFor(AGENT)).toEqual([])
    })

    it('retries a reminder whose send fails, and drops it after 3 failed sends', async () => {
        const { pipeline, store, transport } = setup()
        vi.setSystemTime(Date.parse('2026-10-14T12:00:00Z'))
        const lines: string[] = []
        store.addJob({ kind: 'reminder', agentId: AGENT, to: OWNER, number: '+1 (415) 555-0101', channel: 'relay', dueAt: Date.now(), everyMin: null, until: null, text: 'stretch' })
        const fire = vi.fn((job: Parameters<Pipeline['fireJob']>[0]) => pipeline.fireJob(job))
        const scheduler = new Scheduler({ store, now: Date.now, fire, tellOwner: async () => {}, checkIns: async () => {}, log: (l) => void lines.push(l) })
        transport.fail = true
        await scheduler.tick()
        expect(store.jobsFor(AGENT)[0]).toMatchObject({ failures: 1, dueAt: Date.now() + RETRY_MS })
        for (let i = 0; i < 3; i++) {
            vi.setSystemTime(Date.now() + RETRY_MS)
            await scheduler.tick()
        }
        expect(fire).toHaveBeenCalledTimes(3)
        expect(store.jobsFor(AGENT)).toEqual([])
        expect(transport.sent).toEqual([])
        // Logged without the reminder's text
        expect(lines.join('\n')).not.toContain('stretch')
        expect(lines.at(-1)).toMatch(/dropped after 3 failed sends/)
    })

    it('sends a check-in from a number that answers for the default agent', async () => {
        const checkIns = [{ id: 'a', days: [3], time: '08:00', what: 'Weather', on: true }]
        const cfg = config({ workspace: { defaultAgentId: AGENT }, agent: { checkIns } })
        cfg.numbers = cfg.numbers.map((n) => ({ ...n, agentId: undefined }))
        const { pipeline, transport } = setup(cfg, model(async () => 'Sunny'))
        await pipeline.fireCheckIns(Date.parse('2026-10-14T08:00:00Z'))
        expect(transport.sent.map((m) => [m.from, m.to, m.body])).toEqual([['+1 (415) 555-0101', OWNER, 'Sunny']])
    })

    it('holds a check-in while its channel isn’t running, and sends it when the channel is back that morning', async () => {
        const checkIns = [{ id: 'a', days: [3], time: '08:00', what: 'Weather', on: true }]
        const { pipeline, transport, complete } = setup(config({ agent: { checkIns } }), model(async () => 'Sunny'))
        pipeline.update({ transports: {} })
        await pipeline.fireCheckIns(Date.parse('2026-10-14T08:00:00Z'))
        expect(complete).not.toHaveBeenCalled()
        pipeline.update({ transports: { relay: transport } })
        await pipeline.fireCheckIns(Date.parse('2026-10-14T09:00:00Z'))
        expect(transport.sent.map((m) => m.body)).toEqual(['Sunny'])
    })

    it('sends a reminder set by text exactly once after the engine restarts', async () => {
        vi.setSystemTime(Date.parse('2026-10-14T20:00:00Z'))
        const complete = model(async (_b, _o, p) => {
            const remind = p.tools?.find((t) => t.name === 'set_reminder')
            return remind ? await remind.run({ in_minutes: 10, text: 'stretch' }) : 'no tools'
        })
        const cfg = config({ workspace: { timezone: 'America/Regina' } })
        const first = setup(cfg, complete)
        await first.text('remind me in 10 minutes to stretch', OWNER)
        await vi.runAllTimersAsync()
        expect(first.transport.sent.at(-1)?.body).toMatch(/^Reminder set/)
        first.pipeline.stop()
        first.store.close()

        // A new engine on the same data folder and key
        const second = setup(cfg, complete)
        const scheduler = new Scheduler({ store: second.store, now: Date.now, fire: (job) => second.pipeline.fireJob(job), tellOwner: async () => {}, checkIns: (now) => second.pipeline.fireCheckIns(now), log: () => {} })
        scheduler.start()
        await vi.advanceTimersByTimeAsync(9 * 60_000)
        expect(second.transport.sent).toEqual([])
        await vi.advanceTimersByTimeAsync(5 * 60_000)
        scheduler.stop()
        expect(second.transport.sent).toEqual([{ from: '+1 (415) 555-0101', to: OWNER, body: 'Reminder: stretch' }])
        expect(second.store.jobsFor(AGENT)).toEqual([])
    })

    it("refuses texts to numbers that aren't yours", async () => {
        const { pipeline } = setup()
        await expect(pipeline.receive({ channel: 'relay', to: '5550000000', from: '2125550187', body: 'hi' })).rejects.toThrow(/isn't one of your/)
    })

    it('uses new keys after an update', async () => {
        const { pipeline, complete, text } = setup()
        pipeline.update({ brains: { keys: { anthropic: 'sk-new' }, demo: false } })
        await text('hello')
        await vi.runAllTimersAsync()
        expect(complete.mock.calls.at(-1)?.[0]).toMatchObject({ keys: { anthropic: 'sk-new' } })
    })

    it('picks queued replies back up after a restart', async () => {
        const first = setup(config({ workspace: { replyDelaySec: 30 } }))
        await first.text('still there?')
        first.pipeline.stop()
        first.store.close()

        const second = setup(config({ workspace: { replyDelaySec: 30 } }))
        second.pipeline.resume()
        await vi.runAllTimersAsync()
        expect(second.transport.sent.at(-1)?.body).toBe('sure, booked for friday')
    })
})

describe('channels and models', () => {
    it('answers a group chat only when named, on its own channel, with who said what', async () => {
        const { bubbles, transport, complete, pipeline } = setup()
        const group = (from: string, body: string, name: string) => pipeline.receive({ channel: 'bluebubbles', from, body, name, thread: { key: 'iMessage;+;chat99', title: 'Book club' } })
        await group('+1 212 555 0187', 'who picks the next book?', 'Dana')
        await vi.runAllTimersAsync()
        expect(complete).not.toHaveBeenCalled()

        await group('+1 212 555 0222', 'Pip, any ideas?', 'Lee')
        await vi.runAllTimersAsync()
        const prompt = complete.mock.calls[0]?.[2]
        expect(prompt?.system).toContain('group chat (Book club)')
        expect(prompt?.turns).toEqual([{ role: 'user', content: 'Dana: who picks the next book?\nLee: Pip, any ideas?' }])
        expect(bubbles.sent.at(-1)).toMatchObject({ from: 'pip@icloud.com', threadKey: 'iMessage;+;chat99', body: 'sure, booked for friday' })
        expect(transport.sent.filter((m) => m.to !== OWNER)).toEqual([])
    })

    it('uses the model picked from the key, and says what to do when the key is gone', async () => {
        const fetch = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi from mini' }] }], model: JSON.parse(String(init?.body)).model })))
        vi.stubGlobal('fetch', fetch)
        const picked = setup(config({ agent: { models: { brain: 'openai:gpt-4o-mini', backup: 'none' } } }), model(realComplete))
        await picked.text('hello')
        await vi.runAllTimersAsync()
        expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).model).toBe('gpt-4o-mini')
        expect(picked.transport.sent.at(-1)?.body).toBe('hi from mini')
        picked.store.close()
        rmSync(dir, { recursive: true, force: true })

        const gone = setup(config({ agent: { models: { brain: 'openai:gpt-4o-mini', backup: 'none' } } }), model(realComplete), { brains: { keys: {}, demo: false }, models: [] })
        await gone.text('hello')
        await vi.runAllTimersAsync()
        expect(gone.transport.sent.at(-1)?.body).toMatch(/Add your OpenAI key in Connections or on your engine so gpt-4o-mini can reply/)
        vi.unstubAllGlobals()
    })

    it('with no AI key at all, asks you to add one', async () => {
        const { transport, text } = setup(config(), model(realComplete), { brains: { keys: {}, demo: false }, models: [] })
        await text('hello')
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toMatch(/Add an AI key in Connections or on your engine, then pick a model on the Models page/)
    })

    it('lists only the chat models a key can use, newest first', async () => {
        const openai = { data: ['gpt-4o-mini', 'whisper-1', 'gpt-5.1', 'text-embedding-3-large', 'gpt-4o-realtime-preview', 'o3', 'dall-e-3', 'gpt-4o-mini-tts'].map((id, i) => ({ id, created: [10, 1, 30, 2, 3, 20, 4, 5][i] })) }
        const google = { models: [
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
            { name: 'models/gemini-2.0-flash-live-001', supportedGenerationMethods: ['generateContent'] },
        ] }
        vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('googleapis') ? google : url.includes('x.ai') ? { data: [{ id: 'grok-4' }, { id: 'grok-2-image' }] } : openai))))
        expect(await listModels('openai', 'k')).toEqual(['gpt-5.1', 'o3', 'gpt-4o-mini'].map((id) => ({ id, label: id })))
        expect(await listModels('google', 'k')).toEqual([{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }])
        expect(await listModels('xai', 'k')).toEqual([{ id: 'grok-4', label: 'grok-4' }])
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
        await expect(listModels('openai', 'bad')).rejects.toThrow('OpenAI rejected this key')
        vi.unstubAllGlobals()
    })
})

describe('mac transport', () => {
    it('reads text that newer macOS keeps only in attributedBody', () => {
        const text = 'hey, are you free later?'
        const blob = Buffer.concat([Buffer.from('\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+', 'latin1'), Buffer.from([text.length]), Buffer.from(text), Buffer.from([0x86])])
        expect(textFromAttributedBody(blob)).toBe(text)
    })

    it('stops cleanly while a text is still being answered, and never takes it twice', async () => {
        // A tiny Messages database with two new texts
        const path = join(dir, 'chat.db')
        const chat = new DatabaseSync(path)
        chat.exec(`CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, handle_id INTEGER, destination_caller_id TEXT, is_from_me INTEGER, item_type INTEGER, service TEXT);
            CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
            CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, style INTEGER);
            CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
            INSERT INTO handle VALUES (1, '+12125550187');
            INSERT INTO chat VALUES (1, 45);`)
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        store.setMeta('mac.lastRowId', '0')
        for (const id of [1, 2]) {
            chat.prepare('INSERT INTO message VALUES (?, ?, NULL, 1, NULL, 0, 0, ?)').run(id, `text ${id}`, id === 1 ? 'iMessage' : 'SMS')
            chat.prepare('INSERT INTO chat_message_join VALUES (1, ?)').run(id)
        }
        chat.close()

        let answer!: () => void
        const onText = vi.fn<(t: Incoming) => Promise<{ markRead: boolean }>>(() => new Promise((resolve) => (answer = () => resolve({ markRead: true }))))
        const mac = new MacTransport(store, path)
        void mac.start(onText)
        await vi.advanceTimersByTimeAsync(0)
        expect(onText).toHaveBeenCalledTimes(1)
        expect(onText.mock.calls[0][0]).not.toHaveProperty('sms')

        // Stopped while the first text is still being answered: it waits for that one, then takes no more
        const stopped = mac.stop()
        answer()
        await stopped
        await vi.advanceTimersByTimeAsync(10_000)
        expect(onText).toHaveBeenCalledTimes(1)
        expect(store.getMeta('mac.lastRowId')).toBe('1')
        expect(vi.getTimerCount()).toBe(0)

        // A new one picks up where it left off
        const next = new MacTransport(store, path)
        const seen: { body: string; sms?: boolean }[] = []
        await next.start(async (t) => {
            seen.push({ body: t.body, sms: t.sms })
            return { markRead: true }
        })
        // An SMS your iPhone forwarded to this Mac says so, so it never counts as you over iMessage
        expect(seen).toEqual([{ body: 'text 2', sms: true }])
        await next.stop()
        store.close()
    })
})
