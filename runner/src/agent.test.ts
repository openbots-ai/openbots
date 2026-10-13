// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ReplyError, type Brains, type complete } from './brain'
import { Vault } from './crypto'
import { PAUSE_MS, Pipeline, type Activity, type Config, type Link } from './pipeline'
import { Store } from './store'
import { textFromAttributedBody } from './transports/mac'
import type { Outgoing, Transport } from './transports/types'

const AGENT = 'agent1' as Id<'agents'>
const OWNER = '+1 (650) 555-0000'

function config(overrides: { agent?: Partial<Doc<'agents'>>; workspace?: Partial<Config['workspace']> } = {}): Config {
    return {
        workspace: { _id: 'ws' as Id<'workspace'>, _creationTime: 0, name: 'Test', ownerName: 'Sam', timezone: 'UTC', replyDelaySec: 0, ownerHandle: OWNER, ...overrides.workspace },
        agents: [{ _id: AGENT, _creationTime: 0, name: 'Pip', role: 'Assistant', hue: 0, prompt: 'Be brief.', greeting: 'hi', status: 'live', updatedAt: 0, models: { brain: 'gpt-5.1', backup: 'claude-sonnet-5.5' }, ...overrides.agent }],
        numbers: [{ _id: 'n1' as Id<'numbers'>, _creationTime: 0, handle: '+1 (415) 555-0101', key: '4155550101', kind: 'phone', agentId: AGENT }],
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
    readonly name = 'relay'
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

function setup(cfg = config(), complete = model(async () => 'sure, booked for friday')) {
    const vault = Vault.open(dir)
    const store = new Store(join(dir, 'openbots.db'), vault)
    const link = new FakeLink(cfg)
    const transport = new FakeTransport()
    const pipeline = new Pipeline({ store, link, transport, brains, complete, log: () => {} })
    const text = (body: string, from = '+1 212 555 0187') => pipeline.receive({ to: '4155550101', from, body, name: 'Dana' })
    return { store, link, transport, pipeline, complete, text, vault }
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
        expect(link.records.find((r) => r.usage)?.usage).toEqual({ slot: 'brain', model: 'gpt-5.1' })
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
            if (option.id === 'gpt-5.1') throw new Error('rate limited')
            return 'from backup'
        })
        const first = setup(config(), flaky)
        await first.text('hi')
        await vi.runAllTimersAsync()
        expect(first.transport.sent.at(-1)?.body).toBe('from backup')
        expect(first.link.records.find((r) => r.usage)?.usage).toEqual({ slot: 'backup', model: 'claude-sonnet-5.5' })
        first.store.close()
        rmSync(dir, { recursive: true, force: true })

        const broken = setup(config(), model(async () => {
            throw new ReplyError("OPENAI_API_KEY isn't set on your agent")
        }))
        await broken.text('hi')
        await vi.runAllTimersAsync()
        expect(broken.transport.sent.at(-1)).toMatchObject({ to: OWNER, body: expect.stringMatching(/OPENAI_API_KEY isn't set.*failed too/) })
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

    it("ignores your own texts and numbers that aren't yours", async () => {
        const { transport, text, pipeline } = setup()
        expect(await text('ok thanks', OWNER)).toEqual({ markRead: true })
        await vi.runAllTimersAsync()
        expect(transport.sent).toHaveLength(0)
        await expect(pipeline.receive({ to: '5550000000', from: '2125550187', body: 'hi' })).rejects.toThrow(/isn't one of your/)
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

describe('mac transport', () => {
    it('reads text that newer macOS keeps only in attributedBody', () => {
        const text = 'hey, are you free later?'
        const blob = Buffer.concat([Buffer.from('\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+', 'latin1'), Buffer.from([text.length]), Buffer.from(text), Buffer.from([0x86])])
        expect(textFromAttributedBody(blob)).toBe(text)
    })
})
