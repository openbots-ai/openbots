# OpenBots CRM Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hidden, Retell-style operator dashboard at exactly `/crm` where an individual builds and manages their OpenBots iMessage agents, backed by Convex.

**Architecture:** `App.tsx` lazy-loads `src/crm/crm-app.tsx` only when the path is exactly `/crm`; the chunk owns the Convex client, an app shell (sidebar + rounded main panel) and ten views switched by `?view=&id=` query params. Convex holds eight tables with per-table query/mutation modules plus an idempotent seed. Pure logic (routing, view parsing, drafting, text/handle helpers, day bucketing) lives in small modules covered by Vitest.

**Tech Stack:** Vite 8, React 19 (React Compiler), Tailwind v4, lucide-react, Convex 1.x, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-crm-dashboard-design.md`

## Global Constraints

- Only `/crm` (trailing slashes tolerated) renders the CRM; `/crm/<anything>` and other unknown paths redirect to `/` as today. Matching is case-sensitive (`/CRM` → landing).
- No link to `/crm` anywhere on the landing site.
- In-app navigation uses `?view=<view>&id=<id>` only, never path segments.
- Landing bundle must not include Convex or CRM view code (lazy chunk).
- `noindex, nofollow` via runtime `<meta name="robots">` and a Vercel `X-Robots-Tag` header on `/crm`. **Deviation from spec:** no `robots.txt` `Disallow: /crm`, because robots.txt is public and would advertise the hidden path; the header + meta achieve noindex without that.
- Missing `VITE_CONVEX_URL` → setup notice, never a crash.
- No auth, no real iMessage sending, no LLM.
- Code style: 4-space indent, single quotes, no semicolons, `@/` alias, small comments only where non-obvious (match `src/App.tsx`).
- Commit only files this plan touches; the working tree has unrelated uncommitted user changes.

## Review Focus

1. A malformed or stale `?id=` (deleted agent, garbage string) → "not found" state with a back button, not a thrown validator error. Pinned by `agents.get`/`conversations.thread` taking `v.string()` + `normalizeId` (Task 1) and `parseView` tests (Task 2).
2. Deleting an agent or contact that has conversations, numbers, knowledge or broadcasts → cascades/unassigns, no dangling joins showing "Unknown". Pinned by cascade code in Task 1 and manual check in Task 8.
3. Blank or whitespace-only input (agent name, prompt, message, contact handle) → submit disabled / server rejects with a toast. Pinned by `draftFromPrompt('  ')` returning null, `handleKind` tests (Task 2) and server-side `trim` checks (Task 1).
4. Path variants `/crm/`, `/crm//`, `/crm/x`, `/CRM`, `/crmx` → only the first two open the CRM. Pinned by `isCrmPath` tests (Task 2).
5. Clearing an optional field (agent folder/avatar, contact agent) actually removes it. Pinned by server `patch` with explicit keys (undefined removes the field) in Task 1, manual check in Task 8.

---

## File map

```
convex/
  schema.ts            tables + validators
  lib/handles.ts       handleKind() — shared with client
  lib/stats.ts         bucketByDay() — pure
  lib/seedData.ts      seed constants + mulberry32
  lib/cascade.ts       deleteConversation()
  workspace.ts agents.ts numbers.ts contacts.ts knowledge.ts broadcasts.ts conversations.ts analytics.ts seed.ts
src/crm/
  crm-app.tsx          Convex provider, noindex, setup notice (lazy entry)
  shell.tsx            layout, seed-on-empty, view switch
  sidebar.tsx
  ui.tsx               Toolbar, Btn, Table, Dialog, Field, EmptyState, AgentAvatar, StatusBadge, panes
  toast.tsx            ToastProvider
  toast-context.ts     ToastContext + useRun
  nav.ts               NavContext + useNav
  use-view.ts          query-string view state
  use-now.ts
  lib/route.ts view.ts draft.ts text.ts time.ts (+ *.test.ts)
  views/home.tsx agents.tsx agent-detail.tsx knowledge.tsx numbers.tsx broadcasts.tsx conversations.tsx contacts.tsx analytics.tsx settings.tsx
```

---

### Task 1: Convex backend

**Files:**
- Modify: `package.json` (add `convex`), `eslint.config.js`, `vite.config.ts`, `tsconfig.app.json`
- Create: everything under `convex/` listed above

**Interfaces — Produces** (`api.*` used by all UI tasks):
- `workspace.get(): Doc<'workspace'> | null`, `workspace.update({ name, ownerName })`
- `agents.list(): Doc<'agents'>[]` (updatedAt desc), `agents.get({ id: string }): Doc<'agents'> | null`, `agents.create(AgentFields): Id<'agents'>`, `agents.update({ id, ...AgentFields })`, `agents.remove({ id })`
- `numbers.list()`, `numbers.create({ handle, agentId? })`, `numbers.assign({ id, agentId? })`, `numbers.remove({ id })`
- `contacts.list()` (name asc), `contacts.create({ name, handle, tags, notes, agentId? })`, `contacts.update({ id, ...same })`, `contacts.remove({ id })`
- `knowledge.list()`, `knowledge.create({ title, body, agentId? })`, `knowledge.update({ id, ...same })`, `knowledge.remove({ id })`
- `broadcasts.list()`, `broadcasts.create({ title, body, agentId, tag, scheduledFor })`, `broadcasts.send({ id })`, `broadcasts.remove({ id })`
- `conversations.list({ since?: number })` → rows with `contactName, contactHandle, agentName`; `conversations.thread({ id: string })` → `{ conversation, contact, agent, messages } | null`; `conversations.send({ id, body })`
- `analytics.overview()` → `{ agents, agentsLive, contacts, conversations, messages7d, perDay: {day,count}[], perAgent: {agentId,name,avatar,hue,count}[] }`
- `seed.run()` — no-op if a workspace exists
- `handleKind(raw): 'phone' | 'email' | null` and `bucketByDay(times, days, now)` from `convex/lib/*` (imported by client via `@convex/lib/...`)

- [ ] **Step 1: Install and wire config**

Run: `npm install convex && npm install -D vitest`

`vite.config.ts` alias block becomes:

```ts
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@convex': path.resolve(__dirname, './convex'),
    },
```

`tsconfig.app.json` `paths` becomes:

```json
    "paths": {
      "@/*": ["./src/*"],
      "@convex/*": ["./convex/*"]
    }
```

`eslint.config.js`: `globalIgnores(['dist', 'convex/_generated'])`.

`package.json` scripts: add `"test": "vitest run"`.

- [ ] **Step 2: Schema and pure libs**

```ts file=convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const agentStatus = v.union(v.literal('draft'), v.literal('live'), v.literal('paused'))

export const agentFields = {
    name: v.string(),
    role: v.string(),
    avatar: v.optional(v.string()),
    hue: v.number(),
    prompt: v.string(),
    greeting: v.string(),
    status: agentStatus,
    folder: v.optional(v.string()),
}

export default defineSchema({
    workspace: defineTable({ name: v.string(), ownerName: v.string() }),
    agents: defineTable({ ...agentFields, updatedAt: v.number() }),
    numbers: defineTable({
        handle: v.string(),
        kind: v.union(v.literal('phone'), v.literal('email')),
        agentId: v.optional(v.id('agents')),
    }),
    contacts: defineTable({
        name: v.string(),
        handle: v.string(),
        tags: v.array(v.string()),
        notes: v.string(),
        agentId: v.optional(v.id('agents')),
        lastSeenAt: v.optional(v.number()),
    }),
    conversations: defineTable({
        contactId: v.id('contacts'),
        agentId: v.id('agents'),
        lastMessage: v.string(),
        lastAt: v.number(),
    }).index('by_lastAt', ['lastAt']),
    messages: defineTable({
        conversationId: v.id('conversations'),
        from: v.union(v.literal('contact'), v.literal('agent')),
        body: v.string(),
        at: v.number(),
    }).index('by_conversation', ['conversationId', 'at']),
    knowledge: defineTable({
        title: v.string(),
        body: v.string(),
        agentId: v.optional(v.id('agents')),
        updatedAt: v.number(),
    }),
    broadcasts: defineTable({
        title: v.string(),
        body: v.string(),
        agentId: v.id('agents'),
        tag: v.string(),
        scheduledFor: v.number(),
        status: v.union(v.literal('scheduled'), v.literal('sent')),
    }),
})
```

```ts file=convex/lib/handles.ts
// An iMessage handle is either an email or a phone number with at least 7 digits
export function handleKind(raw: string): 'phone' | 'email' | null {
    const h = raw.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return 'email'
    if (/^\+?[\d\s().-]+$/.test(h) && h.replace(/\D/g, '').length >= 7) return 'phone'
    return null
}
```

```ts file=convex/lib/stats.ts
export const DAY = 86_400_000

// Counts timestamps per UTC day for the `days` days ending today, oldest first
export function bucketByDay(times: number[], days: number, now: number) {
    const today = Math.floor(now / DAY)
    const counts = new Array<number>(days).fill(0)
    for (const t of times) {
        const i = days - 1 - (today - Math.floor(t / DAY))
        if (i >= 0 && i < days) counts[i]++
    }
    return counts.map((count, i) => ({
        day: new Date((today - (days - 1 - i)) * DAY).toISOString().slice(0, 10),
        count,
    }))
}
```

```ts file=convex/lib/cascade.ts
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

export async function deleteConversation(ctx: MutationCtx, id: Id<'conversations'>) {
    const messages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', id))
        .collect()
    for (const m of messages) await ctx.db.delete(m._id)
    await ctx.db.delete(id)
}
```

- [ ] **Step 3: Seed data**

```ts file=convex/lib/seedData.ts
export const MIN = 60_000
export const HOUR = 60 * MIN

// Small deterministic PRNG so every fresh deployment gets the same sample data
export function mulberry32(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const SEED_WORKSPACE = { name: "Shidhartha's agents", ownerName: 'Shidhartha' }

type Status = 'draft' | 'live' | 'paused'

export const SEED_AGENTS: { name: string; role: string; hue: number; status: Status; folder: string; prompt: string; greeting: string }[] = [
    { name: 'Ava', role: 'Personal assistant', hue: 330, status: 'live', folder: 'Personal', prompt: 'Keeps my week on track: reminders, errands, orders and small favours. Short, friendly texts, never more than two lines.', greeting: "hey, it's ava. what can I take off your plate?" },
    { name: 'Emily', role: 'Chief of staff', hue: 278, status: 'live', folder: 'Work', prompt: 'Runs my calendar and inbox, chases sign-offs, and summarizes long threads into three bullets.', greeting: "hi, emily here. want today's rundown?" },
    { name: 'Jason', role: 'Copywriter', hue: 30, status: 'live', folder: 'Work', prompt: 'Writes captions, emails and landing copy in our voice: lowercase, short, warm, a little cheeky.', greeting: "jason. send me the draft, I'll make it sing" },
    { name: 'Kai', role: 'Researcher', hue: 160, status: 'live', folder: 'Work', prompt: 'Digs into questions and sends a morning brief. Always cites sources and leads with the answer.', greeting: "kai here. what are we looking into?" },
    { name: 'Leo', role: 'Finance & invoices', hue: 45, status: 'live', folder: 'Business', prompt: 'Sends invoices, nudges late payers politely, and flags subscriptions nobody uses.', greeting: "leo. I've got the books, ask me anything" },
    { name: 'Marcus', role: 'Sales & CRM', hue: 200, status: 'live', folder: 'Business', prompt: 'Works new leads, keeps the pipeline current and drafts follow-ups for anyone who went quiet.', greeting: "marcus here. who should we close this week?" },
    { name: 'Nora', role: 'Customer support', hue: 350, status: 'paused', folder: 'Business', prompt: 'Answers customer questions kindly and quickly, escalates anything about billing to me.', greeting: "hi! I'm nora, how can I help?" },
    { name: 'Sam', role: 'Fitness coach', hue: 120, status: 'draft', folder: 'Personal', prompt: 'Checks in after workouts, adjusts the plan, keeps me honest about sleep.', greeting: "sam here. how did today's session go?" },
]

export const SEED_NUMBERS: { handle: string; agent?: string }[] = [
    { handle: '+1 (415) 555-0101', agent: 'Ava' },
    { handle: '+1 (415) 555-0102', agent: 'Emily' },
    { handle: '+1 (415) 555-0119', agent: 'Kai' },
    { handle: '+1 (628) 555-0177', agent: 'Marcus' },
    { handle: 'leo@opendots.com', agent: 'Leo' },
    { handle: 'support@opendots.com', agent: 'Nora' },
    { handle: '+1 (628) 555-0190' },
]

export const SEED_CONTACTS: { name: string; handle: string; tags: string[]; notes?: string }[] = [
    { name: 'Priya Shah', handle: '+1 (415) 555-0142', tags: ['client', 'vip'], notes: 'Prefers mornings. Renewal in March.' },
    { name: 'Daniel Kim', handle: '+1 (212) 555-0187', tags: ['lead'] },
    { name: 'Maya Okafor', handle: '+1 (646) 555-0133', tags: ['client'] },
    { name: 'Lucas Moreau', handle: 'lucas@moreau.studio', tags: ['vendor'] },
    { name: 'Hana Sato', handle: '+1 (503) 555-0161', tags: ['friend'] },
    { name: 'Owen Brooks', handle: '+1 (312) 555-0124', tags: ['lead'] },
    { name: 'Sofia Rossi', handle: '+1 (305) 555-0158', tags: ['client'] },
    { name: 'Ethan Clarke', handle: '+1 (617) 555-0112', tags: ['lead'] },
    { name: 'Amara Nwosu', handle: '+1 (404) 555-0193', tags: ['vip'], notes: 'Board member. Always loop in Emily.' },
    { name: 'Noah Fischer', handle: '+1 (720) 555-0145', tags: ['client'] },
    { name: 'Isla McKenzie', handle: '+1 (206) 555-0176', tags: ['friend'] },
    { name: 'Mateo García', handle: '+1 (512) 555-0139', tags: ['lead'] },
    { name: 'Chloe Dubois', handle: 'chloe@brightandco.com', tags: ['client'] },
    { name: 'Ravi Menon', handle: '+1 (408) 555-0128', tags: ['vendor'] },
    { name: 'Zoe Park', handle: '+1 (213) 555-0164', tags: ['lead'] },
    { name: 'Felix Wagner', handle: '+1 (929) 555-0117', tags: ['client'] },
    { name: 'Lena Novak', handle: '+1 (773) 555-0182', tags: ['friend'] },
    { name: 'Aiden Walsh', handle: '+1 (617) 555-0150', tags: ['lead'] },
    { name: 'Mila Petrova', handle: '+1 (415) 555-0199', tags: ['client', 'vip'] },
    { name: 'Jonah Levi', handle: '+1 (646) 555-0108', tags: ['vendor'] },
]

// Contact line, then the agent's reply
export const SCRIPTS: Record<string, [string, string][]> = {
    Ava: [
        ['can you remind me to call mom on sunday', "done. sunday at 11, I'll text you then"],
        ["what's on my plate tomorrow?", 'dentist at 9:30, standup at 11, and the plumber window is 2 to 4'],
        ['order more coffee beans', 'same ethiopian as last time? they can be here thursday'],
        ['move my gym session to the evening', 'moved to 6:30pm. your 7:30 call still fits after'],
    ],
    Emily: [
        ['anything I need to sign today?', 'just one: the Northwind proposal. it is flagged in your inbox'],
        ['find 30 min with Priya next week', 'she is free tue 2pm or thu 10am. want me to send tue?'],
        ['summarize the board deck feedback', 'three themes: tighten the hiring plan, show churn by cohort, cut slide 14'],
        ['push my 3pm', 'pushed to 4:15 and let everyone know'],
    ],
    Jason: [
        ['need a caption for the launch post', '"we built the thing you kept asking for." want two more options?'],
        ['make this email less stiff', 'done. cut it by a third and dropped the "per my last email"'],
        ['headline ideas for the pricing page', '1) pay for what your agents do 2) one team, one bill 3) cheaper than an intern'],
        ['proofread the newsletter', 'two typos and a broken footer link, all fixed'],
    ],
    Kai: [
        ['what are people saying about the new iOS update?', 'mostly battery complaints, and everyone likes the new lock screen. sources in your notes'],
        ['compare the three CRMs we shortlisted', 'sent a table. short version: Attio for speed, HubSpot if marketing wants in'],
        ['morning brief please', 'rates held, a competitor raised a series B, and your flight is on time'],
        ['find me 5 podcasts on pricing', 'sent a list. start with the first one, it is the best of the bunch'],
    ],
    Leo: [
        ['did Acme pay yet?', 'not yet, 9 days late. want me to send a friendly nudge?'],
        ['yes nudge them', "sent. I'll follow up friday if nothing lands"],
        ['how much did we spend on software in september', '$2,140 across 23 tools. 4 of them nobody has opened in 60 days'],
        ['send the invoice to Bright & Co', 'sent invoice #1042 for $4,800, due in 14 days'],
    ],
    Marcus: [
        ['any new leads today?', 'two: a dental clinic in Austin and a 12-person agency. both booked intro calls'],
        ['update the Northwind deal', 'moved to negotiation, $18k ARR, next step is legal review'],
        ["who haven't we followed up with?", '6 leads went quiet for a week. I drafted follow-ups, want to see them?'],
        ['send them', "sent all 6. I'll flag any replies to you"],
    ],
    Nora: [
        ['hi, my agent stopped replying', 'sorry about that! I restarted it on our end, can you try texting it again?'],
        ['how do I add a second number?', 'go to iMessage Numbers and hit Add number. takes about a minute'],
        ['can I cancel anytime?', 'yep, no contracts. you can cancel from Settings whenever you like'],
        ['thanks that worked', "glad to hear it! I'm here if anything else comes up"],
    ],
}

export const SEED_KNOWLEDGE: { title: string; agent: string; body: string }[] = [
    { title: 'Pricing & plans', agent: 'Nora', body: 'Personal: free, one agent.\nPro: $20/month, unlimited agents and two numbers.\nNo contracts, cancel any time from Settings.' },
    { title: 'Invoice rules', agent: 'Leo', body: 'Net 14 by default.\nNudge at 3 and 9 days late, friendly tone.\nAfter 21 days, hand it to me.' },
    { title: 'Ideal customer profile', agent: 'Marcus', body: 'Owner-led teams of 2 to 30.\nAlready live in iMessage with their customers.\nSkip enterprise procurement.' },
    { title: 'Brand voice', agent: 'Jason', body: 'lowercase, short, warm, never corporate.\nOne joke per message, maximum.\nNo exclamation marks in headlines.' },
    { title: 'My routines', agent: 'Ava', body: 'Gym mon/wed/fri.\nCall mom on sundays.\nNo meetings before 9:30.' },
]
```

```ts file=convex/seed.ts
import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'
import { handleKind } from './lib/handles'
import { HOUR, MIN, SCRIPTS, SEED_AGENTS, SEED_CONTACTS, SEED_KNOWLEDGE, SEED_NUMBERS, SEED_WORKSPACE, mulberry32 } from './lib/seedData'
import { DAY } from './lib/stats'

// Fills an empty deployment with the mascot team and two weeks of sample activity.
// The workspace row doubles as the "already seeded" marker, so deleting every agent never reseeds.
export const run = mutation({
    args: {},
    handler: async (ctx) => {
        if (await ctx.db.query('workspace').first()) return
        const now = Date.now()
        const rand = mulberry32(7)
        await ctx.db.insert('workspace', SEED_WORKSPACE)

        const agentIds = new Map<string, Id<'agents'>>()
        for (const a of SEED_AGENTS) {
            const avatar = `/avatars/${a.name.toLowerCase()}.webp`
            agentIds.set(a.name, await ctx.db.insert('agents', { ...a, avatar, updatedAt: now - Math.floor(rand() * 10 * DAY) }))
        }

        for (const n of SEED_NUMBERS) {
            await ctx.db.insert('numbers', {
                handle: n.handle,
                kind: handleKind(n.handle) ?? 'phone',
                agentId: n.agent ? agentIds.get(n.agent) : undefined,
            })
        }

        for (const k of SEED_KNOWLEDGE) {
            await ctx.db.insert('knowledge', { title: k.title, body: k.body, agentId: agentIds.get(k.agent), updatedAt: now - Math.floor(rand() * 20 * DAY) })
        }

        const talkers = SEED_AGENTS.filter((a) => SCRIPTS[a.name])
        for (const [i, c] of SEED_CONTACTS.entries()) {
            const agent = talkers[i % talkers.length]
            const agentId = agentIds.get(agent.name)!
            const script = SCRIPTS[agent.name]
            const start = Math.floor(rand() * script.length)
            const pairs = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, k) => script[(start + k) % script.length])
            const msgs = pairs.flatMap(([them, us]) => [
                { from: 'contact' as const, body: them },
                { from: 'agent' as const, body: us },
            ])

            // Newest conversations first; the first few land inside the last day so Live has something to show
            let at = now - Math.floor(i * ((13 * DAY) / SEED_CONTACTS.length) + rand() * 2 * HOUR)
            const times: number[] = []
            for (let k = msgs.length - 1; k >= 0; k--) {
                times[k] = at
                at -= msgs[k].from === 'agent' ? Math.floor((1 + rand() * 3) * MIN) : Math.floor((0.5 + rand() * 5) * HOUR)
            }

            const lastContactAt = times[msgs.length - 2]
            const contactId = await ctx.db.insert('contacts', { name: c.name, handle: c.handle, tags: c.tags, notes: c.notes ?? '', agentId, lastSeenAt: lastContactAt })
            const conversationId = await ctx.db.insert('conversations', { contactId, agentId, lastMessage: msgs[msgs.length - 1].body, lastAt: times[msgs.length - 1] })
            for (const [k, m] of msgs.entries()) await ctx.db.insert('messages', { conversationId, from: m.from, body: m.body, at: times[k] })
        }

        await ctx.db.insert('broadcasts', { title: 'October check-in', body: 'quick one: anything we can help with before the month closes?', agentId: agentIds.get('Marcus')!, tag: 'client', scheduledFor: now + DAY, status: 'scheduled' })
        await ctx.db.insert('broadcasts', { title: 'Intro offer', body: 'hey! we have two onboarding slots left this week, want one?', agentId: agentIds.get('Marcus')!, tag: 'lead', scheduledFor: now - 5 * DAY, status: 'sent' })
    },
})
```

- [ ] **Step 4: Table modules**

```ts file=convex/workspace.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const get = query({
    args: {},
    handler: (ctx) => ctx.db.query('workspace').first(),
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string() },
    handler: async (ctx, args) => {
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')
        const ws = await ctx.db.query('workspace').first()
        if (ws) await ctx.db.patch(ws._id, { name, ownerName })
        else await ctx.db.insert('workspace', { name, ownerName })
    },
})
```

```ts file=convex/agents.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteConversation } from './lib/cascade'
import { agentFields } from './schema'

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('agents').collect()).sort((a, b) => b.updatedAt - a.updatedAt),
})

// Takes a plain string so a stale or hand-edited ?id= resolves to null instead of a validator error
export const get = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const agentId = ctx.db.normalizeId('agents', id)
        return agentId ? ctx.db.get(agentId) : null
    },
})

export const create = mutation({
    args: agentFields,
    handler: async (ctx, args) => {
        const name = args.name.trim()
        if (!name) throw new Error('Give your agent a name')
        return ctx.db.insert('agents', { ...args, name, updatedAt: Date.now() })
    },
})

export const update = mutation({
    args: { id: v.id('agents'), ...agentFields },
    handler: async (ctx, { id, name, role, avatar, hue, prompt, greeting, status, folder }) => {
        if (!name.trim()) throw new Error('Give your agent a name')
        // Explicit keys: an omitted optional (avatar, folder) arrives as undefined, which clears it
        await ctx.db.patch(id, { name: name.trim(), role, avatar, hue, prompt, greeting, status, folder, updatedAt: Date.now() })
    },
})

export const remove = mutation({
    args: { id: v.id('agents') },
    handler: async (ctx, { id }) => {
        for (const n of await ctx.db.query('numbers').collect()) if (n.agentId === id) await ctx.db.patch(n._id, { agentId: undefined })
        for (const c of await ctx.db.query('contacts').collect()) if (c.agentId === id) await ctx.db.patch(c._id, { agentId: undefined })
        for (const k of await ctx.db.query('knowledge').collect()) if (k.agentId === id) await ctx.db.patch(k._id, { agentId: undefined })
        for (const b of await ctx.db.query('broadcasts').collect()) if (b.agentId === id) await ctx.db.delete(b._id)
        for (const c of await ctx.db.query('conversations').collect()) if (c.agentId === id) await deleteConversation(ctx, c._id)
        await ctx.db.delete(id)
    },
})
```

```ts file=convex/numbers.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { handleKind } from './lib/handles'

export const list = query({
    args: {},
    handler: (ctx) => ctx.db.query('numbers').collect(),
})

export const create = mutation({
    args: { handle: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { handle, agentId }) => {
        const kind = handleKind(handle)
        if (!kind) throw new Error('Enter a phone number or an email address')
        return ctx.db.insert('numbers', { handle: handle.trim(), kind, agentId })
    },
})

export const assign = mutation({
    args: { id: v.id('numbers'), agentId: v.optional(v.id('agents')) },
    handler: (ctx, { id, agentId }) => ctx.db.patch(id, { agentId }),
})

export const remove = mutation({
    args: { id: v.id('numbers') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
```

```ts file=convex/contacts.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { deleteConversation } from './lib/cascade'
import { handleKind } from './lib/handles'

const fields = {
    name: v.string(),
    handle: v.string(),
    tags: v.array(v.string()),
    notes: v.string(),
    agentId: v.optional(v.id('agents')),
}

function clean(args: { name: string; handle: string }) {
    const name = args.name.trim()
    const handle = args.handle.trim()
    if (!name) throw new Error('Contact needs a name')
    if (!handleKind(handle)) throw new Error('Enter a phone number or an email address')
    return { name, handle }
}

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('contacts').collect()).sort((a, b) => a.name.localeCompare(b.name)),
})

export const create = mutation({
    args: fields,
    handler: (ctx, args) => ctx.db.insert('contacts', { ...args, ...clean(args) }),
})

export const update = mutation({
    args: { id: v.id('contacts'), ...fields },
    handler: (ctx, { id, tags, notes, agentId, ...rest }) => ctx.db.patch(id, { ...clean(rest), tags, notes, agentId }),
})

export const remove = mutation({
    args: { id: v.id('contacts') },
    handler: async (ctx, { id }) => {
        for (const c of await ctx.db.query('conversations').collect()) if (c.contactId === id) await deleteConversation(ctx, c._id)
        await ctx.db.delete(id)
    },
})
```

```ts file=convex/knowledge.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const fields = { title: v.string(), body: v.string(), agentId: v.optional(v.id('agents')) }

function title(raw: string) {
    const t = raw.trim()
    if (!t) throw new Error('Give the document a title')
    return t
}

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('knowledge').collect()).sort((a, b) => b.updatedAt - a.updatedAt),
})

export const create = mutation({
    args: fields,
    handler: (ctx, args) => ctx.db.insert('knowledge', { ...args, title: title(args.title), updatedAt: Date.now() }),
})

export const update = mutation({
    args: { id: v.id('knowledge'), ...fields },
    handler: (ctx, { id, body, agentId, ...rest }) => ctx.db.patch(id, { title: title(rest.title), body, agentId, updatedAt: Date.now() }),
})

export const remove = mutation({
    args: { id: v.id('knowledge') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
```

```ts file=convex/broadcasts.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
    args: {},
    handler: async (ctx) => (await ctx.db.query('broadcasts').collect()).sort((a, b) => b.scheduledFor - a.scheduledFor),
})

export const create = mutation({
    args: { title: v.string(), body: v.string(), agentId: v.id('agents'), tag: v.string(), scheduledFor: v.number() },
    handler: (ctx, args) => {
        if (!args.title.trim() || !args.body.trim() || !args.tag) throw new Error('Title, message and audience are required')
        return ctx.db.insert('broadcasts', { ...args, title: args.title.trim(), body: args.body.trim(), status: 'scheduled' })
    },
})

// Simulated: marks it sent; nothing leaves the building
export const send = mutation({
    args: { id: v.id('broadcasts') },
    handler: (ctx, { id }) => ctx.db.patch(id, { status: 'sent', scheduledFor: Date.now() }),
})

export const remove = mutation({
    args: { id: v.id('broadcasts') },
    handler: (ctx, { id }) => ctx.db.delete(id),
})
```

```ts file=convex/conversations.ts
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

export const list = query({
    args: { since: v.optional(v.number()) },
    handler: async (ctx, { since }) => {
        const rows = await ctx.db
            .query('conversations')
            .withIndex('by_lastAt', (q) => q.gte('lastAt', since ?? 0))
            .order('desc')
            .collect()
        return Promise.all(
            rows.map(async (c) => {
                const [contact, agent] = await Promise.all([ctx.db.get(c.contactId), ctx.db.get(c.agentId)])
                return { ...c, contactName: contact?.name ?? 'Unknown', contactHandle: contact?.handle ?? '', agentName: agent?.name ?? 'Unknown' }
            }),
        )
    },
})

export const thread = query({
    args: { id: v.string() },
    handler: async (ctx, { id }) => {
        const conversationId = ctx.db.normalizeId('conversations', id)
        const conversation = conversationId && (await ctx.db.get(conversationId))
        if (!conversation) return null
        const [contact, agent] = await Promise.all([ctx.db.get(conversation.contactId), ctx.db.get(conversation.agentId)])
        if (!contact || !agent) return null
        const messages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
            .collect()
        return { conversation, contact, agent, messages }
    },
})

// The operator replies on the agent's behalf; stored only
export const send = mutation({
    args: { id: v.id('conversations'), body: v.string() },
    handler: async (ctx, { id, body }) => {
        const text = body.trim()
        if (!text) throw new Error('Message is empty')
        const at = Date.now()
        await ctx.db.insert('messages', { conversationId: id, from: 'agent', body: text, at })
        await ctx.db.patch(id, { lastMessage: text, lastAt: at })
    },
})
```

```ts file=convex/analytics.ts
import { query } from './_generated/server'
import { DAY, bucketByDay } from './lib/stats'

export const overview = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now()
        const [agents, contacts, conversations, messages] = await Promise.all([
            ctx.db.query('agents').collect(),
            ctx.db.query('contacts').collect(),
            ctx.db.query('conversations').collect(),
            ctx.db.query('messages').collect(),
        ])
        const recent = messages.filter((m) => m.at >= now - 14 * DAY)
        const agentOf = new Map(conversations.map((c) => [c._id, c.agentId]))
        const perAgent = agents
            .map((a) => ({ agentId: a._id, name: a.name, avatar: a.avatar, hue: a.hue, count: recent.filter((m) => agentOf.get(m.conversationId) === a._id).length }))
            .sort((a, b) => b.count - a.count)
        return {
            agents: agents.length,
            agentsLive: agents.filter((a) => a.status === 'live').length,
            contacts: contacts.length,
            conversations: conversations.length,
            messages7d: messages.filter((m) => m.at >= now - 7 * DAY).length,
            perDay: bucketByDay(recent.map((m) => m.at), 14, now),
            perAgent,
        }
    },
})
```

- [ ] **Step 5: Create the Convex deployment (needs the user)**

Ask the user to run `! npx convex dev --once` (logs in, creates the project, writes `.env.local` with `CONVEX_DEPLOYMENT` + `VITE_CONVEX_URL`, generates `convex/_generated`, pushes functions).
Expected: "Convex functions ready!" with no type errors.

- [ ] **Step 6: Verify seed**

Run: `npx convex run seed:run && npx convex data agents --limit 10 && npx convex run analytics:overview`
Expected: 8 agents listed; overview shows `contacts: 20`, `conversations: 20`, non-zero `messages7d`. Running `npx convex run seed:run` again adds nothing (agents still 8).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json eslint.config.js vite.config.ts tsconfig.app.json convex
git commit -m "Add Convex backend for the CRM"
```

---

### Task 2: Pure client helpers with tests

**Files:**
- Create: `src/crm/lib/route.ts`, `view.ts`, `draft.ts`, `text.ts`, `time.ts`, and `src/crm/lib/helpers.test.ts`

**Interfaces — Produces:**
- `isCrmPath(path: string): boolean`
- `VIEWS`, `type View`, `parseView(search: string): { view: View; id?: string }`, `viewHref(view: View, id?: string): string`
- `type AgentStatus`, `type AgentFields`, `AVATARS: string[]`, `hueFor(s): number`, `blankAgent(name, role): AgentFields`, `draftFromPrompt(text): AgentFields | null`, `pickAgentFields(a: AgentFields): AgentFields`
- `matches(q: string, ...fields: (string | undefined)[]): boolean`, `parseTags(s: string): string[]`
- `relativeTime(ts, now): string`, `greetingFor(hour): string`, `dayLabel(day: string): string`

- [ ] **Step 1: Write the failing tests**

```ts file=src/crm/lib/helpers.test.ts
import { describe, expect, it } from 'vitest'
import { handleKind } from '@convex/lib/handles'
import { bucketByDay } from '@convex/lib/stats'
import { blankAgent, draftFromPrompt } from './draft'
import { isCrmPath } from './route'
import { matches, parseTags } from './text'
import { greetingFor, relativeTime } from './time'
import { parseView, viewHref } from './view'

describe('isCrmPath', () => {
    it('matches only /crm with optional trailing slashes', () => {
        expect(isCrmPath('/crm')).toBe(true)
        expect(isCrmPath('/crm/')).toBe(true)
        expect(isCrmPath('/crm//')).toBe(true)
        expect(isCrmPath('/crm/agents')).toBe(false)
        expect(isCrmPath('/CRM')).toBe(false)
        expect(isCrmPath('/crmx')).toBe(false)
        expect(isCrmPath('/')).toBe(false)
    })
})

describe('parseView / viewHref', () => {
    it('falls back to home for missing or unknown views', () => {
        expect(parseView('')).toEqual({ view: 'home', id: undefined })
        expect(parseView('?view=admin')).toEqual({ view: 'home', id: undefined })
    })
    it('reads view and id', () => {
        expect(parseView('?view=agents&id=abc')).toEqual({ view: 'agents', id: 'abc' })
    })
    it('round-trips through viewHref and stays on /crm', () => {
        expect(viewHref('home')).toBe('/crm')
        expect(viewHref('contacts')).toBe('/crm?view=contacts')
        const href = viewHref('agents', 'k57 x&y')
        expect(href.startsWith('/crm?')).toBe(true)
        expect(parseView(href.slice(4))).toEqual({ view: 'agents', id: 'k57 x&y' })
    })
})

describe('draftFromPrompt', () => {
    it('returns null for blank input', () => {
        expect(draftFromPrompt('   ')).toBeNull()
    })
    it('uses a name given with "named"/"called" and infers a role', () => {
        const d = draftFromPrompt('An agent named iris who books my meetings')!
        expect(d.name).toBe('Iris')
        expect(d.role).toBe('Scheduling')
        expect(d.status).toBe('draft')
        expect(d.prompt).toBe('An agent named iris who books my meetings')
    })
    it('picks a stable name and falls back to Assistant', () => {
        const a = draftFromPrompt('help me out with stuff')!
        expect(a.name).toBe(draftFromPrompt('help me out with stuff')!.name)
        expect(a.role).toBe('Assistant')
    })
    it('blankAgent defaults the role', () => {
        expect(blankAgent('Rex', '').role).toBe('Assistant')
    })
})

describe('text helpers', () => {
    it('matches case-insensitively and treats blank queries as match-all', () => {
        expect(matches('', 'x')).toBe(true)
        expect(matches('  ', 'x')).toBe(true)
        expect(matches('AVA', 'Ava', undefined)).toBe(true)
        expect(matches('zz', 'Ava', 'Assistant')).toBe(false)
    })
    it('parses tags', () => {
        expect(parseTags(' Client, vip,,client , ')).toEqual(['client', 'vip'])
    })
    it('classifies handles', () => {
        expect(handleKind('+1 (415) 555-0101')).toBe('phone')
        expect(handleKind('a@b.co')).toBe('email')
        expect(handleKind('123')).toBeNull()
        expect(handleKind('   ')).toBeNull()
        expect(handleKind('hello')).toBeNull()
    })
})

describe('time helpers', () => {
    const now = Date.UTC(2026, 9, 6, 12)
    it('formats relative times', () => {
        expect(relativeTime(now - 10_000, now)).toBe('just now')
        expect(relativeTime(now + 10_000, now)).toBe('just now')
        expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
        expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
        expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')
    })
    it('greets by hour', () => {
        expect(greetingFor(8)).toBe('Good morning')
        expect(greetingFor(14)).toBe('Good afternoon')
        expect(greetingFor(21)).toBe('Good evening')
        expect(greetingFor(2)).toBe('Good evening')
    })
    it('buckets by UTC day, ignoring out-of-range times', () => {
        const day = 86_400_000
        const out = bucketByDay([now, now - 1000, now - day, now - 20 * day, now + 2 * day], 3, now)
        expect(out).toEqual([
            { day: '2026-10-04', count: 0 },
            { day: '2026-10-05', count: 1 },
            { day: '2026-10-06', count: 2 },
        ])
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/crm/lib`
Expected: FAIL — cannot resolve `./draft`, `./route`, etc.

- [ ] **Step 3: Implement**

```ts file=src/crm/lib/route.ts
// The CRM is reachable only at this exact path; nothing links to it
export const isCrmPath = (path: string) => (path.replace(/\/+$/, '') || '/') === '/crm'
```

```ts file=src/crm/lib/view.ts
export const VIEWS = ['home', 'agents', 'knowledge', 'numbers', 'broadcasts', 'conversations', 'contacts', 'analytics', 'live', 'settings'] as const
export type View = (typeof VIEWS)[number]

const isView = (v: string | null): v is View => (VIEWS as readonly (string | null)[]).includes(v)

// Views live in the query string so the path itself never leaves /crm
export function parseView(search: string): { view: View; id?: string } {
    const params = new URLSearchParams(search)
    const view = params.get('view')
    return { view: isView(view) ? view : 'home', id: params.get('id') ?? undefined }
}

export function viewHref(view: View, id?: string) {
    const params = new URLSearchParams()
    if (view !== 'home') params.set('view', view)
    if (id) params.set('id', id)
    const q = params.toString()
    return q ? `/crm?${q}` : '/crm'
}
```

```ts file=src/crm/lib/draft.ts
export type AgentStatus = 'draft' | 'live' | 'paused'

export type AgentFields = {
    name: string
    role: string
    avatar?: string
    hue: number
    prompt: string
    greeting: string
    status: AgentStatus
    folder?: string
}

export const AVATARS = ['ava', 'emily', 'jason', 'kai', 'leo', 'marcus', 'nora', 'sam'].map((n) => `/avatars/${n}.webp`)

const NAMES = ['Iris', 'Milo', 'June', 'Otis', 'Pia', 'Rex', 'Tess', 'Wren', 'Arlo', 'Nell']

const ROLES: [RegExp, string][] = [
    [/invoice|bill|pay|financ|expense|book ?keep/i, 'Finance'],
    [/sale|lead|crm|pipeline|deal|prospect/i, 'Sales'],
    [/schedul|calendar|meeting|book/i, 'Scheduling'],
    [/support|customer|help ?desk|ticket/i, 'Support'],
    [/research|brief|news|find out|digest/i, 'Research'],
    [/writ|copy|caption|post|email|newsletter/i, 'Writing'],
    [/fitness|workout|gym|health|coach/i, 'Coach'],
]

export const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export const blankAgent = (name: string, role: string): AgentFields => ({
    name,
    role: role || 'Assistant',
    hue: hueFor(name),
    prompt: '',
    greeting: `hey, it's ${name.toLowerCase()}. what can I help with?`,
    status: 'draft',
})

// No LLM: pull a name if one was given, guess a role from keywords, keep the text as the prompt
export function draftFromPrompt(text: string): AgentFields | null {
    const prompt = text.trim()
    if (!prompt) return null
    const named = prompt.match(/\b(?:named|called)\s+([a-z][a-z'-]*)/i)?.[1]
    const name = named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : NAMES[hueFor(prompt) % NAMES.length]
    const role = ROLES.find(([re]) => re.test(prompt))?.[1] ?? 'Assistant'
    return { ...blankAgent(name, role), prompt }
}

export const pickAgentFields = ({ name, role, avatar, hue, prompt, greeting, status, folder }: AgentFields): AgentFields => ({ name, role, avatar, hue, prompt, greeting, status, folder })
```

Note the Scheduling test: "books my meetings" matches `/schedul|calendar|meeting|book/` but `ROLES` is checked in order and `/invoice|bill|pay|financ|expense|book ?keep/` must not match "books" — `book ?keep` requires "keep", so it does not. Good.

```ts file=src/crm/lib/text.ts
export function matches(q: string, ...fields: (string | undefined)[]) {
    const needle = q.trim().toLowerCase()
    return !needle || fields.some((f) => f?.toLowerCase().includes(needle))
}

export const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
```

```ts file=src/crm/lib/time.ts
export function relativeTime(ts: number, now: number) {
    const s = Math.round((now - ts) / 1000)
    if (s < 60) return 'just now'
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const formatWhen = (ts: number) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const greetingFor = (hour: number) => (hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening')

// "2026-10-06" (a UTC day key) → "Oct 6"
export const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/crm/lib
git commit -m "Add CRM routing, view and drafting helpers with tests"
```

---

### Task 3: Route gate, lazy entry, shell and sidebar

**Files:**
- Modify: `src/App.tsx`, `vercel.json`
- Create: `src/crm/crm-app.tsx`, `shell.tsx`, `sidebar.tsx`, `ui.tsx`, `toast.tsx`, `toast-context.ts`, `nav.ts`, `use-view.ts`, `use-now.ts`. Shell imports the views from Tasks 4–7, so the build only passes once those exist. **Order:** write this task's files, then do Tasks 4–7, then run Step 5 of this task.

**Interfaces — Produces:**
- `useNav(): (view: View, id?: string) => void`
- `useRun(): <T>(p: Promise<T>) => Promise<{ ok: true; value: T } | { ok: false }>`
- `useNow(intervalMs?): number`
- UI kit from `ui.tsx`: `Toolbar, SearchInput, Btn, Table, Row, Cell, SkeletonRows, EmptyState, NotFound, AgentAvatar, Initials, StatusBadge, Dialog, Field, inputCls, SidePane, PaneItem, PaneLabel, Content, Scroll, ConfirmDelete`

- [ ] **Step 1: App gate**

`src/App.tsx`: add imports and replace the default export (keep `Landing`, `comingSoon`, `Page` unchanged):

```tsx
import { lazy, Suspense } from 'react'
import { isCrmPath } from '@/crm/lib/route'

// Loaded only on /crm so the landing bundle never ships Convex or the dashboard
const CrmApp = lazy(() => import('@/crm/crm-app'))
```

```tsx
export default function App() {
    if (isCrmPath(window.location.pathname)) {
        return (
            <Suspense fallback={null}>
                <CrmApp />
            </Suspense>
        )
    }

    return (
        <MotionConfig reducedMotion="user">
            <ReactLenis
                root
                options={{ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9, anchors: { offset: -80 } }}
            />
            <Page />
        </MotionConfig>
    )
}
```

`vercel.json`: add

```json
    "headers": [{ "source": "/crm", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }]
```

- [ ] **Step 2: Contexts and hooks**

```ts file=src/crm/nav.ts
import { createContext, useContext } from 'react'
import type { View } from './lib/view'

export const NavContext = createContext<(view: View, id?: string) => void>(() => {})
export const useNav = () => useContext(NavContext)
```

```ts file=src/crm/toast-context.ts
import { createContext, useContext } from 'react'

export const ToastContext = createContext<(message: string) => void>(() => {})

// Wraps a mutation so a failure shows as a toast instead of an unhandled rejection
export function useRun() {
    const notify = useContext(ToastContext)
    return async <T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
        try {
            return { ok: true, value: await p }
        } catch (e) {
            // Convex prefixes server errors with request metadata; keep the human part
            const msg = e instanceof Error ? e.message : String(e)
            notify(msg.match(/Uncaught Error: (.*?)(?:\n|\s+at |$)/)?.[1] ?? 'Something went wrong. Try again.')
            return { ok: false }
        }
    }
}
```

```ts file=src/crm/use-now.ts
import { useEffect, useState } from 'react'

// A clock that ticks once a minute, so relative times stay fresh without calling Date.now() in render
export function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(t)
    }, [intervalMs])
    return now
}
```

```ts file=src/crm/use-view.ts
import { useCallback, useEffect, useState } from 'react'
import { parseView, viewHref, type View } from './lib/view'

export function useView() {
    const [state, setState] = useState(() => parseView(window.location.search))

    useEffect(() => {
        const onPop = () => setState(parseView(window.location.search))
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    const go = useCallback((view: View, id?: string) => {
        window.history.pushState(null, '', viewHref(view, id))
        setState({ view, id })
    }, [])

    return { ...state, go }
}
```

```tsx file=src/crm/toast.tsx
import { useEffect, useState, type ReactNode } from 'react'
import { ToastContext } from './toast-context'

export function ToastProvider({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!message) return
        const t = setTimeout(() => setMessage(null), 4000)
        return () => clearTimeout(t)
    }, [message])

    return (
        <ToastContext value={setMessage}>
            {children}
            {message && (
                <div role="status" className="fixed right-4 bottom-4 z-60 max-w-sm rounded-lg bg-neutral-900 px-4 py-3 text-[13px] text-white shadow-lg">
                    {message}
                </div>
            )}
        </ToastContext>
    )
}
```

- [ ] **Step 3: UI kit**

```tsx file=src/crm/ui.tsx
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Search, SearchX, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const inputCls = 'h-9 w-full rounded-md border border-neutral-200 bg-white px-2.5 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400'

export function Toolbar({ title, children }: { title: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-2.5">
            <h1 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-neutral-900">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
    )
}

export function SearchInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
    return (
        <label className={cn('relative block', className)}>
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-400" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search..."
                className={cn(inputCls, 'h-8 pl-8', !className && 'w-44 sm:w-56')}
            />
        </label>
    )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }

export function Btn({ variant = 'secondary', className, ...props }: BtnProps) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5',
                {
                    primary: 'bg-neutral-900 text-white hover:bg-neutral-800',
                    secondary: 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50',
                    ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
                }[variant],
                className,
            )}
        />
    )
}

// Two-step delete so nothing is lost to a stray click (and no window.confirm)
export function ConfirmDelete({ onConfirm, label = 'Delete' }: { onConfirm: () => void; label?: string }) {
    const [armed, setArmed] = useState(false)
    return armed ? (
        <span className="flex items-center gap-1.5">
            <Btn variant="ghost" onClick={() => setArmed(false)}>Keep</Btn>
            <Btn variant="danger" onClick={onConfirm}>Confirm delete</Btn>
        </span>
    ) : (
        <Btn variant="danger" onClick={() => setArmed(true)}>{label}</Btn>
    )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto px-4 py-3">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
                <thead>
                    <tr>
                        {head.map((h, i) => (
                            <th key={i} className={cn('bg-neutral-50 px-3 py-2.5 font-medium text-neutral-500', i === 0 && 'rounded-l-md', i === head.length - 1 && 'rounded-r-md')}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    )
}

export function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
    return (
        <tr onClick={onClick} className={cn('group', onClick && 'cursor-pointer')}>
            {children}
        </tr>
    )
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
    return <td className={cn('border-b border-neutral-100 px-3 py-3 text-neutral-700 group-hover:bg-neutral-50/80', className)}>{children}</td>
}

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                    {Array.from({ length: cols }, (_, c) => (
                        <td key={c} className="border-b border-neutral-100 px-3 py-4">
                            <div className="h-4 animate-pulse rounded bg-neutral-100" />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-3 grid size-10 place-items-center rounded-lg bg-neutral-100 text-neutral-500">
                <Icon className="size-5" />
            </div>
            <p className="text-sm font-medium text-neutral-900">{title}</p>
            <p className="mt-1 max-w-xs text-[13px] text-neutral-500">{body}</p>
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}

export function NotFound({ what, onBack }: { what: string; onBack: () => void }) {
    return (
        <Content>
            <EmptyState icon={SearchX} title={`This ${what} doesn't exist`} body="It may have been deleted, or the link is wrong." action={<Btn onClick={onBack}>Go back</Btn>} />
        </Content>
    )
}

export function AgentAvatar({ agent, size = 28 }: { agent: { name: string; avatar?: string; hue: number }; size?: number }) {
    return agent.avatar ? (
        <img src={agent.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full bg-neutral-100 object-cover" style={{ width: size, height: size }} />
    ) : (
        <span
            className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
            style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${agent.hue} 55% 52%)` }}
        >
            {agent.name.slice(0, 1).toUpperCase()}
        </span>
    )
}

export function Initials({ name, size = 32 }: { name: string; size?: number }) {
    const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    return (
        <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-neutral-300 to-neutral-400 font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
            {initials}
        </span>
    )
}

const BADGE: Record<string, string> = {
    live: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    draft: 'bg-neutral-100 text-neutral-600 ring-neutral-500/15',
    paused: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    scheduled: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    sent: 'bg-neutral-100 text-neutral-600 ring-neutral-500/15',
}

export function StatusBadge({ status }: { status: string }) {
    return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset', BADGE[status])}>{status}</span>
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/25 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-200/70 px-5 py-3.5">
                    <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="space-y-3.5 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200/70 px-5 py-3">{footer}</div>}
            </div>
        </div>
    )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-neutral-600">{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
        </label>
    )
}

export function SidePane({ children }: { children: ReactNode }) {
    return <aside className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-neutral-200/70 p-2 md:flex">{children}</aside>
}

export function PaneItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn('flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-100 [&_svg]:size-4', active && 'bg-neutral-100 font-medium text-neutral-900')}
        >
            {children}
        </button>
    )
}

export function PaneLabel({ children }: { children: ReactNode }) {
    return <p className="px-2.5 pt-4 pb-1 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{children}</p>
}

export function Content({ children }: { children: ReactNode }) {
    return <section className="flex min-w-0 flex-1 flex-col">{children}</section>
}

export function Scroll({ children }: { children: ReactNode }) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
}
```

- [ ] **Step 4: Entry, shell, sidebar**

```tsx file=src/crm/crm-app.tsx
import { useEffect } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { Shell } from './shell'
import { ToastProvider } from './toast'

const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const client = url ? new ConvexReactClient(url) : null

export default function CrmApp() {
    // Belt and braces with the X-Robots-Tag header in vercel.json
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.name = 'robots'
        meta.content = 'noindex, nofollow'
        document.head.append(meta)
        document.title = 'OpenBots CRM'
        return () => meta.remove()
    }, [])

    if (!client) {
        return (
            <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
                <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-[14px] text-neutral-600">
                    <h1 className="text-base font-semibold text-neutral-900">Connect Convex</h1>
                    <p className="mt-2">
                        <code className="rounded bg-neutral-100 px-1">VITE_CONVEX_URL</code> isn't set. Run <code className="rounded bg-neutral-100 px-1">npx convex dev</code> locally (it writes
                        .env.local), or add the variable in Vercel and redeploy.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <ConvexProvider client={client}>
            <ToastProvider>
                <Shell />
            </ToastProvider>
        </ConvexProvider>
    )
}
```

```tsx file=src/crm/sidebar.tsx
import type { MouseEvent } from 'react'
import { BookOpen, Bot, ChartLine, ChevronsUpDown, CircleHelp, Contact, CreditCard, House, Megaphone, MessageCircle, MessagesSquare, Radio, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { CONTACT_EMAIL } from '@/lib/site'
import { viewHref, type View } from './lib/view'
import { useNav } from './nav'

const GROUPS: { label?: string; items: { view: View; label: string; icon: LucideIcon }[] }[] = [
    { items: [{ view: 'home', label: 'Home', icon: House }] },
    { label: 'Build', items: [{ view: 'agents', label: 'Agents', icon: Bot }, { view: 'knowledge', label: 'Knowledge', icon: BookOpen }] },
    { label: 'Deploy', items: [{ view: 'numbers', label: 'iMessage Numbers', icon: MessageCircle }, { view: 'broadcasts', label: 'Broadcasts', icon: Megaphone }] },
    { label: 'Data', items: [{ view: 'conversations', label: 'Conversations', icon: MessagesSquare }, { view: 'contacts', label: 'Contacts', icon: Contact }] },
    { label: 'Monitor', items: [{ view: 'analytics', label: 'Analytics', icon: ChartLine }, { view: 'live', label: 'Live', icon: Radio }] },
    { label: 'System', items: [{ view: 'settings', label: 'Settings', icon: Settings }] },
]

export function Sidebar({ view, workspace, onNavigate }: { view: View; workspace?: Doc<'workspace'> | null; onNavigate?: () => void }) {
    const go = useNav()

    // Real hrefs so cmd-click opens a tab; plain clicks stay in-app
    const link = (target: View) => (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        go(target)
        onNavigate?.()
    }

    return (
        <aside className="flex h-full w-60 flex-col bg-[#f5f5f7] px-3 py-3">
            <a href="/crm" onClick={link('home')} className="flex items-center gap-2 px-1.5 pb-3">
                <img src="/favicon.svg" alt="" className="size-5" />
                <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
            </a>

            <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 shadow-xs">
                <span className="grid size-8 place-items-center rounded-md bg-primary-gradient text-sm font-semibold text-white">{workspace?.name.slice(0, 1).toUpperCase() ?? ''}</span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[10px] text-neutral-400">Workspace</span>
                    <span className="block truncate text-[13px] font-semibold">{workspace?.name ?? '…'}</span>
                </span>
                <ChevronsUpDown className="size-3.5 text-neutral-400" />
            </div>

            <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
                {GROUPS.map((group, i) => (
                    <div key={i}>
                        {group.label && <p className="mb-1 px-2 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">{group.label}</p>}
                        <ul className="space-y-0.5">
                            {group.items.map((item) => (
                                <li key={item.view}>
                                    <a
                                        href={viewHref(item.view)}
                                        onClick={link(item.view)}
                                        aria-current={item.view === view ? 'page' : undefined}
                                        className={cn(
                                            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900',
                                            item.view === view && 'bg-neutral-200/70 font-medium text-neutral-900',
                                        )}
                                    >
                                        <item.icon className="size-4" />
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>

            <div className="space-y-2 pt-3">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[13px]">
                    <CreditCard className="size-4 text-neutral-500" />
                    <span className="flex-1">Personal plan</span>
                    <span className="text-[11px] text-neutral-400">Free</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[13px]">
                    <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">{workspace?.ownerName.slice(0, 1).toUpperCase() ?? ''}</span>
                    <span className="truncate">{workspace?.ownerName ?? '…'}</span>
                </div>
                <div className="flex justify-between px-1 pt-1 text-[12px] text-neutral-500">
                    <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-1.5 hover:text-neutral-900">
                        <CircleHelp className="size-3.5" />
                        Help
                    </a>
                    <a href="/changelog" className="flex items-center gap-1.5 hover:text-neutral-900">
                        <Sparkles className="size-3.5" />
                        Updates
                    </a>
                </div>
            </div>
        </aside>
    )
}
```

```tsx file=src/crm/shell.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Menu } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { View } from './lib/view'
import { NavContext } from './nav'
import { Sidebar } from './sidebar'
import { useView } from './use-view'
import { AgentDetail } from './views/agent-detail'
import { AgentsView } from './views/agents'
import { AnalyticsView } from './views/analytics'
import { BroadcastsView } from './views/broadcasts'
import { ContactsView } from './views/contacts'
import { ConversationsView } from './views/conversations'
import { HomeView } from './views/home'
import { KnowledgeView } from './views/knowledge'
import { NumbersView } from './views/numbers'
import { SettingsView } from './views/settings'

export function Shell() {
    const { view, id, go } = useView()
    const workspace = useQuery(api.workspace.get)
    const seed = useMutation(api.seed.run)
    const [menuOpen, setMenuOpen] = useState(false)

    // An empty deployment (no workspace row yet) gets the mascot team and sample data
    useEffect(() => {
        if (workspace === null) void seed()
    }, [workspace, seed])

    return (
        <NavContext value={go}>
            <div className="flex h-dvh bg-[#f5f5f7] text-neutral-900 antialiased">
                <div className="hidden md:block">
                    <Sidebar view={view} workspace={workspace} />
                </div>
                {menuOpen && (
                    <div className="fixed inset-0 z-40 md:hidden">
                        <div className="absolute inset-0 bg-neutral-950/25" onClick={() => setMenuOpen(false)} />
                        <div className="relative h-full w-60 shadow-xl">
                            <Sidebar view={view} workspace={workspace} onNavigate={() => setMenuOpen(false)} />
                        </div>
                    </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col p-2 md:pl-0">
                    <div className="mb-2 flex items-center gap-2 md:hidden">
                        <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="grid size-9 place-items-center rounded-md hover:bg-neutral-200/60">
                            <Menu className="size-5" />
                        </button>
                        <span className="text-sm font-semibold">OpenBots</span>
                    </div>
                    <main className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200/80 bg-white">
                        <ViewSwitch view={view} id={id} />
                    </main>
                </div>
            </div>
        </NavContext>
    )
}

function ViewSwitch({ view, id }: { view: View; id?: string }) {
    switch (view) {
        case 'home':
            return <HomeView />
        case 'agents':
            return id ? <AgentDetail key={id} id={id} /> : <AgentsView />
        case 'knowledge':
            return <KnowledgeView />
        case 'numbers':
            return <NumbersView />
        case 'broadcasts':
            return <BroadcastsView />
        case 'conversations':
            return <ConversationsView key="all" id={id} />
        case 'live':
            return <ConversationsView key="live" id={id} live />
        case 'contacts':
            return <ContactsView />
        case 'analytics':
            return <AnalyticsView />
        case 'settings':
            return <SettingsView />
    }
}
```

- [ ] **Step 5: Verify (after Tasks 4–7 exist)**

Run: `npm run build && npm run lint && npm test`
Expected: all succeed; `dist/assets` contains a separate `crm-app-*.js` chunk and `grep -l ConvexReactClient dist/assets/index-*.js` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx vercel.json src/crm/*.ts src/crm/*.tsx
git commit -m "Add hidden /crm route with Retell-style shell"
```

---

### Task 4: Home builder and agents

**Files:** Create `src/crm/views/home.tsx`, `agents.tsx`, `agent-detail.tsx`

**Interfaces — Consumes:** `api.agents.*`, `api.numbers.list`, `api.knowledge.list`, `api.workspace.get`, `draftFromPrompt`, `blankAgent`, `pickAgentFields`, `AVATARS`, UI kit, `useNav`, `useRun`, `useNow`.

- [ ] **Step 1: Home**

```tsx file=src/crm/views/home.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowUp, History, Plus, Sparkles } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { draftFromPrompt } from '../lib/draft'
import { matches } from '../lib/text'
import { greetingFor } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, Content, PaneItem, SearchInput, SidePane } from '../ui'
import { useNow } from '../use-now'

const SUGGESTIONS = ['Someone who chases my unpaid invoices every Friday', 'An agent named Iris who books my meetings', 'A research buddy who texts me a morning brief']

export function HomeView() {
    const go = useNav()
    const run = useRun()
    const now = useNow()
    const workspace = useQuery(api.workspace.get)
    const agents = useQuery(api.agents.list)
    const create = useMutation(api.agents.create)
    const [text, setText] = useState('')
    const [q, setQ] = useState('')

    const drafts = agents?.filter((a) => a.status === 'draft' && matches(q, a.name, a.role, a.prompt))

    const submit = async () => {
        const draft = draftFromPrompt(text)
        if (!draft) return
        const res = await run(create(draft))
        if (res.ok) go('agents', res.value)
    }

    return (
        <>
            <SidePane>
                <p className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] font-medium">
                    <History className="size-4" />
                    Drafts
                </p>
                <SearchInput value={q} onChange={setQ} className="mb-1 w-full" />
                <PaneItem onClick={() => setText('')}>
                    <Plus />
                    New agent
                </PaneItem>
                {drafts === undefined
                    ? Array.from({ length: 4 }, (_, i) => <div key={i} className="mx-2.5 my-2 h-4 animate-pulse rounded bg-neutral-100" />)
                    : drafts.map((a) => (
                          <PaneItem key={a._id} onClick={() => go('agents', a._id)}>
                              <AgentAvatar agent={a} size={20} />
                              <span className="truncate">{a.name}</span>
                              <span className="ml-auto truncate text-[11px] text-neutral-400">{a.role}</span>
                          </PaneItem>
                      ))}
            </SidePane>
            <Content>
                <div className="flex h-14 items-center gap-2 border-b border-neutral-200/70 px-4 text-[13px] font-medium">
                    <Sparkles className="size-4 text-indigo-500" />
                    Builder
                </div>
                <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16">
                    <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight">
                        {greetingFor(new Date(now).getHours())}
                        {workspace ? `, ${workspace.ownerName}` : ''}
                    </h1>
                    <div className="w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-sm focus-within:border-neutral-300">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    void submit()
                                }
                            }}
                            rows={3}
                            aria-label="Describe the agent you want"
                            placeholder="Describe the agent you want. Who is it, what does it handle, how should it text?"
                            className="w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] outline-none placeholder:text-neutral-400"
                        />
                        <div className="flex items-center justify-between px-3 pb-3">
                            <span className="text-[11px] text-neutral-400">Enter creates a draft you can edit</span>
                            <button
                                type="button"
                                aria-label="Create draft"
                                disabled={!text.trim()}
                                onClick={submit}
                                className="grid size-7 cursor-pointer place-items-center rounded-full bg-neutral-900 text-white disabled:cursor-not-allowed disabled:bg-neutral-200"
                            >
                                <ArrowUp className="size-4" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 flex max-w-xl flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} type="button" onClick={() => setText(s)} className="cursor-pointer rounded-full border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50">
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </Content>
        </>
    )
}
```

- [ ] **Step 2: Agents list**

```tsx file=src/crm/views/agents.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Bot, Folder, Plus, Sparkles } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { blankAgent } from '../lib/draft'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, Content, Dialog, EmptyState, Field, inputCls, PaneItem, PaneLabel, Row, Scroll, SearchInput, SidePane, SkeletonRows, StatusBadge, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function AgentsView() {
    const go = useNav()
    const now = useNow()
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const [folder, setFolder] = useState<string | null>(null)
    const [q, setQ] = useState('')
    const [creating, setCreating] = useState(false)

    const folders = [...new Set((agents ?? []).flatMap((a) => (a.folder ? [a.folder] : [])))].sort()
    const shown = agents?.filter((a) => (!folder || a.folder === folder) && matches(q, a.name, a.role))

    return (
        <>
            <SidePane>
                <PaneItem active={!folder} onClick={() => setFolder(null)}>
                    <Bot />
                    All Agents
                    <span className="ml-auto text-[11px] text-neutral-400">{agents?.length}</span>
                </PaneItem>
                <PaneLabel>Folders</PaneLabel>
                {folders.map((f) => (
                    <PaneItem key={f} active={folder === f} onClick={() => setFolder(f)}>
                        <Folder />
                        {f}
                        <span className="ml-auto text-[11px] text-neutral-400">{agents?.filter((a) => a.folder === f).length}</span>
                    </PaneItem>
                ))}
                {agents && folders.length === 0 && <p className="px-2.5 text-[12px] text-neutral-400">Set a folder on an agent to group it here.</p>}
            </SidePane>
            <Content>
                <Toolbar title={folder ?? 'All Agents'}>
                    <SearchInput value={q} onChange={setQ} />
                    <Btn onClick={() => go('home')}>
                        <Sparkles />
                        Describe one
                    </Btn>
                    <Btn variant="primary" onClick={() => setCreating(true)}>
                        <Plus />
                        Create an Agent
                    </Btn>
                </Toolbar>
                <Scroll>
                    {shown?.length === 0 ? (
                        <EmptyState
                            icon={Bot}
                            title={q || folder ? 'No matching agents' : 'No agents yet'}
                            body={q || folder ? 'Try a different search or folder.' : 'Create your first agent, then give it an iMessage number.'}
                            action={!q && !folder && <Btn variant="primary" onClick={() => setCreating(true)}><Plus />Create an Agent</Btn>}
                        />
                    ) : (
                        <Table head={['Agent', 'Role', 'iMessage', 'Status', 'Edited']}>
                            {!shown ? (
                                <SkeletonRows cols={5} />
                            ) : (
                                shown.map((a) => (
                                    <Row key={a._id} onClick={() => go('agents', a._id)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5">
                                                <AgentAvatar agent={a} />
                                                <span className="font-medium text-neutral-900">{a.name}</span>
                                            </span>
                                        </Cell>
                                        <Cell>{a.role}</Cell>
                                        <Cell>
                                            {numbers?.filter((n) => n.agentId === a._id).map((n) => n.handle).join(', ') || <span className="text-neutral-400">None</span>}
                                        </Cell>
                                        <Cell>
                                            <StatusBadge status={a.status} />
                                        </Cell>
                                        <Cell className="text-neutral-500">{relativeTime(a.updatedAt, now)}</Cell>
                                    </Row>
                                ))
                            )}
                        </Table>
                    )}
                </Scroll>
            </Content>
            {creating && <NewAgentDialog onClose={() => setCreating(false)} />}
        </>
    )
}

function NewAgentDialog({ onClose }: { onClose: () => void }) {
    const go = useNav()
    const run = useRun()
    const create = useMutation(api.agents.create)
    const [name, setName] = useState('')
    const [role, setRole] = useState('')

    const submit = async () => {
        const res = await run(create(blankAgent(name.trim(), role.trim())))
        if (res.ok) go('agents', res.value)
    }

    return (
        <Dialog
            title="Create an agent"
            onClose={onClose}
            footer={
                <>
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!name.trim()} onClick={submit}>
                        Create
                    </Btn>
                </>
            }
        >
            <Field label="Name">
                <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Iris" />
            </Field>
            <Field label="Role" hint="What it handles. You can change everything later.">
                <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Scheduling" />
            </Field>
        </Dialog>
    )
}
```

- [ ] **Step 3: Agent detail**

```tsx file=src/crm/views/agent-detail.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, BookOpen, MessageCircle } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { AVATARS, pickAgentFields, type AgentFields, type AgentStatus } from '../lib/draft'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, ConfirmDelete, Content, Field, inputCls, NotFound, Scroll, StatusBadge, Toolbar } from '../ui'

export function AgentDetail({ id }: { id: string }) {
    const go = useNav()
    const agent = useQuery(api.agents.get, { id })
    if (agent === undefined) return <Content><Toolbar title="Loading…" /></Content>
    if (agent === null) return <NotFound what="agent" onBack={() => go('agents')} />
    return <AgentEditor agent={agent} />
}

function AgentEditor({ agent }: { agent: Doc<'agents'> }) {
    const go = useNav()
    const run = useRun()
    const update = useMutation(api.agents.update)
    const remove = useMutation(api.agents.remove)
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const knowledge = useQuery(api.knowledge.list)
    const [form, setForm] = useState(() => pickAgentFields(agent))

    const set = <K extends keyof AgentFields>(key: K, value: AgentFields[K]) => setForm((f) => ({ ...f, [key]: value }))
    const dirty = JSON.stringify(form) !== JSON.stringify(pickAgentFields(agent))
    const folders = [...new Set((agents ?? []).flatMap((a) => (a.folder ? [a.folder] : [])))]
    const myNumbers = numbers?.filter((n) => n.agentId === agent._id) ?? []
    const myDocs = knowledge?.filter((k) => k.agentId === agent._id) ?? []

    const save = () => run(update({ id: agent._id, ...form, name: form.name.trim(), folder: form.folder?.trim() || undefined }))
    const destroy = async () => {
        const res = await run(remove({ id: agent._id }))
        if (res.ok) go('agents')
    }

    return (
        <Content>
            <Toolbar
                title={
                    <>
                        <button type="button" aria-label="Back to agents" onClick={() => go('agents')} className="grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100">
                            <ArrowLeft className="size-4" />
                        </button>
                        <AgentAvatar agent={form} size={24} />
                        <span className="truncate">{agent.name}</span>
                        <StatusBadge status={agent.status} />
                    </>
                }
            >
                <ConfirmDelete onConfirm={destroy} />
                <Btn variant="primary" disabled={!dirty || !form.name.trim()} onClick={save}>
                    {dirty ? 'Save changes' : 'Saved'}
                </Btn>
            </Toolbar>
            <Scroll>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label="Name">
                                <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                            </Field>
                            <Field label="Role">
                                <input className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value)} />
                            </Field>
                            <Field label="Status">
                                <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as AgentStatus)}>
                                    <option value="draft">Draft</option>
                                    <option value="live">Live</option>
                                    <option value="paused">Paused</option>
                                </select>
                            </Field>
                            <Field label="Folder">
                                <input className={inputCls} list="agent-folders" value={form.folder ?? ''} onChange={(e) => set('folder', e.target.value || undefined)} placeholder="None" />
                                <datalist id="agent-folders">
                                    {folders.map((f) => (
                                        <option key={f} value={f} />
                                    ))}
                                </datalist>
                            </Field>
                        </div>
                        <div className="space-y-1.5">
                            <span className="block text-xs font-medium text-neutral-600">Avatar</span>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" aria-label="No avatar" onClick={() => set('avatar', undefined)} className={cn('cursor-pointer rounded-full ring-2 ring-offset-2', !form.avatar ? 'ring-neutral-900' : 'ring-transparent')}>
                                    <AgentAvatar agent={{ ...form, avatar: undefined }} size={36} />
                                </button>
                                {AVATARS.map((src) => (
                                    <button key={src} type="button" aria-label={`Use ${src.split('/').pop()?.replace('.webp', '')}`} onClick={() => set('avatar', src)} className={cn('cursor-pointer rounded-full ring-2 ring-offset-2', form.avatar === src ? 'ring-neutral-900' : 'ring-transparent')}>
                                        <img src={src} alt="" className="size-9 rounded-full bg-neutral-100 object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Field label="Personality & instructions" hint="How it talks, what it handles, and what it should hand back to you.">
                            <textarea className={cn(inputCls, 'h-auto min-h-40 py-2 leading-relaxed')} value={form.prompt} onChange={(e) => set('prompt', e.target.value)} />
                        </Field>
                        <Field label="First message" hint="Sent when someone texts this agent for the first time.">
                            <input className={inputCls} value={form.greeting} onChange={(e) => set('greeting', e.target.value)} />
                        </Field>
                    </div>

                    <div className="space-y-4">
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><MessageCircle className="size-4 text-neutral-500" />iMessage</h2>
                            {myNumbers.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myNumbers.map((n) => <li key={n._id}>{n.handle}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No number yet. People can't text this agent until it has one.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('numbers')}>Manage numbers</Btn>
                        </section>
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><BookOpen className="size-4 text-neutral-500" />Knowledge</h2>
                            {myDocs.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myDocs.map((k) => <li key={k._id} className="truncate">{k.title}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No documents. Add some so it knows your rules.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('knowledge')}>Manage knowledge</Btn>
                        </section>
                    </div>
                </div>
            </Scroll>
        </Content>
    )
}
```

- [ ] **Step 4: Commit** (after Task 3 Step 5 build passes)

```bash
git add src/crm/views/home.tsx src/crm/views/agents.tsx src/crm/views/agent-detail.tsx
git commit -m "Add CRM home builder and agent views"
```

---

### Task 5: Contacts, numbers, knowledge, broadcasts

**Files:** Create `src/crm/views/contacts.tsx`, `numbers.tsx`, `knowledge.tsx`, `broadcasts.tsx`

**Interfaces — Consumes:** table APIs from Task 1, `parseTags`, `matches`, `handleKind` (`@convex/lib/handles`), `relativeTime`, `formatWhen`, UI kit.

- [ ] **Step 1: Contacts**

```tsx file=src/crm/views/contacts.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Plus, Users } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { cn } from '@/lib/utils'
import { matches, parseTags } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, ConfirmDelete, Content, Dialog, EmptyState, Field, Initials, inputCls, Row, Scroll, SearchInput, SkeletonRows, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function ContactsView() {
    const now = useNow()
    const contacts = useQuery(api.contacts.list)
    const agents = useQuery(api.agents.list)
    const [q, setQ] = useState('')
    const [editing, setEditing] = useState<Doc<'contacts'> | 'new' | null>(null)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const shown = contacts?.filter((c) => matches(q, c.name, c.handle, ...c.tags))

    return (
        <Content>
            <Toolbar title="Contacts">
                <SearchInput value={q} onChange={setQ} />
                <Btn variant="primary" onClick={() => setEditing('new')}>
                    <Plus />
                    Add contact
                </Btn>
            </Toolbar>
            <Scroll>
                {shown?.length === 0 ? (
                    <EmptyState icon={Users} title={q ? 'No matching contacts' : 'No contacts yet'} body={q ? 'Try a name, handle or tag.' : 'People who text your agents show up here.'} />
                ) : (
                    <Table head={['Name', 'Handle', 'Tags', 'Agent', 'Last seen']}>
                        {!shown ? (
                            <SkeletonRows cols={5} />
                        ) : (
                            shown.map((c) => {
                                const agent = c.agentId && agentById.get(c.agentId)
                                return (
                                    <Row key={c._id} onClick={() => setEditing(c)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5">
                                                <Initials name={c.name} size={26} />
                                                <span className="font-medium text-neutral-900">{c.name}</span>
                                            </span>
                                        </Cell>
                                        <Cell>{c.handle}</Cell>
                                        <Cell>
                                            <span className="flex flex-wrap gap-1">
                                                {c.tags.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{t}</span>)}
                                            </span>
                                        </Cell>
                                        <Cell>
                                            {agent ? (
                                                <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span>
                                            ) : (
                                                <span className="text-neutral-400">None</span>
                                            )}
                                        </Cell>
                                        <Cell className="text-neutral-500">{c.lastSeenAt ? relativeTime(c.lastSeenAt, now) : 'Never'}</Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {editing && <ContactDialog contact={editing === 'new' ? undefined : editing} agents={agents ?? []} onClose={() => setEditing(null)} />}
        </Content>
    )
}

function ContactDialog({ contact, agents, onClose }: { contact?: Doc<'contacts'>; agents: Doc<'agents'>[]; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.contacts.create)
    const update = useMutation(api.contacts.update)
    const remove = useMutation(api.contacts.remove)
    const [name, setName] = useState(contact?.name ?? '')
    const [handle, setHandle] = useState(contact?.handle ?? '')
    const [tags, setTags] = useState(contact?.tags.join(', ') ?? '')
    const [agentId, setAgentId] = useState<string>(contact?.agentId ?? '')
    const [notes, setNotes] = useState(contact?.notes ?? '')

    const handleOk = handleKind(handle) !== null
    const save = async () => {
        const fields = { name, handle, tags: parseTags(tags), notes, agentId: agentId ? (agentId as Id<'agents'>) : undefined }
        const res = await run(contact ? update({ id: contact._id, ...fields }) : create(fields))
        if (res.ok) onClose()
    }
    const destroy = async () => {
        if (!contact) return
        const res = await run(remove({ id: contact._id }))
        if (res.ok) onClose()
    }

    return (
        <Dialog
            title={contact ? 'Edit contact' : 'Add contact'}
            onClose={onClose}
            footer={
                <>
                    {contact && <span className="mr-auto"><ConfirmDelete onConfirm={destroy} /></span>}
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!name.trim() || !handleOk} onClick={save}>Save</Btn>
                </>
            }
        >
            <Field label="Name">
                <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone or email" hint={handle.trim() && !handleOk ? 'Enter a phone number or an email address.' : undefined}>
                <input className={cn(inputCls, handle.trim() && !handleOk && 'border-red-300')} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+1 (415) 555-0100" />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. client, vip">
                <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Agent">
                <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    <option value="">None</option>
                    {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
            </Field>
            <Field label="Notes">
                <textarea className={cn(inputCls, 'h-auto min-h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
        </Dialog>
    )
}
```

- [ ] **Step 2: Numbers**

```tsx file=src/crm/views/numbers.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Mail, MessageCircle, Phone, Plus, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { cn } from '@/lib/utils'
import { useRun } from '../toast-context'
import { Btn, Cell, Content, Dialog, EmptyState, Field, inputCls, Row, Scroll, SkeletonRows, Table, Toolbar } from '../ui'

export function NumbersView() {
    const run = useRun()
    const numbers = useQuery(api.numbers.list)
    const agents = useQuery(api.agents.list)
    const assign = useMutation(api.numbers.assign)
    const remove = useMutation(api.numbers.remove)
    const [adding, setAdding] = useState(false)

    return (
        <Content>
            <Toolbar title="iMessage Numbers">
                <Btn variant="primary" onClick={() => setAdding(true)}>
                    <Plus />
                    Add number
                </Btn>
            </Toolbar>
            <Scroll>
                {numbers?.length === 0 ? (
                    <EmptyState icon={MessageCircle} title="No numbers yet" body="Add a phone number or Apple ID email, then point it at an agent." action={<Btn variant="primary" onClick={() => setAdding(true)}><Plus />Add number</Btn>} />
                ) : (
                    <Table head={['Handle', 'Type', 'Agent', '']}>
                        {!numbers ? (
                            <SkeletonRows cols={4} />
                        ) : (
                            numbers.map((n) => (
                                <Row key={n._id}>
                                    <Cell className="font-medium text-neutral-900">{n.handle}</Cell>
                                    <Cell>
                                        <span className="flex items-center gap-1.5 text-neutral-500">
                                            {n.kind === 'phone' ? <Phone className="size-3.5" /> : <Mail className="size-3.5" />}
                                            {n.kind === 'phone' ? 'Phone' : 'Email'}
                                        </span>
                                    </Cell>
                                    <Cell>
                                        <AgentSelect agents={agents ?? []} value={n.agentId} onChange={(agentId) => run(assign({ id: n._id, agentId }))} />
                                    </Cell>
                                    <Cell className="w-12 text-right">
                                        <Btn variant="ghost" aria-label={`Remove ${n.handle}`} onClick={() => run(remove({ id: n._id }))}>
                                            <Trash2 />
                                        </Btn>
                                    </Cell>
                                </Row>
                            ))
                        )}
                    </Table>
                )}
            </Scroll>
            {adding && <AddNumberDialog agents={agents ?? []} onClose={() => setAdding(false)} />}
        </Content>
    )
}

function AgentSelect({ agents, value, onChange }: { agents: Doc<'agents'>[]; value?: Id<'agents'>; onChange: (id?: Id<'agents'>) => void }) {
    return (
        <select aria-label="Agent" className={cn(inputCls, 'h-8 max-w-56')} value={value ?? ''} onChange={(e) => onChange(e.target.value ? (e.target.value as Id<'agents'>) : undefined)}>
            <option value="">Unassigned</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>
    )
}

function AddNumberDialog({ agents, onClose }: { agents: Doc<'agents'>[]; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.numbers.create)
    const [handle, setHandle] = useState('')
    const [agentId, setAgentId] = useState<Id<'agents'> | undefined>()
    const ok = handleKind(handle) !== null

    const save = async () => {
        const res = await run(create({ handle, agentId }))
        if (res.ok) onClose()
    }

    return (
        <Dialog title="Add iMessage number" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok} onClick={save}>Add</Btn></>}>
            <Field label="Phone number or Apple ID email" hint={handle.trim() && !ok ? 'Enter a phone number or an email address.' : undefined}>
                <input autoFocus className={cn(inputCls, handle.trim() && !ok && 'border-red-300')} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+1 (415) 555-0100" />
            </Field>
            <Field label="Agent">
                <AgentSelect agents={agents} value={agentId} onChange={setAgentId} />
            </Field>
        </Dialog>
    )
}
```

- [ ] **Step 3: Knowledge**

```tsx file=src/crm/views/knowledge.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { BookOpen, FileText, Plus } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, ConfirmDelete, Content, Dialog, EmptyState, Field, inputCls, Row, Scroll, SearchInput, SkeletonRows, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function KnowledgeView() {
    const now = useNow()
    const docs = useQuery(api.knowledge.list)
    const agents = useQuery(api.agents.list)
    const [q, setQ] = useState('')
    const [editing, setEditing] = useState<Doc<'knowledge'> | 'new' | null>(null)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const shown = docs?.filter((d) => matches(q, d.title, d.body))

    return (
        <Content>
            <Toolbar title="Knowledge">
                <SearchInput value={q} onChange={setQ} />
                <Btn variant="primary" onClick={() => setEditing('new')}>
                    <Plus />
                    Add document
                </Btn>
            </Toolbar>
            <Scroll>
                {shown?.length === 0 ? (
                    <EmptyState icon={BookOpen} title={q ? 'No matching documents' : 'No knowledge yet'} body="Rules, prices and routines your agents should know." />
                ) : (
                    <Table head={['Title', 'Agent', 'Updated']}>
                        {!shown ? (
                            <SkeletonRows cols={3} />
                        ) : (
                            shown.map((d) => {
                                const agent = d.agentId && agentById.get(d.agentId)
                                return (
                                    <Row key={d._id} onClick={() => setEditing(d)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5 font-medium text-neutral-900">
                                                <FileText className="size-4 text-neutral-400" />
                                                {d.title}
                                            </span>
                                        </Cell>
                                        <Cell>{agent ? <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span> : <span className="text-neutral-400">Shared</span>}</Cell>
                                        <Cell className="text-neutral-500">{relativeTime(d.updatedAt, now)}</Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {editing && <DocDialog doc={editing === 'new' ? undefined : editing} agents={agents ?? []} onClose={() => setEditing(null)} />}
        </Content>
    )
}

function DocDialog({ doc, agents, onClose }: { doc?: Doc<'knowledge'>; agents: Doc<'agents'>[]; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.knowledge.create)
    const update = useMutation(api.knowledge.update)
    const remove = useMutation(api.knowledge.remove)
    const [title, setTitle] = useState(doc?.title ?? '')
    const [body, setBody] = useState(doc?.body ?? '')
    const [agentId, setAgentId] = useState<string>(doc?.agentId ?? '')

    const save = async () => {
        const fields = { title, body, agentId: agentId ? (agentId as Id<'agents'>) : undefined }
        const res = await run(doc ? update({ id: doc._id, ...fields }) : create(fields))
        if (res.ok) onClose()
    }
    const destroy = async () => {
        if (!doc) return
        const res = await run(remove({ id: doc._id }))
        if (res.ok) onClose()
    }

    return (
        <Dialog
            title={doc ? 'Edit document' : 'Add document'}
            onClose={onClose}
            footer={
                <>
                    {doc && <span className="mr-auto"><ConfirmDelete onConfirm={destroy} /></span>}
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!title.trim()} onClick={save}>Save</Btn>
                </>
            }
        >
            <Field label="Title">
                <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Agent" hint="Shared documents are available to every agent.">
                <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    <option value="">Shared</option>
                    {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
            </Field>
            <Field label="Content">
                <textarea className={cn(inputCls, 'h-auto min-h-48 py-2 leading-relaxed')} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
        </Dialog>
    )
}
```

- [ ] **Step 4: Broadcasts**

```tsx file=src/crm/views/broadcasts.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Megaphone, Plus, Send, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { formatWhen } from '../lib/time'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, Content, Dialog, EmptyState, Field, inputCls, Row, Scroll, SkeletonRows, StatusBadge, Table, Toolbar } from '../ui'

export function BroadcastsView() {
    const run = useRun()
    const broadcasts = useQuery(api.broadcasts.list)
    const agents = useQuery(api.agents.list)
    const contacts = useQuery(api.contacts.list)
    const send = useMutation(api.broadcasts.send)
    const remove = useMutation(api.broadcasts.remove)
    const [creating, setCreating] = useState(false)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const tags = [...new Set((contacts ?? []).flatMap((c) => c.tags))].sort()
    const audience = (tag: string) => contacts?.filter((c) => c.tags.includes(tag)).length ?? 0

    return (
        <Content>
            <Toolbar title="Broadcasts">
                <Btn variant="primary" onClick={() => setCreating(true)}>
                    <Plus />
                    New broadcast
                </Btn>
            </Toolbar>
            <Scroll>
                {broadcasts?.length === 0 ? (
                    <EmptyState icon={Megaphone} title="No broadcasts yet" body="Send one message from an agent to everyone with a tag." />
                ) : (
                    <Table head={['Broadcast', 'Agent', 'Audience', 'When', 'Status', '']}>
                        {!broadcasts ? (
                            <SkeletonRows cols={6} />
                        ) : (
                            broadcasts.map((b) => {
                                const agent = agentById.get(b.agentId)
                                return (
                                    <Row key={b._id}>
                                        <Cell>
                                            <p className="font-medium text-neutral-900">{b.title}</p>
                                            <p className="max-w-72 truncate text-[12px] text-neutral-500">{b.body}</p>
                                        </Cell>
                                        <Cell>{agent && <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span>}</Cell>
                                        <Cell>#{b.tag} · {audience(b.tag)} contacts</Cell>
                                        <Cell className="text-neutral-500">{formatWhen(b.scheduledFor)}</Cell>
                                        <Cell><StatusBadge status={b.status} /></Cell>
                                        <Cell className="text-right">
                                            <span className="inline-flex gap-1">
                                                {b.status === 'scheduled' && (
                                                    <Btn onClick={() => run(send({ id: b._id }))}>
                                                        <Send />
                                                        Send now
                                                    </Btn>
                                                )}
                                                <Btn variant="ghost" aria-label={`Delete ${b.title}`} onClick={() => run(remove({ id: b._id }))}>
                                                    <Trash2 />
                                                </Btn>
                                            </span>
                                        </Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {creating && <NewBroadcastDialog agents={agents ?? []} tags={tags} audience={audience} onClose={() => setCreating(false)} />}
        </Content>
    )
}

function NewBroadcastDialog({ agents, tags, audience, onClose }: { agents: Doc<'agents'>[]; tags: string[]; audience: (tag: string) => number; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.broadcasts.create)
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [agentId, setAgentId] = useState<string>(agents[0]?._id ?? '')
    const [tag, setTag] = useState(tags[0] ?? '')
    const [when, setWhen] = useState('')

    const valid = title.trim() && body.trim() && agentId && tag && when
    const save = async () => {
        const res = await run(create({ title, body, agentId: agentId as Id<'agents'>, tag, scheduledFor: new Date(when).getTime() }))
        if (res.ok) onClose()
    }

    return (
        <Dialog title="New broadcast" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!valid} onClick={save}>Schedule</Btn></>}>
            <Field label="Title">
                <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October check-in" />
            </Field>
            <Field label="From">
                <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
            </Field>
            <Field label="To everyone tagged" hint={tags.length ? `${audience(tag)} contacts` : 'Tag some contacts first.'}>
                <select className={inputCls} value={tag} onChange={(e) => setTag(e.target.value)} disabled={!tags.length}>
                    {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
            </Field>
            <Field label="Message">
                <textarea className={cn(inputCls, 'h-auto min-h-24 py-2')} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Field label="Send at">
                <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
        </Dialog>
    )
}
```

- [ ] **Step 5: Commit** (after build passes)

```bash
git add src/crm/views/contacts.tsx src/crm/views/numbers.tsx src/crm/views/knowledge.tsx src/crm/views/broadcasts.tsx
git commit -m "Add CRM contacts, numbers, knowledge and broadcasts views"
```

---

### Task 6: Conversations and Live

**Files:** Create `src/crm/views/conversations.tsx`

**Interfaces — Consumes:** `api.conversations.list({ since })`, `.thread({ id })`, `.send({ id, body })`; `DAY` from `@convex/lib/stats`.

- [ ] **Step 1: Implement**

```tsx file=src/crm/views/conversations.tsx
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, ArrowUp, MessagesSquare } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { DAY } from '@convex/lib/stats'
import { cn } from '@/lib/utils'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, EmptyState, Initials, NotFound, SearchInput } from '../ui'
import { useNow } from '../use-now'

// Shared by Conversations (everything) and Live (activity in the last 24h)
export function ConversationsView({ id, live = false }: { id?: string; live?: boolean }) {
    const go = useNav()
    const now = useNow()
    const [since] = useState(() => (live ? Date.now() - DAY : undefined))
    const conversations = useQuery(api.conversations.list, { since })
    const [q, setQ] = useState('')
    const view = live ? 'live' : 'conversations'
    const shown = conversations?.filter((c) => matches(q, c.contactName, c.agentName, c.lastMessage))

    return (
        <>
            <aside className={cn('w-full shrink-0 flex-col border-r border-neutral-200/70 md:flex md:w-80', id ? 'hidden' : 'flex')}>
                <div className="flex h-14 items-center justify-between gap-2 border-b border-neutral-200/70 px-4">
                    <h1 className="text-[15px] font-semibold">{live ? 'Live' : 'Conversations'}</h1>
                    {live && (
                        <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Last 24 hours
                        </span>
                    )}
                </div>
                <div className="p-2">
                    <SearchInput value={q} onChange={setQ} className="w-full" />
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {shown === undefined ? (
                        Array.from({ length: 6 }, (_, i) => <li key={i} className="mx-3 my-3 h-9 animate-pulse rounded bg-neutral-100" />)
                    ) : shown.length === 0 ? (
                        <li className="px-4 py-10 text-center text-[13px] text-neutral-400">{q ? 'No matches.' : live ? 'Nothing in the last 24 hours.' : 'No conversations yet.'}</li>
                    ) : (
                        shown.map((c) => (
                            <li key={c._id}>
                                <button type="button" onClick={() => go(view, c._id)} className={cn('flex w-full cursor-pointer gap-3 px-3 py-2.5 text-left hover:bg-neutral-50', c._id === id && 'bg-neutral-100 hover:bg-neutral-100')}>
                                    <Initials name={c.contactName} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex justify-between gap-2">
                                            <span className="truncate text-[13px] font-medium">{c.contactName}</span>
                                            <span className="shrink-0 text-[11px] text-neutral-400">{relativeTime(c.lastAt, now)}</span>
                                        </span>
                                        <span className="block truncate text-[12px] text-neutral-500">
                                            {c.agentName}: {c.lastMessage}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            </aside>
            <section className={cn('min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden md:flex')}>
                {id ? (
                    <Thread key={id} id={id} onBack={() => go(view)} />
                ) : (
                    <EmptyState icon={MessagesSquare} title="Pick a conversation" body="Messages between your agents and the people texting them show up here." />
                )}
            </section>
        </>
    )
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
    const run = useRun()
    const data = useQuery(api.conversations.thread, { id })
    const send = useMutation(api.conversations.send)
    const [text, setText] = useState('')
    const endRef = useRef<HTMLDivElement>(null)
    const count = data?.messages.length

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [count])

    if (data === undefined) return <div className="flex-1 animate-pulse bg-neutral-50/50" />
    if (data === null) return <NotFound what="conversation" onBack={onBack} />
    const { conversation, contact, agent, messages } = data

    const submit = async () => {
        const body = text.trim()
        if (!body) return
        setText('')
        const res = await run(send({ id: conversation._id, body }))
        if (!res.ok) setText(body)
    }

    return (
        <>
            <div className="flex h-14 items-center gap-3 border-b border-neutral-200/70 px-4">
                <button type="button" aria-label="Back" onClick={onBack} className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 md:hidden">
                    <ArrowLeft className="size-4" />
                </button>
                <Initials name={contact.name} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{contact.name}</p>
                    <p className="truncate text-[11px] text-neutral-500">{contact.handle}</p>
                </div>
                <span className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <AgentAvatar agent={agent} size={22} />
                    {agent.name}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto bg-neutral-50/60 px-4 py-4">
                <div className="mx-auto max-w-2xl space-y-1.5">
                    {messages.map((m) => (
                        <div key={m._id} className={cn('flex', m.from === 'agent' ? 'justify-end' : 'justify-start')}>
                            <div title={new Date(m.at).toLocaleString()} className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug', m.from === 'agent' ? 'bg-[#0a84ff] text-white' : 'bg-neutral-200/80 text-neutral-900')}>
                                {m.body}
                            </div>
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>
            </div>
            <div className="border-t border-neutral-200/70 p-3">
                <div className="mx-auto flex max-w-2xl items-end gap-2">
                    <textarea
                        rows={1}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void submit()
                            }
                        }}
                        aria-label={`Reply as ${agent.name}`}
                        placeholder={`Reply as ${agent.name}`}
                        className="max-h-32 min-h-9 flex-1 resize-none rounded-2xl border border-neutral-200 px-3.5 py-2 text-[14px] outline-none focus:border-neutral-400"
                    />
                    <button type="button" aria-label="Send" disabled={!text.trim()} onClick={submit} className="grid size-9 cursor-pointer place-items-center rounded-full bg-[#0a84ff] text-white disabled:cursor-not-allowed disabled:bg-neutral-200">
                        <ArrowUp className="size-4" />
                    </button>
                </div>
            </div>
        </>
    )
}
```

- [ ] **Step 2: Commit** (after build passes)

```bash
git add src/crm/views/conversations.tsx
git commit -m "Add CRM conversations and live views"
```

---

### Task 7: Analytics and settings

**Files:** Create `src/crm/views/analytics.tsx`, `settings.tsx`

Load the `dataviz` skill before writing the chart; adjust colors/labels to its guidance if they differ from below.

- [ ] **Step 1: Analytics**

```tsx file=src/crm/views/analytics.tsx
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { dayLabel } from '../lib/time'
import { AgentAvatar, Content, Scroll, Toolbar } from '../ui'

export function AnalyticsView() {
    const data = useQuery(api.analytics.overview)
    const tiles = [
        { label: 'Agents live', value: data && `${data.agentsLive} / ${data.agents}` },
        { label: 'Contacts', value: data?.contacts },
        { label: 'Conversations', value: data?.conversations },
        { label: 'Messages, last 7 days', value: data?.messages7d },
    ]
    const maxDay = Math.max(1, ...(data?.perDay.map((d) => d.count) ?? []))
    const maxAgent = Math.max(1, ...(data?.perAgent.map((a) => a.count) ?? []))

    return (
        <Content>
            <Toolbar title="Analytics">
                <span className="text-[12px] text-neutral-500">Last 14 days</span>
            </Toolbar>
            <Scroll>
                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {tiles.map((t) => (
                            <div key={t.label} className="rounded-lg border border-neutral-200 p-4">
                                <p className="text-[12px] text-neutral-500">{t.label}</p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value ?? '–'}</p>
                            </div>
                        ))}
                    </div>

                    <section className="rounded-lg border border-neutral-200 p-4">
                        <h2 className="text-[13px] font-medium">Messages per day</h2>
                        <div className="mt-4 flex h-44 items-end gap-1.5" role="img" aria-label="Bar chart of messages per day">
                            {(data?.perDay ?? Array.from({ length: 14 }, (_, i) => ({ day: String(i), count: 0 }))).map((d) => (
                                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                                    <div className="w-full rounded-t-sm bg-primary/85 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(2, (d.count / maxDay) * 100)}%` }} />
                                    {data && (
                                        <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white group-hover:block">
                                            {dayLabel(d.day)}: {d.count}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {data && (
                            <div className="mt-2 flex justify-between text-[11px] text-neutral-400">
                                <span>{dayLabel(data.perDay[0].day)}</span>
                                <span>{dayLabel(data.perDay[data.perDay.length - 1].day)}</span>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-neutral-200 p-4">
                        <h2 className="text-[13px] font-medium">Messages by agent</h2>
                        <ul className="mt-3 space-y-2.5">
                            {data?.perAgent.map((a) => (
                                <li key={a.agentId} className="flex items-center gap-3 text-[13px]">
                                    <AgentAvatar agent={a} size={22} />
                                    <span className="w-20 shrink-0 truncate">{a.name}</span>
                                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                        <span className="block h-full rounded-full bg-primary/85" style={{ width: `${(a.count / maxAgent) * 100}%` }} />
                                    </span>
                                    <span className="w-8 text-right tabular-nums text-neutral-500">{a.count}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </Scroll>
        </Content>
    )
}
```

- [ ] **Step 2: Settings**

```tsx file=src/crm/views/settings.tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { useRun } from '../toast-context'
import { Btn, Content, Field, inputCls, Scroll, Toolbar } from '../ui'

export function SettingsView() {
    const workspace = useQuery(api.workspace.get)
    return (
        <Content>
            <Toolbar title="Settings" />
            <Scroll>{workspace ? <WorkspaceForm key={workspace._id} workspace={workspace} /> : <div className="m-4 h-40 max-w-lg animate-pulse rounded-lg bg-neutral-100" />}</Scroll>
        </Content>
    )
}

function WorkspaceForm({ workspace }: { workspace: Doc<'workspace'> }) {
    const run = useRun()
    const update = useMutation(api.workspace.update)
    const [name, setName] = useState(workspace.name)
    const [ownerName, setOwnerName] = useState(workspace.ownerName)
    const dirty = name !== workspace.name || ownerName !== workspace.ownerName

    return (
        <div className="m-4 max-w-lg space-y-3.5 rounded-lg border border-neutral-200 p-4">
            <h2 className="text-[13px] font-medium">Workspace</h2>
            <Field label="Workspace name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Your name" hint="Used in the greeting on Home.">
                <input className={inputCls} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <div className="flex justify-end">
                <Btn variant="primary" disabled={!dirty || !name.trim() || !ownerName.trim()} onClick={() => run(update({ name, ownerName }))}>
                    Save
                </Btn>
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Run Task 3 Step 5 verification now** (`npm run build && npm run lint && npm test`), fix any type/lint errors, then commit Task 3, 4, 5, 6 and this task in order.

```bash
git add src/crm/views/analytics.tsx src/crm/views/settings.tsx
git commit -m "Add CRM analytics and settings views"
```

---

### Task 8: Docs and end-to-end check

**Files:** Modify `README.md`

- [ ] **Step 1: README** — add a row to the Pages table and a section:

```markdown
| `/crm` | Operator dashboard (unlisted, noindex; see below) |
```

```markdown
## CRM (`/crm`)

An unlisted dashboard for building and managing agents. Only the exact path `/crm` loads it,
nothing links to it, and it is served with `noindex`. Views switch via `?view=` so the path
never changes. Data lives in [Convex](https://convex.dev) (`convex/`).

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel. An empty deployment seeds itself
with the mascot team and sample data on first visit.
```

- [ ] **Step 2: Manual check in the browser** (`npm run dev`, Playwright or Chrome):
  - `/crm` shows Home with "Good …, Shidhartha"; `/crm/` too; `/crm/agents`, `/CRM`, `/crmx` land on `/`.
  - Every sidebar item renders; back/forward buttons move between views; URL path stays `/crm`.
  - Home: type "An agent named Iris who books my meetings", Enter → Iris detail, Scheduling role.
  - Agent detail: change folder, clear folder → saved and gone; pick/clear avatar; delete Iris → back to list.
  - `/crm?view=agents&id=garbage` → "This agent doesn't exist".
  - Contacts: invalid handle disables Save; add, edit, delete a contact; its conversation disappears.
  - Numbers: reassign via select; add `bad` → button disabled.
  - Conversations: send a reply → appears at bottom, list reorders; Live shows recent ones.
  - Analytics tiles and bars render; Settings name change reflects in sidebar and Home.
  - Mobile width (390px): menu drawer works, conversation list → thread → back.
  - Delete Marcus (has numbers, contacts, broadcasts, conversations): no "Unknown" rows anywhere.
  - Page source has `<meta name="robots" content="noindex, nofollow">` on `/crm` only.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the /crm dashboard and Convex setup"
```
