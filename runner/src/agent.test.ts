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
import { PAUSE_MS, Pipeline, type Activity, type Config, type Link } from './pipeline'
import { Store } from './store'
import { MacTransport, textFromAttributedBody } from './transports/mac'
import type { Channel, Outgoing, Transport } from './transports/types'

const AGENT = 'agent1' as Id<'agents'>
const WS = 'ws' as Id<'workspace'>
const OWNER = '+1 (650) 555-0000'
// What the engine's keys can use
const KEYS: KeyModel[] = [
    { provider: 'openai', id: 'gpt-5.1', label: 'gpt-5.1' },
    { provider: 'openai', id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
]

function config(overrides: { agent?: Partial<Doc<'agents'>>; workspace?: Partial<Config['workspace']> } = {}): Config {
    return {
        workspace: { _id: WS, _creationTime: 0, name: 'Test', ownerName: 'Sam', timezone: 'UTC', replyDelaySec: 0, ownerHandle: OWNER, ...overrides.workspace },
        agents: [{ _id: AGENT, _creationTime: 0, workspaceId: WS, name: 'Pip', role: 'Assistant', hue: 0, prompt: 'Be brief.', greeting: 'hi', status: 'live', updatedAt: 0, ...overrides.agent }],
        numbers: [
            { _id: 'n1' as Id<'numbers'>, _creationTime: 0, workspaceId: WS, handle: '+1 (415) 555-0101', key: '4155550101', kind: 'phone', channel: 'relay', agentId: AGENT },
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

function setup(cfg = config(), complete = model(async () => 'sure, booked for friday'), keys: { brains?: Brains; models?: KeyModel[] } = {}) {
    const vault = Vault.open(dir)
    const store = new Store(join(dir, 'openbots.db'), vault)
    const link = new FakeLink(cfg)
    const transport = new FakeTransport()
    const bubbles = new FakeTransport('bluebubbles')
    const pipeline = new Pipeline({ store, link, transports: { relay: transport, bluebubbles: bubbles }, brains: keys.brains ?? brains, models: () => keys.models ?? KEYS, complete, log: () => {} })
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
        chat.exec(`CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, handle_id INTEGER, destination_caller_id TEXT, is_from_me INTEGER, item_type INTEGER);
            CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
            CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, style INTEGER);
            CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
            INSERT INTO handle VALUES (1, '+12125550187');
            INSERT INTO chat VALUES (1, 45);`)
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        store.setMeta('mac.lastRowId', '0')
        for (const id of [1, 2]) {
            chat.prepare('INSERT INTO message VALUES (?, ?, NULL, 1, NULL, 0, 0)').run(id, `text ${id}`)
            chat.prepare('INSERT INTO chat_message_join VALUES (1, ?)').run(id)
        }
        chat.close()

        let answer!: () => void
        const onText = vi.fn(() => new Promise<{ markRead: boolean }>((resolve) => (answer = () => resolve({ markRead: true }))))
        const mac = new MacTransport(store, path)
        void mac.start(onText)
        await vi.advanceTimersByTimeAsync(0)
        expect(onText).toHaveBeenCalledTimes(1)

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
        const seen: string[] = []
        await next.start(async (t) => {
            seen.push(t.body)
            return { markRead: true }
        })
        expect(seen).toEqual(['text 2'])
        await next.stop()
        store.close()
    })
})
