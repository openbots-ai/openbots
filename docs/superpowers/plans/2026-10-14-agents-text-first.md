# Agents That Act and Text You First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents can use tools over several steps (OpenAI and Claude), set reminders and watches from the owner's texts, send scheduled check-ins, and text the owner first.

**Architecture:** `complete()` in `runner/src/brain.ts` gains a tool loop driven by `Prompt.tools`; the pipeline passes owner-only scheduling tools. Reminders and watches live in a sealed `jobs` table in the engine's store; a `Scheduler` ticks every 30 s and asks the pipeline to fire due jobs and check-ins. Check-ins are agent settings in Convex, edited on the agent page.

**Tech Stack:** Node engine (`runner/`, node:sqlite, fetch, `@anthropic-ai/sdk`), Convex, React dashboard, Vitest (+ convex-test).

**Spec:** `docs/superpowers/specs/2026-10-14-agents-text-first-design.md`

## Global Constraints

- Scheduling tools exist only in owner chats (texts from Settings → Your phone). Strangers never get them.
- Reminders and watches stay on the engine (sealed in its local store), never in Convex. Convex sees only counts per agent.
- Check-ins are agent settings in Convex (`agents.checkIns`), saved by their own mutation so the agent edit form never clears them.
- Tool loop providers: OpenAI (Responses API function calls, alongside `web_search`) and Anthropic (tool use, alongside its web search tool). Gemini, xAI and local: no tools.
- At most 6 model rounds per reply. Watches every ≥ 30 minutes. Limits per agent: 50 active reminders, 10 watches, 5 check-ins.
- Quiet hours hold watch alerts and check-ins until they end; reminders go out on time.
- Never write the word "routines" anywhere (UI, code, docs).
- Engine logs never include message or reminder text.
- Code style: 4-space indent, single quotes, no semicolons, short plain-English comments; read `convex/_generated/ai/guidelines.md` before Convex work.

## Review Focus

1. **Times in the owner's timezone:** "remind me at 5" from Regina must fire at 17:00 America/Regina, not UTC. Test in Task 3 (`set_reminder` with an ISO time carrying `-06:00`).
2. **Engine restart:** a reminder due while the engine was off fires once on start, and a check-in missed earlier the same day fires once, not repeatedly. Tests in Task 2 and Task 4.
3. **The model asks for a reminder in the past or nonsense input:** the tool returns an error string to the model, nothing is stored. Test in Task 3.
4. **A watch that keeps failing** (search errors) texts the owner once after 3 failures and stops. Test in Task 2.
5. **A stranger asks an agent to "remind me tomorrow":** no tools are offered, nothing is scheduled. Test in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `convex/lib/prompt.ts` | `Prompt`-side text: a `canSchedule` line for owner chats. |
| `runner/src/brain.ts` | `Tool` type; `Prompt.tools`; the OpenAI and Anthropic tool loops. |
| `runner/src/brain.test.ts` | Tool loop tests (fake fetch). |
| `runner/src/store.ts` | `jobs` table and its methods. |
| `runner/src/scheduler.ts` (new) | Ticks; decides what's due; next times, failures, expiry; check-in due logic. |
| `runner/src/scheduler.test.ts` (new) | Scheduler tests with a fake pipeline and fake time. |
| `runner/src/tools.ts` (new) | The four scheduling tools for one owner conversation. |
| `runner/src/pipeline.ts` | Passes tools in owner chats; `fireJob`, `fireCheckIn`. |
| `runner/src/agent.test.ts` | End-to-end engine tests for the tools and firing. |
| `convex/schema.ts`, `convex/agents.ts`, `convex/runner.ts` | `checkIns` on agents + `setCheckIns`; `jobs` counts on runners via heartbeat. |
| `convex/checkins.test.ts` (new) | Mutation tests. |
| `runner/src/main.ts`, `runner/src/sync.ts` | Start the scheduler; send job counts with the heartbeat. |
| `src/crm/check-ins.tsx` (new), `src/crm/views/agent-detail.tsx` | Check-ins editor and counts on the agent page. |

---

### Task 1: The tool loop in `complete()`

**Files:**
- Modify: `runner/src/brain.ts`
- Test: `runner/src/brain.test.ts`

**Interfaces:**
- Produces:
  - `export type Tool = { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }; run: (input: Record<string, unknown>) => Promise<string> }`
  - `Prompt` gains `tools?: Tool[]`
  - `export const MAX_ROUNDS = 6`
  - `complete(brains, option, prompt)` unchanged signature; runs tools when `prompt.tools?.length` and the provider is `openai` or `anthropic`.

- [ ] **Step 1: Write the failing tests** (append to `runner/src/brain.test.ts`)

```ts
describe('tools', () => {
    const remind: Tool = {
        name: 'set_reminder',
        description: 'Set a reminder',
        parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        run: vi.fn(async (input) => `Reminder set: ${input.text}`),
    }

    it('runs OpenAI function calls and sends the results back until there is an answer', async () => {
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { output: [{ type: 'function_call', call_id: 'c1', name: 'set_reminder', arguments: '{"text":"stretch"}' }] },
            { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done, I will remind you.' }] }] },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200 })
        })
        expect(await complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [remind] })).toBe('Done, I will remind you.')
        expect(remind.run).toHaveBeenCalledWith({ text: 'stretch' })
        expect(bodies[0].tools).toEqual([{ type: 'web_search', search_context_size: 'low' }, { type: 'function', name: 'set_reminder', description: 'Set a reminder', parameters: remind.parameters }])
        expect(bodies[1].input).toEqual(expect.arrayContaining([{ type: 'function_call_output', call_id: 'c1', output: 'Reminder set: stretch' }]))
    })

    it('gives a failing tool’s error to the model instead of failing the reply', async () => {
        const broken: Tool = { ...remind, run: async () => { throw new Error('that time has passed') } }
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { output: [{ type: 'function_call', call_id: 'c1', name: 'set_reminder', arguments: '{"text":"x"}' }] },
            { output: [{ type: 'message', content: [{ type: 'output_text', text: 'That time has passed.' }] }] },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200 })
        })
        expect(await complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [broken] })).toBe('That time has passed.')
        expect(bodies[1].input).toEqual(expect.arrayContaining([{ type: 'function_call_output', call_id: 'c1', output: 'Error: that time has passed' }]))
    })

    it('stops after 6 rounds of tool calls', async () => {
        vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'c', name: 'set_reminder', arguments: '{"text":"x"}' }] }), { status: 200 }))
        await expect(complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [remind] })).rejects.toThrow(/kept using tools/)
    })

    it('runs Claude tool calls and returns their results as tool_result blocks', async () => {
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { id: 'm1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'set_reminder', input: { text: 'stretch' } }], usage: { input_tokens: 1, output_tokens: 1 } },
            { id: 'm2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Reminder set.' }], usage: { input_tokens: 1, output_tokens: 1 } },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200, headers: { 'Content-Type': 'application/json' } })
        })
        const claude: ModelOption = { id: 'claude-sonnet-5-5', label: 'Claude', provider: 'anthropic', api: 'claude-sonnet-5-5' }
        expect(await complete({ keys: { anthropic: 'k' }, demo: false }, claude, { ...prompt, tools: [remind] })).toBe('Reminder set.')
        const second = bodies[1].messages as { role: string; content: unknown }[]
        expect(second.at(-1)).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Reminder set: stretch' }] })
    })
})
```

Add `type Tool` to the import from `./brain` at the top of the test file: `import { complete, plainCitations, type Tool } from './brain'`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run runner/src/brain.test.ts`
Expected: FAIL (no `Tool` export, tools ignored).

- [ ] **Step 3: Implement** in `runner/src/brain.ts`

1. Replace the `Prompt` type and add `Tool` and `MAX_ROUNDS`:

```ts
// Something the agent can do while writing a reply (set a reminder, start a watch…). `run` gets the model's input
// and returns what to tell it; a thrown error is passed to the model as the result instead of failing the reply.
export type Tool = {
    name: string
    description: string
    parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
    run: (input: Record<string, unknown>) => Promise<string>
}
export type Prompt = { system: string; turns: Turn[]; temperature?: number; maxTokens: number; tools?: Tool[] }

// Model calls per reply when it uses tools: enough for search, act, confirm
export const MAX_ROUNDS = 6

async function runTool(tools: Tool[], name: string, input: unknown) {
    const tool = tools.find((t) => t.name === name)
    if (!tool) return `Error: there is no tool called ${name}`
    try {
        return await tool.run(input && typeof input === 'object' ? (input as Record<string, unknown>) : {})
    } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
}
```

2. Replace `openai()` with the looping version:

```ts
// OpenAI's Responses API, with its web search tool and the agent's own tools. Function calls are run here and their
// outputs sent back with the earlier items, until the model answers.
async function openai(model: string, key: string, p: Prompt) {
    type Item = { type: string; call_id?: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }
    const tools = [{ type: 'web_search', search_context_size: 'low' }, ...(p.tools ?? []).map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }))]
    const input: unknown[] = [...p.turns]
    for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            // Searching and reasoning use output tokens too, so the cap is roomier than the reply itself
            body: JSON.stringify({ model, instructions: p.system, input, max_output_tokens: p.maxTokens * 4, tools }),
        })
        const data = (await res.json().catch(() => null)) as { output?: Item[]; error?: { message?: string } } | null
        if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
        const output = data?.output ?? []
        const calls = output.filter((o) => o.type === 'function_call')
        if (!calls.length) {
            const text = output
                .filter((o) => o.type === 'message')
                .flatMap((o) => o.content ?? [])
                .flatMap((c) => (c.type === 'output_text' && c.text ? [c.text] : []))
                .join('')
            return plainCitations(text)
        }
        input.push(...output)
        for (const call of calls) {
            let args: unknown = {}
            try {
                args = JSON.parse(call.arguments ?? '{}')
            } catch {
                args = {}
            }
            input.push({ type: 'function_call_output', call_id: call.call_id, output: await runTool(p.tools ?? [], call.name ?? '', args) })
        }
    }
    throw new Error('The model kept using tools without answering')
}
```

3. In `anthropic()`: add the agent's tools next to the search tool and handle `tool_use`:

```ts
    const own = (p.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
    for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await client.beta.messages.create({
            model,
            max_tokens: p.maxTokens,
            system: p.system,
            messages,
            tools: [search, ...own],
            ...(isClaude5(model)
                ? { output_config: { effort: 'low' as const }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
                : { temperature: p.temperature }),
        })
        if (res.stop_reason === 'refusal') throw new ReplyError('The model declined to answer this one')
        if (res.stop_reason === 'pause_turn') {
            messages.push({ role: 'assistant', content: res.content })
            continue
        }
        if (res.stop_reason === 'tool_use') {
            messages.push({ role: 'assistant', content: res.content })
            const results = []
            for (const block of res.content) {
                if (block.type !== 'tool_use') continue
                results.push({ type: 'tool_result' as const, tool_use_id: block.id, content: await runTool(p.tools ?? [], block.name, block.input) })
            }
            messages.push({ role: 'user', content: results })
            continue
        }
        return plainCitations(res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''))
    }
    throw new Error('The model kept using tools without answering')
```

(Replace the existing `for (let round = 0; round < 3; round++)` loop and its final `throw` with this; keep `search` and `messages` as they are.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run runner/src/ && npx tsc -p runner --noEmit`
Expected: all pass; typecheck clean. If the SDK's types reject the tool_result content shape, type `results` as `Anthropic.Beta.BetaToolResultBlockParam[]`.

- [ ] **Step 5: Commit**

```bash
git add runner/src/brain.ts runner/src/brain.test.ts
git commit -m "Engine: agents can call tools over several rounds (OpenAI and Claude)"
```

---

### Task 2: Jobs in the store, and the scheduler

**Files:**
- Modify: `runner/src/store.ts`
- Create: `runner/src/scheduler.ts`
- Test: `runner/src/scheduler.test.ts`

**Interfaces:**
- Produces (store):
  - `export type Job = { id: number; kind: 'reminder' | 'watch'; agentId: string; to: string; number: string; channel: Channel; dueAt: number; everyMin: number | null; until: number | null; text: string; last: string | null; failures: number }`
  - `addJob(j: Omit<Job, 'id' | 'last' | 'failures'>): number`
  - `dueJobs(now: number): Job[]` (active, `dueAt <= now`, oldest first, at most 20)
  - `updateJob(id: number, patch: { dueAt?: number; last?: string; failures?: number; active?: boolean }): void`
  - `jobsFor(agentId: string): Job[]` (active)
  - `cancelJob(id: number, agentId: string): boolean`
  - `jobCounts(): { agentId: string; reminders: number; watches: number }[]`
- Produces (scheduler):
  - `export type Fired = { outcome: 'sent' | 'unchanged' | 'failed'; result?: string } | { outcome: 'later'; inMs: number }`
  - `export const WATCH_DAYS = 30`, `export const WATCH_FAILURES = 3`
  - `export class Scheduler { constructor(deps: { store: Store; now: () => number; fire: (job: Job) => Promise<Fired>; tellOwner: (job: Job, text: string) => Promise<void>; checkIns: (now: number) => Promise<void>; log: (line: string) => void }); tick(): Promise<void>; start(everyMs?: number): void; stop(): void }`

- [ ] **Step 1: Write the failing tests** (`runner/src/scheduler.test.ts`)

```ts
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Vault } from './crypto'
import { Scheduler, WATCH_FAILURES, type Fired } from './scheduler'
import { Store, type Job } from './store'

let dir: string
let now = Date.parse('2026-10-14T12:00:00Z')
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sched-'))
    now = Date.parse('2026-10-14T12:00:00Z')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function setup(fire: (job: Job) => Promise<Fired>) {
    const store = new Store(join(dir, 'db'), Vault.open(dir))
    const told: string[] = []
    const scheduler = new Scheduler({ store, now: () => now, fire, tellOwner: async (_j, text) => void told.push(text), checkIns: async () => {}, log: () => {} })
    const job = (over: Partial<Job> = {}) =>
        store.addJob({ kind: 'reminder', agentId: 'a1', to: '+16395550100', number: '+18257731569', channel: 'twilio', dueAt: now + 60_000, everyMin: null, until: null, text: 'stretch', ...over })
    return { store, scheduler, told, job }
}

describe('scheduler', () => {
    it('fires a reminder once when it’s due, then retires it', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent' }))
        const { scheduler, store, job } = setup(fire)
        job()
        await scheduler.tick()
        expect(fire).not.toHaveBeenCalled()
        now += 60_000
        await scheduler.tick()
        await scheduler.tick()
        expect(fire).toHaveBeenCalledTimes(1)
        expect(store.jobsFor('a1')).toEqual([])
    })

    it('fires a reminder that came due while the engine was off, once', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent' }))
        const { scheduler, job } = setup(fire)
        job({ dueAt: now - 3 * 3_600_000 })
        await scheduler.tick()
        await scheduler.tick()
        expect(fire).toHaveBeenCalledTimes(1)
    })

    it('checks a watch on its schedule, keeps what it found, and stops at its end', async () => {
        const results = ['#1 in Canada', '#1 in Canada', '#2 in Canada']
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'sent', result: results.shift() }))
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, until: now + 90 * 60_000, dueAt: now })
        await scheduler.tick()
        expect(store.jobsFor('a1')[0]).toMatchObject({ last: '#1 in Canada', dueAt: now + 30 * 60_000 })
        now += 30 * 60_000
        await scheduler.tick()
        now += 30 * 60_000
        await scheduler.tick()
        now += 30 * 60_000
        await scheduler.tick()
        expect(store.jobsFor('a1')).toEqual([])
        expect(fire).toHaveBeenCalledTimes(3)
    })

    it('waits when the pipeline says later (quiet hours)', async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'later', inMs: 3_600_000 }))
        const { scheduler, store, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now })
        await scheduler.tick()
        expect(store.jobsFor('a1')[0].dueAt).toBe(now + 3_600_000)
    })

    it(`texts you once and stops a watch after ${WATCH_FAILURES} failed checks`, async () => {
        const fire = vi.fn(async (): Promise<Fired> => ({ outcome: 'failed' }))
        const { scheduler, store, told, job } = setup(fire)
        job({ kind: 'watch', everyMin: 30, dueAt: now, text: 'Uni ranking' })
        for (let i = 0; i < WATCH_FAILURES; i++) {
            await scheduler.tick()
            now += 30 * 60_000
        }
        expect(store.jobsFor('a1')).toEqual([])
        expect(told).toHaveLength(1)
        expect(told[0]).toMatch(/stopped watching/)
    })

    it('keeps job text sealed on disk and counts jobs per agent', async () => {
        const { store, job } = setup(async () => ({ outcome: 'sent' }))
        job()
        job({ kind: 'watch', everyMin: 30 })
        expect(store.jobCounts()).toEqual([{ agentId: 'a1', reminders: 1, watches: 1 }])
        expect(store.cancelJob(store.jobsFor('a1')[0].id, 'other-agent')).toBe(false)
    })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run runner/src/scheduler.test.ts`
Expected: FAIL (no `./scheduler`, no `addJob`).

- [ ] **Step 3: Store methods** in `runner/src/store.ts`

Add to the `CREATE TABLE` block:

```sql
            -- Reminders and watches the owner asked for by text; recipient, text and last result are sealed
            CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, agent_id TEXT NOT NULL, recipient TEXT NOT NULL, number TEXT NOT NULL, channel TEXT NOT NULL,
                due_at INTEGER NOT NULL, every_min INTEGER, until INTEGER, text TEXT NOT NULL, last TEXT, failures INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS jobs_due ON jobs (active, due_at);
```

Add the type next to `Message` and these methods to `Store`:

```ts
// A reminder or watch the owner asked for by text. `to` is the owner's handle; `number`/`channel` are what to text from.
export type Job = { id: number; kind: 'reminder' | 'watch'; agentId: string; to: string; number: string; channel: Channel; dueAt: number; everyMin: number | null; until: number | null; text: string; last: string | null; failures: number }
type JobRow = { id: number; kind: Job['kind']; agent_id: string; recipient: string; number: string; channel: Channel; due_at: number; every_min: number | null; until: number | null; text: string; last: string | null; failures: number }
```

```ts
    addJob(j: Omit<Job, 'id' | 'last' | 'failures'>) {
        const id = Number(
            this.db
                .prepare('INSERT INTO jobs (kind, agent_id, recipient, number, channel, due_at, every_min, until, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(j.kind, j.agentId, '', j.number, j.channel, j.dueAt, j.everyMin, j.until, '', Date.now()).lastInsertRowid,
        )
        this.db.prepare('UPDATE jobs SET recipient = ?, text = ? WHERE id = ?').run(this.vault.seal(j.to, `job:${id}:to`), this.vault.seal(j.text, `job:${id}:text`), id)
        return id
    }

    private toJob(r: JobRow): Job {
        return {
            id: r.id,
            kind: r.kind,
            agentId: r.agent_id,
            to: this.vault.open(r.recipient, `job:${r.id}:to`),
            number: r.number,
            channel: r.channel,
            dueAt: r.due_at,
            everyMin: r.every_min,
            until: r.until,
            text: this.vault.open(r.text, `job:${r.id}:text`),
            last: r.last ? this.vault.open(r.last, `job:${r.id}:last`) : null,
            failures: r.failures,
        }
    }

    dueJobs(now: number): Job[] {
        return (this.db.prepare('SELECT * FROM jobs WHERE active = 1 AND due_at <= ? ORDER BY due_at LIMIT 20').all(now) as JobRow[]).map((r) => this.toJob(r))
    }

    jobsFor(agentId: string): Job[] {
        return (this.db.prepare('SELECT * FROM jobs WHERE active = 1 AND agent_id = ? ORDER BY due_at').all(agentId) as JobRow[]).map((r) => this.toJob(r))
    }

    updateJob(id: number, patch: { dueAt?: number; last?: string; failures?: number; active?: boolean }) {
        if (patch.dueAt !== undefined) this.db.prepare('UPDATE jobs SET due_at = ? WHERE id = ?').run(patch.dueAt, id)
        if (patch.last !== undefined) this.db.prepare('UPDATE jobs SET last = ? WHERE id = ?').run(this.vault.seal(patch.last, `job:${id}:last`), id)
        if (patch.failures !== undefined) this.db.prepare('UPDATE jobs SET failures = ? WHERE id = ?').run(patch.failures, id)
        if (patch.active !== undefined) this.db.prepare('UPDATE jobs SET active = ? WHERE id = ?').run(patch.active ? 1 : 0, id)
    }

    // Only the agent that owns it can cancel it
    cancelJob(id: number, agentId: string) {
        return this.db.prepare('UPDATE jobs SET active = 0 WHERE id = ? AND agent_id = ? AND active = 1').run(id, agentId).changes > 0
    }

    jobCounts() {
        const rows = this.db.prepare("SELECT agent_id, SUM(kind = 'reminder') AS reminders, SUM(kind = 'watch') AS watches FROM jobs WHERE active = 1 GROUP BY agent_id").all() as { agent_id: string; reminders: number; watches: number }[]
        return rows.map((r) => ({ agentId: r.agent_id, reminders: Number(r.reminders), watches: Number(r.watches) }))
    }
```

- [ ] **Step 4: Scheduler** (`runner/src/scheduler.ts`)

```ts
import type { Job, Store } from './store'

// Runs reminders and watches when they're due, and asks for check-ins every tick. What firing means (texting,
// checking the web) is the pipeline's job; this file only decides when, and what happens after.

export type Fired = { outcome: 'sent' | 'unchanged' | 'failed'; result?: string } | { outcome: 'later'; inMs: number }

// A watch ends after this long even without an end date, and stops after this many failed checks in a row
export const WATCH_DAYS = 30
export const WATCH_FAILURES = 3

type Deps = {
    store: Store
    now: () => number
    fire: (job: Job) => Promise<Fired>
    tellOwner: (job: Job, text: string) => Promise<void>
    checkIns: (now: number) => Promise<void>
    log: (line: string) => void
}

export class Scheduler {
    private timer?: NodeJS.Timeout
    private running = false

    constructor(private deps: Deps) {}

    start(everyMs = 30_000) {
        this.timer = setInterval(() => void this.tick(), everyMs)
        void this.tick()
    }

    stop() {
        clearInterval(this.timer)
    }

    async tick() {
        // One tick at a time, so a slow check can't fire the same job twice
        if (this.running) return
        this.running = true
        try {
            const now = this.deps.now()
            for (const job of this.deps.store.dueJobs(now)) await this.run(job, now)
            await this.deps.checkIns(now).catch((e) => this.deps.log(`Check-ins failed: ${e instanceof Error ? e.message : String(e)}`))
        } finally {
            this.running = false
        }
    }

    private async run(job: Job, now: number) {
        const { store } = this.deps
        let fired: Fired
        try {
            fired = await this.deps.fire(job)
        } catch (e) {
            this.deps.log(`A ${job.kind} failed: ${e instanceof Error ? e.message : String(e)}`)
            fired = { outcome: 'failed' }
        }
        if (fired.outcome === 'later') return store.updateJob(job.id, { dueAt: now + fired.inMs })
        if (job.kind === 'reminder') return store.updateJob(job.id, { active: false })

        if (fired.outcome === 'failed') {
            const failures = job.failures + 1
            if (failures >= WATCH_FAILURES) {
                store.updateJob(job.id, { active: false, failures })
                await this.deps.tellOwner(job, `I stopped watching "${job.text}" after ${WATCH_FAILURES} checks failed in a row. Ask me again to restart it.`)
                return
            }
            store.updateJob(job.id, { failures, dueAt: now + (job.everyMin ?? 60) * 60_000 })
            return
        }
        const next = now + (job.everyMin ?? 60) * 60_000
        const end = job.until ?? job.dueAt + WATCH_DAYS * 86_400_000
        store.updateJob(job.id, { failures: 0, dueAt: next, ...(fired.result ? { last: fired.result } : {}), ...(next > end ? { active: false } : {}) })
    }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run runner/src/ && npx tsc -p runner --noEmit`
Expected: all pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add runner/src/store.ts runner/src/scheduler.ts runner/src/scheduler.test.ts
git commit -m "Engine: reminders and watches kept sealed, with a scheduler"
```

---

### Task 3: Scheduling tools in owner chats, and firing jobs

**Files:**
- Create: `runner/src/tools.ts`
- Modify: `runner/src/pipeline.ts`, `convex/lib/prompt.ts`
- Test: `runner/src/agent.test.ts`, `convex/lib/prompt.test.ts`

**Interfaces:**
- Consumes: `Tool` (Task 1); `Job`, store job methods (Task 2); `Fired` (Task 2).
- Produces:
  - `export const LIMITS = { reminders: 50, watches: 10 }`, `export const MIN_WATCH_MINUTES = 30`
  - `schedulingTools(ctx: { store: Store; agentId: string; owner: string; number: string; channel: Channel; now: () => number }): Tool[]` — `set_reminder`, `watch`, `list_scheduled`, `cancel_scheduled`
  - `Pipeline.fireJob(job: Job): Promise<Fired>`
  - `systemPrompt` arg `canSchedule?: boolean`

- [ ] **Step 1: Write the failing tests**

In `convex/lib/prompt.test.ts`, add:

```ts
    it('tells the agent about its scheduling tools only when it has them', () => {
        expect(systemPrompt({ ...base, canSchedule: true })).toMatch(/set reminders/)
        expect(systemPrompt(base)).not.toMatch(/set reminders/)
    })
```

In `runner/src/agent.test.ts`, add near the owner-chat tests (they use `OWNER`, `setup`, `model`, `config`):

```ts
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
        expect(transport.sent.at(-1)?.body).toMatch(/Reminder set/)
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

    it('gives someone else no scheduling tools', async () => {
        const complete = model(async (_b, _o, p) => (p.tools?.length ? 'had tools' : 'no tools'))
        const { text, transport } = setup(config(), complete)
        await text('remind me tomorrow', '+1 212 555 0187')
        await vi.runAllTimersAsync()
        expect(transport.sent.at(-1)?.body).toBe('no tools')
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
```

If `setup()` in `agent.test.ts` doesn't already return `store`, add it to its return value. The FakeTransport records `{ from, to, body }`; check its shape near the top of the file and adjust the `toMatchObject` keys to match.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run runner/src/agent.test.ts convex/lib/prompt.test.ts`
Expected: FAIL (no tools passed, no `fireJob`, no `canSchedule`).

- [ ] **Step 3: Prompt line** in `convex/lib/prompt.ts`

Add arg `canSchedule?: boolean` (comment: `// Owner chats get tools to set reminders and watches (see runner/src/tools.ts)`), destructure it, and add after the search line:

```ts
        canSchedule &&
            `You have tools to set reminders, watch something for changes, and list or cancel what you've scheduled. Times are in ${timeZone}; give tools times as ISO 8601 with the offset.`,
```

- [ ] **Step 4: Tools** (`runner/src/tools.ts`)

```ts
import type { Tool } from './brain'
import type { Store } from './store'
import type { Channel } from './transports/types'

// What an agent can schedule while chatting with its owner. Each tool checks its input and throws a plain message
// the model can pass on ("that time has already passed"); the tool loop gives errors to the model.

export const LIMITS = { reminders: 50, watches: 10 }
export const MIN_WATCH_MINUTES = 30

type Ctx = { store: Store; agentId: string; owner: string; number: string; channel: Channel; now: () => number }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined)
const when = (iso: unknown) => {
    const t = typeof iso === 'string' ? Date.parse(iso) : NaN
    return Number.isFinite(t) ? t : undefined
}
const count = (ctx: Ctx, kind: 'reminder' | 'watch') => ctx.store.jobsFor(ctx.agentId).filter((j) => j.kind === kind).length

export function schedulingTools(ctx: Ctx): Tool[] {
    const base = { agentId: ctx.agentId, to: ctx.owner, number: ctx.number, channel: ctx.channel }
    return [
        {
            name: 'set_reminder',
            description: 'Text the owner a reminder at a time. Give either `at` (ISO 8601 with offset) or `in_minutes`.',
            parameters: { type: 'object', properties: { text: { type: 'string', description: 'What to remind them of' }, at: { type: 'string' }, in_minutes: { type: 'number' } }, required: ['text'] },
            run: async (input) => {
                const text = str(input.text)
                if (!text) throw new Error('Say what to remind them of')
                const minutes = num(input.in_minutes)
                const at = minutes !== undefined ? ctx.now() + minutes * 60_000 : when(input.at)
                if (at === undefined) throw new Error('Give a time (`at`) or `in_minutes`')
                if (at <= ctx.now()) throw new Error('That time has already passed')
                if (count(ctx, 'reminder') >= LIMITS.reminders) throw new Error(`There are already ${LIMITS.reminders} reminders; cancel some first`)
                const id = ctx.store.addJob({ ...base, kind: 'reminder', dueAt: at, everyMin: null, until: null, text })
                return `Reminder set (#${id}) for ${new Date(at).toISOString()}`
            },
        },
        {
            name: 'watch',
            description: `Check something on the web on a schedule and text the owner only when it changes. Checks at most every ${MIN_WATCH_MINUTES} minutes.`,
            parameters: { type: 'object', properties: { what: { type: 'string', description: 'What to check, e.g. "the price of …"' }, every_minutes: { type: 'number' }, until: { type: 'string', description: 'ISO 8601, optional' } }, required: ['what'] },
            run: async (input) => {
                const what = str(input.what)
                if (!what) throw new Error('Say what to watch')
                const every = Math.max(MIN_WATCH_MINUTES, Math.round(num(input.every_minutes) ?? 60))
                const until = input.until === undefined ? null : (when(input.until) ?? null)
                if (until !== null && until <= ctx.now()) throw new Error('That end time has already passed')
                if (count(ctx, 'watch') >= LIMITS.watches) throw new Error(`There are already ${LIMITS.watches} watches; cancel one first`)
                const id = ctx.store.addJob({ ...base, kind: 'watch', dueAt: ctx.now(), everyMin: every, until, text: what })
                return `Watching (#${id}), checking every ${every} minutes`
            },
        },
        {
            name: 'list_scheduled',
            description: 'List the reminders and watches this agent has for the owner.',
            parameters: { type: 'object', properties: {} },
            run: async () => {
                const jobs = ctx.store.jobsFor(ctx.agentId)
                if (!jobs.length) return 'Nothing scheduled'
                return jobs.map((j) => (j.kind === 'reminder' ? `#${j.id} reminder at ${new Date(j.dueAt).toISOString()}: ${j.text}` : `#${j.id} watching every ${j.everyMin} min: ${j.text}`)).join('\n')
            },
        },
        {
            name: 'cancel_scheduled',
            description: 'Cancel a reminder or watch by its number from list_scheduled.',
            parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
            run: async (input) => {
                const id = num(input.id)
                if (id === undefined || !ctx.store.cancelJob(id, ctx.agentId)) throw new Error(`There's no #${String(input.id)} to cancel`)
                return `Cancelled #${id}`
            },
        },
    ]
}
```

- [ ] **Step 5: Pipeline** (`runner/src/pipeline.ts`)

1. Import: `import { schedulingTools } from './tools'`, `import type { Job } from './store'`, `import type { Fired } from './scheduler'`, and `Tool` from `./brain`.
2. In the reply method, offer tools only in owner chats whose Brain runs tools (OpenAI or Claude; `complete` ignores tools for the rest, so the agent must not be told it has them). After `models` is computed:

```ts
        const scheduling = owner && TOOL_PROVIDERS.includes(models.brain.option.provider)
```
   then `canSchedule: scheduling,` in the `systemPrompt({...})` call, and on the `prompt` object:
```ts
            tools: scheduling ? schedulingTools({ store, agentId: agent._id, owner: contact.handle, number: conversation.number, channel: conversation.channel, now: this.now }) : undefined,
```
   Add to `runner/src/brain.ts` next to `SEARCHES`: `// The providers whose replies can use the agent's tools` `export const TOOL_PROVIDERS: readonly string[] = ['openai', 'anthropic']`, and import it in the pipeline.
3. Add `fireJob`:

```ts
    // A reminder or watch that came due (see scheduler.ts). Watches hold their alerts through quiet hours.
    async fireJob(job: Job): Promise<Fired> {
        const ws = this.config.workspace
        const agent = this.config.agents.find((a) => a._id === job.agentId)
        if (!agent) return { outcome: 'failed' }
        const transport = this.deps.transports[job.channel]
        if (!transport) return { outcome: 'failed' }
        const text = (body: string) => transport.send({ from: job.number, to: job.to, body })
        if (job.kind === 'reminder') {
            await text(`Reminder: ${job.text}`)
            this.log(`${agent.name} sent a reminder to …${handleKey(job.to)?.slice(-4)}`)
            return { outcome: 'sent' }
        }
        const quiet = ws.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(this.now(), ws.timezone ?? 'UTC', ws.quietStart, ws.quietEnd) : 0
        if (quiet > 0) return { outcome: 'later', inMs: quiet }
        const result = await this.think(agent, `Check this for ${ws.ownerName}: ${job.text}. ${job.last ? `Last time: ${job.last}` : 'This is the first check.'} If nothing that matters changed since last time, reply only [[no-change]]. Otherwise reply with a short text saying what changed.`)
        if (result.includes('[[no-change]]')) return { outcome: 'unchanged' }
        await text(result)
        this.log(`${agent.name} sent a watch update to …${handleKey(job.to)?.slice(-4)}`)
        return { outcome: 'sent', result }
    }

    // One reply from the agent's Brain (or Backup) to an instruction from the engine, for watches and check-ins
    private async think(agent: Doc<'agents'>, instruction: string) {
        const { brains, link } = this.deps
        const ws = this.config.workspace
        const models = resolveModels(ws.models, agent.models, agent.model, keyModels(this.deps.models()))
        const system = systemPrompt({
            agent,
            workspace: ws,
            contact: { name: ws.ownerName, handle: ws.ownerHandle ?? '', tags: [], notes: '' },
            knowledge: this.config.knowledge.filter((k) => !k.agentId || k.agentId === agent._id).slice(0, 100),
            now: this.now(),
            withOwner: true,
            sms: true,
            canSearch: SEARCHES.includes(models.brain.option.provider),
        })
        const text = await this.complete(brains, models.brain.option, { system, turns: [{ role: 'user', content: instruction }], temperature: agent.temperature, maxTokens: MAX_TOKENS.short })
        void link.record(agent._id, { usage: { slot: 'brain', model: models.brain.option.id } }).catch(() => {})
        return text.trim()
    }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run runner/src convex && npx tsc -p runner --noEmit && npx tsc -p convex --noEmit`
Expected: all pass. The reminder test uses `vi.setSystemTime`; the suite already uses fake timers (`vi.useFakeTimers()` in `beforeEach`), so `Date.now()` follows it — make sure the pipeline's `now` defaults to `Date.now`.

- [ ] **Step 7: Commit**

```bash
git add runner/src/tools.ts runner/src/pipeline.ts runner/src/agent.test.ts convex/lib/prompt.ts convex/lib/prompt.test.ts
git commit -m "Agents set reminders and watches when you text them, and send them when due"
```

---

### Task 4: Check-ins (Convex settings + engine firing)

**Files:**
- Modify: `convex/schema.ts`, `convex/agents.ts`, `runner/src/pipeline.ts`
- Create: `convex/checkins.test.ts`
- Test: `runner/src/agent.test.ts`

**Interfaces:**
- Produces:
  - Schema: `export const checkIn = v.object({ id: v.string(), days: v.array(v.number()), time: v.string(), what: v.string(), on: v.boolean() })`; agents table gets `checkIns: v.optional(v.array(checkIn))` (outside `agentFields`, like `computerId`).
  - `api.agents.setCheckIns({ id: Id<'agents'>, checkIns: CheckIn[] })` — owner-only; ≤ 5; `days` ⊂ 0..6 (Sunday = 0), at least one; `time` `HH:MM` 24h; `what` 1–500 chars; ids unique.
  - `Pipeline.fireCheckIns(now: number): Promise<void>` — for every agent's `on` check-ins due today in the workspace timezone, not yet sent today (meta key `checkin:<agentId>:<id>:<YYYY-MM-DD>`), within 6 hours after the time, outside quiet hours: think + text the owner from the agent's first number; mark sent.

- [ ] **Step 1: Write failing Convex tests** (`convex/checkins.test.ts`)

```ts
// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const morning = { id: 'a', days: [1, 2, 3, 4, 5], time: '08:00', what: 'Weather in Saskatoon today', on: true }

async function setup() {
    const base = convexTest(schema, modules)
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const owner = base.withIdentity({ subject: `${userId}|s`, tokenIdentifier: `t|${userId}` })
    await owner.mutation(api.workspace.create, { name: 'W', ownerName: 'Sam', timezone: 'America/Regina' })
    const id = await owner.mutation(api.agents.create, { name: 'Iris', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' })
    return { base, owner, id }
}

describe('check-ins', () => {
    it('saves an agent’s check-ins and keeps them when the agent is edited', async () => {
        const { owner, id } = await setup()
        await owner.mutation(api.agents.setCheckIns, { id, checkIns: [morning] })
        await owner.mutation(api.agents.update, { id, name: 'Iris 2', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' })
        expect((await owner.query(api.agents.get, { id }))?.checkIns).toEqual([morning])
    })

    it('refuses bad times, days, empty text, too many, and other people', async () => {
        const { base, owner, id } = await setup()
        const set = (checkIns: (typeof morning)[]) => owner.mutation(api.agents.setCheckIns, { id, checkIns })
        await expect(set([{ ...morning, time: '25:00' }])).rejects.toThrow(/HH:MM/)
        await expect(set([{ ...morning, days: [] }])).rejects.toThrow(/day/)
        await expect(set([{ ...morning, days: [7] }])).rejects.toThrow(/day/)
        await expect(set([{ ...morning, what: ' ' }])).rejects.toThrow(/what to send/)
        await expect(set(Array.from({ length: 6 }, (_, i) => ({ ...morning, id: String(i) })))).rejects.toThrow(/5 check-ins/)
        await expect(base.mutation(api.agents.setCheckIns, { id, checkIns: [] })).rejects.toThrow(/Sign in/)
    })
})
```

- [ ] **Step 2: Failing engine test** (add to `runner/src/agent.test.ts`)

```ts
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
```

The test `config()` helper builds agents from a partial; if it doesn't accept `checkIns`, widen its `agent` override type to `Partial<Doc<'agents'>>` (it already spreads overrides).

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run convex/checkins.test.ts runner/src/agent.test.ts`
Expected: FAIL.

- [ ] **Step 4: Schema + mutation**

`convex/schema.ts`: add `checkIn` (exported) above the tables and `checkIns: v.optional(v.array(checkIn))` to the agents table next to `computerId`, commented `// Texts the agent sends its owner on a schedule (agent page); set by agents.setCheckIns`.

`convex/agents.ts`:

```ts
// The agent's scheduled check-ins (agent page). Times are in the workspace's timezone; days are 0 = Sunday … 6.
export const setCheckIns = mutation({
    args: { id: v.id('agents'), checkIns: v.array(checkIn) },
    handler: async (ctx, { id, checkIns }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'agents', id)
        if (checkIns.length > 5) throw new Error('An agent can have up to 5 check-ins')
        if (new Set(checkIns.map((c) => c.id)).size !== checkIns.length) throw new Error('Each check-in needs its own id')
        for (const c of checkIns) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)) throw new Error('Give the time as HH:MM, e.g. 08:00')
            if (!c.days.length || c.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Pick at least one day')
            if (!c.what.trim() || c.what.length > 500) throw new Error('Say what to send, in up to 500 characters')
        }
        await ctx.db.patch('agents', id, { checkIns: checkIns.map((c) => ({ ...c, what: c.what.trim() })) })
    },
})
```

(import `checkIn` from `./schema`.) Run `npx convex codegen`.

- [ ] **Step 5: Engine** (`runner/src/pipeline.ts`)

```ts
    // Check-ins due now: the right weekday and time in your timezone, not sent yet today, up to 6 hours late (an engine
    // that was off sends a missed one once), held through quiet hours
    async fireCheckIns(now: number) {
        const { store } = this.deps
        const ws = this.config.workspace
        if (!ws.ownerHandle) return
        const tz = ws.timezone ?? 'UTC'
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]))
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
        const minutes = Number(parts.hour) * 60 + Number(parts.minute)
        const date = `${parts.year}-${parts.month}-${parts.day}`
        const quiet = ws.quietEnabled && ws.quietStart && ws.quietEnd ? msUntilQuietEnds(now, tz, ws.quietStart, ws.quietEnd) : 0
        for (const agent of this.config.agents) {
            for (const c of agent.checkIns ?? []) {
                const [h, m] = c.time.split(':').map(Number)
                const late = minutes - (h * 60 + m)
                const key = `checkin:${agent._id}:${c.id}:${date}`
                if (!c.on || !c.days.includes(day) || late < 0 || late > 360 || store.getMeta(key) || quiet > 0) continue
                const number = this.config.numbers.find((n) => n.agentId === agent._id)
                const transport = number && this.deps.transports[number.channel]
                if (!number || !transport) continue
                store.setMeta(key, '1')
                const body = await this.think(agent, `It's time for your scheduled check-in with ${ws.ownerName}. Send them: ${c.what}`)
                await transport.send({ from: number.handle, to: ws.ownerHandle, body })
                this.log(`${agent.name} sent a check-in`)
            }
        }
    }
```

If `Intl` reports hour `24` at midnight on some platforms, `hourCycle: 'h23'` prevents it.

- [ ] **Step 6: Run tests**

Run: `npx vitest run runner/src convex && npx tsc -p runner --noEmit && npx tsc -p convex --noEmit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/agents.ts convex/checkins.test.ts convex/_generated runner/src/pipeline.ts runner/src/agent.test.ts
git commit -m "Check-ins: an agent texts you on a schedule you set"
```

---

### Task 5: Wire it into the engine (scheduler, heartbeat counts)

**Files:**
- Modify: `runner/src/main.ts`, `runner/src/sync.ts`, `convex/runner.ts`, `convex/schema.ts`
- Test: `convex/runner.test.ts` (heartbeat accepts counts)

**Interfaces:**
- Consumes: `Scheduler` (Task 2), `pipeline.fireJob` / `pipeline.fireCheckIns` (Tasks 3–4), `store.jobCounts()` (Task 2).
- Produces: heartbeat arg `jobs?: { agentId: Id<'agents'>; reminders: number; watches: number }[]` stored on `runners.jobs`.

- [ ] **Step 1: Failing test** (append to `convex/runner.test.ts` inside an existing `describe`, using its `setup()`):

```ts
    it('keeps the engine’s reminder and watch counts per agent', async () => {
        const { base, owner, token, agentId } = await setup()
        await base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [], models: [], channels: [], lines: [], demo: false, jobs: [{ agentId, reminders: 2, watches: 1 }] })
        expect((await owner.query(api.runners.list, {}))[0].jobs).toEqual([{ agentId, reminders: 2, watches: 1 }])
    })
```

- [ ] **Step 2: Run to verify it fails**: `npx vitest run convex/runner.test.ts` → FAIL (unknown arg).

- [ ] **Step 3: Implement**

- `convex/schema.ts` runners table: `// How many reminders and watches each agent has on this engine (counts only; they stay on the engine)` `jobs: v.optional(v.array(v.object({ agentId: v.id('agents'), reminders: v.number(), watches: v.number() }))),`
- `convex/runner.ts` heartbeat args: the same `jobs` validator; add to the size check `|| (status.jobs?.length ?? 0) > 500`.
- `runner/src/sync.ts` `Status`: `jobs?: { agentId: Id<'agents'>; reminders: number; watches: number }[]`.
- `runner/src/main.ts`:
  - after the pipeline is created: 
    ```ts
    const scheduler = new Scheduler({
        store,
        now: Date.now,
        fire: (job) => pipeline.fireJob(job),
        tellOwner: async (job, body) => void (await services.transports[job.channel]?.send({ from: job.number, to: job.to, body }).catch(() => {})),
        checkIns: (now) => pipeline.fireCheckIns(now),
        log: (line) => console.log(line),
    })
    ```
  - after `pipeline.resume()` in the ready handler: `scheduler.start()`.
  - in `beat`: send `{ ...status, services: perService(status.services), jobs: store.jobCounts() as { agentId: Id<'agents'>; reminders: number; watches: number }[] }`.
  - in `shutdown`: `scheduler.stop()` before `pipeline.stop()`.
- `npx convex codegen`.

- [ ] **Step 4: Run all checks**: `npm test && npx tsc -b && npx tsc -p runner --noEmit && npx tsc -p convex --noEmit && npm run lint && npm run runner:build` → all green.

- [ ] **Step 5: Commit**

```bash
git add convex runner/src/main.ts runner/src/sync.ts
git commit -m "Engine runs reminders, watches and check-ins, and reports counts"
```

---

### Task 6: Agent page — check-ins editor and counts

**Files:**
- Create: `src/crm/check-ins.tsx`
- Modify: `src/crm/views/agent-detail.tsx`

**Interfaces:**
- Consumes: `api.agents.setCheckIns`, `runners.list` rows' `jobs` (Tasks 4–5).

- [ ] **Step 1: Component** (`src/crm/check-ins.tsx`)

```tsx
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRun } from './use-run'
import { Btn } from './ui'

type CheckIn = NonNullable<Doc<'agents'>['checkIns']>[number]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fresh = (): CheckIn => ({ id: crypto.randomUUID().slice(0, 8), days: [1, 2, 3, 4, 5], time: '08:00', what: '', on: true })

// Texts this agent sends you on a schedule, in your timezone (Settings). Saved as a whole with its own button, so
// editing the agent elsewhere never touches them.
export function CheckIns({ agent }: { agent: Doc<'agents'> }) {
    const save = useMutation(api.agents.setCheckIns)
    const run = useRun()
    const [list, setList] = useState<CheckIn[]>(agent.checkIns ?? [])
    const dirty = JSON.stringify(list) !== JSON.stringify(agent.checkIns ?? [])
    const edit = (i: number, patch: Partial<CheckIn>) => setList(list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

    return (
        <div className="space-y-3">
            {list.map((c, i) => (
                <div key={c.id} className="space-y-2 rounded-md border border-neutral-200 p-2.5">
                    <div className="flex items-center gap-2">
                        <Input aria-label="Time" type="time" value={c.time} onChange={(e) => edit(i, { time: e.target.value })} className="h-8 w-28" />
                        <div className="flex flex-wrap gap-1">
                            {DAYS.map((d, n) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={c.days.includes(n)}
                                    onClick={() => edit(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() })}
                                    className={cn('rounded px-1.5 py-0.5 text-[11px]', c.days.includes(n) ? 'bg-primary text-primary-foreground' : 'bg-neutral-100 text-neutral-500')}>
                                    {d}
                                </button>
                            ))}
                        </div>
                        <Btn variant="ghost" size="icon-sm" aria-label="Remove check-in" onClick={() => setList(list.filter((_, j) => j !== i))}>
                            <Trash2 />
                        </Btn>
                    </div>
                    <Input aria-label="What to send" value={c.what} onChange={(e) => edit(i, { what: e.target.value })} placeholder="e.g. today's weather in Saskatoon and my first meeting" className="h-8" />
                </div>
            ))}
            <div className="flex gap-2">
                {list.length < 5 && (
                    <Btn onClick={() => setList([...list, fresh()])}>
                        <Plus />
                        Add check-in
                    </Btn>
                )}
                {dirty && (
                    <Btn variant="primary" onClick={() => void run(save({ id: agent._id, checkIns: list }))}>
                        Save check-ins
                    </Btn>
                )}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Agent page** (`src/crm/views/agent-detail.tsx`): add a section above "Computer" in the right column:

```tsx
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-1 flex items-center gap-2 text-[13px] font-medium"><Bell className="size-4 text-neutral-500" />Check-ins</h2>
                            <p className="mb-2 text-[12px] text-neutral-500">Texts {agent.name} sends you on a schedule, in your timezone.</p>
                            <CheckIns agent={agent} />
                            {jobs && (jobs.reminders > 0 || jobs.watches > 0) && (
                                <p className="mt-3 text-[12px] text-neutral-500">
                                    {jobs.reminders} reminder{jobs.reminders === 1 ? '' : 's'} and {jobs.watches} watch{jobs.watches === 1 ? '' : 'es'} active. Text {agent.name} to list or cancel them.
                                </p>
                            )}
                        </section>
```

with `Bell` added to the `lucide-react` import, `import { CheckIns } from '../check-ins'`, and, near the other queries:

```tsx
    const jobs = (computers ?? []).flatMap((r) => r.jobs ?? []).filter((j) => j.agentId === agent._id).reduce((sum, j) => ({ reminders: sum.reminders + j.reminders, watches: sum.watches + j.watches }), { reminders: 0, watches: 0 })
```

(`computers` is the existing `useQuery(api.runners.list)` in that component.)

- [ ] **Step 3: Checks**: `npx tsc -b && npm run lint` → clean. Load the agent page locally and add/save a check-in; reload and see it kept.

- [ ] **Step 4: Commit**

```bash
git add src/crm/check-ins.tsx src/crm/views/agent-detail.tsx
git commit -m "Agent page: check-ins, and how many reminders and watches are active"
```

---

### Task 7: Docs and live check

**Files:**
- Modify: `README.md`, `runner/README.md`, `SECURITY.md`

- [ ] **Step 1: Docs.** README "What the engine can use": add a bullet: "**Reminders, watches and check-ins:** text your agent "remind me at 5 to…" or "text me if … changes"; set check-ins on the agent's page. Reminders and watches are stored on the engine, sealed like messages; Convex only counts them." SECURITY.md "What each party can see": note reminders/watches stay on the engine (Convex sees counts per agent); check-in instructions are agent settings in Convex.
- [ ] **Step 2: Deploy** dev (`npx convex dev --once`), rebuild the engine, restart it against the account in use.
- [ ] **Step 3: Live checks** (from the owner phone): "remind me in 2 minutes to stretch" → a text arrives ~2 minutes later; add a check-in 2 minutes out on the agent page → it arrives; "what do I have scheduled?" → lists the reminder until it fires; "cancel #N" works.
- [ ] **Step 4: Commit**

```bash
git add README.md runner/README.md SECURITY.md
git commit -m "Docs: reminders, watches and check-ins"
```
