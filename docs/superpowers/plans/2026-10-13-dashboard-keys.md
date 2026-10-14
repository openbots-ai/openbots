# Keys in the Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can enter their AI keys and account logins in Connections, locked in the browser so only their engine (`runner/`) can read them; environment variables keep working as a fallback.

**Architecture:** One Web Crypto module (`convex/lib/sealed.ts`) is shared by the browser (locks) and the engine (unlocks). Each engine has an RSA-OAEP key pair and reports its public key with its heartbeat. Convex stores locked values in a new `secrets` table (one row per engine and service) and serves an engine only its own rows. The engine subscribes to them, merges them over its environment settings, and restarts its texting services and AI keys live when they change.

**Tech Stack:** Convex (queries/mutations, convex-test), React + Vite dashboard, Node engine (`runner/`), Web Crypto (`crypto.subtle`, same API in browser and Node), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-dashboard-keys-design.md`

## Global Constraints

- Convex never receives a key in readable form. Only `sealed` strings (`s1:<wrapped>:<iv>:<body>`) are stored.
- `secrets.list` and `runners.list` never return `sealed`; `runners.list` never returns `tokenHash`.
- Dashboard value beats the environment variable for the same service; removing it falls back to the environment.
- Locking: AES-256-GCM for the value, its key wrapped with RSA-OAEP SHA-256 (3072-bit); additional data `workspaceId:runnerId:service`.
- Engine private key lives in `<dataDir>/engine-key.json`, mode 0600. Keys opened from the dashboard are kept in memory only.
- UI copy says "engine" for the program in `runner/`; "agent" means only the assistants (Honey, Waffles…). Code names (`runner`, `runners`), env var names and Convex function names don't change.
- Services covered: `openai`, `anthropic`, `google`, `xai`, `local`, `twilio`, `sendblue`, `bluebubbles`, `resend`. Mac and relay stay environment-only.
- Follow `convex/_generated/ai/guidelines.md` (read it first): validators on every function, `withIndex` not `filter`, index names list every field.
- Comment style: short plain-English comments above functions, like the surrounding code. Four-space indent, single quotes, no semicolons.

## Review Focus

1. **An engine's data directory is wiped (new key pair) while its old locked values remain** → the heartbeat with a different public key is refused (the first key is pinned, so a stolen token can't swap in its own) and the values stay; the owner clicks **Reset key** in Connections (`runners.resetKey`), which clears the key and that engine's `secrets` rows, then the next heartbeat registers the new key. Test in `convex/secrets.test.ts`.
2. **A key is saved while one of two engines has never started (no public key)** → it's locked for the started one only, and Connections lists the other as missing it once it starts. Test in Task 2 (`set` refuses an engine without a public key) and the `missing` logic in Task 5.
3. **A webhook channel (Twilio/Sendblue/BlueBubbles) is entered but no public URL is set** → the engine starts the other channels and reports "Set this engine's public URL in Connections" for that service instead of exiting. Test in Task 4.
4. **A stored value can't be opened (damaged, or locked for another workspace/engine/service)** → reported as an error on that service; the engine keeps running with the rest. Test in Task 3.
5. **An engine starts with nothing set up at all** → it stays connected and waits, logging what to do, instead of exiting as it does today. Test in Task 4.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `convex/lib/sealed.ts` (new) | Service list and field definitions, engine key pairs, fingerprints, `seal` / `unseal`, `checkFields`. Web Crypto only. |
| `convex/lib/sealed.test.ts` (new) | Round trips and refusals. |
| `convex/schema.ts` | `sealedService` validator, `runners.publicKey`, `runners.publicUrl`, `secrets` table. |
| `convex/secrets.ts` (new) | Owner API: `list`, `set`, `remove`. |
| `convex/runners.ts` | `setPublicUrl`; `revoke` also deletes the engine's secrets. |
| `convex/runner.ts` | `heartbeat` takes `publicKey` (clears secrets when it changes); new `dashboard` query for the engine. |
| `convex/secrets.test.ts` (new) | convex-test for all of the above. |
| `runner/src/identity.ts` (new) | Load or create the engine key pair file. |
| `runner/src/config.ts` | `macSetting`, no publicUrl throw, `withDashboard` merge, `openDashboard` unlock. |
| `runner/src/dashboard.test.ts` (new) | Merge precedence, unlock errors, identity file. |
| `runner/src/services.ts` (new) | Builds transports from settings, reporting problems instead of throwing. |
| `runner/src/server.ts` | `clearRoutes`, idempotent `start`. |
| `runner/src/pipeline.ts` | `update()` to swap transports, brains and email live. |
| `runner/src/sync.ts` | `onDashboard` subscription; `publicKey` in `Status`. |
| `runner/src/main.ts` | Wires it together; waits instead of exiting. |
| `runner/src/services.test.ts` (new) | `buildServices` cases. |
| `src/crm/key-form.tsx` (new) | Write-only key form per service. |
| `src/crm/views/connections.tsx` | Uses `KeyForm`, engine fingerprint and public URL, copy. |
| Copy files (Task 6) | "engine" wording, SECURITY.md, runner/README.md, .env.example. |

---

### Task 1: Shared locking module

**Files:**
- Create: `convex/lib/sealed.ts`
- Test: `convex/lib/sealed.test.ts`

**Interfaces:**
- Produces:
  - `SEALED_SERVICES: readonly ['openai','anthropic','google','xai','local','twilio','sendblue','bluebubbles','resend']`
  - `type SealedService`, `type SecretFields` (per-service field objects, below)
  - `FIELDS: { [S in SealedService]: Field[] }` where `Field = { name: string; label: string; secret: boolean; optional?: boolean; placeholder?: string }`
  - `newEngineKeys(): Promise<{ publicKey: string; privateKey: string }>` (base64 SPKI / PKCS8)
  - `fingerprint(publicKey: string): Promise<string>` → `"ab12 cd34 ef56 7890"`
  - `sealContext(workspaceId: string, runnerId: string, service: SealedService): string`
  - `seal(publicKey: string, context: string, fields: object): Promise<string>`
  - `unseal(privateKey: string, context: string, sealed: string): Promise<unknown>`
  - `checkFields<S extends SealedService>(service: S, value: unknown): SecretFields[S]` (trims; throws `"<Label> is missing"`)

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/sealed.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkFields, fingerprint, newEngineKeys, seal, sealContext, unseal } from './sealed'

describe('sealed keys', () => {
    it('opens what was locked for this engine and service', async () => {
        const keys = await newEngineKeys()
        const context = sealContext('ws1', 'r1', 'twilio')
        const sealed = await seal(keys.publicKey, context, { accountSid: 'AC1', authToken: 'tok' })
        expect(sealed.startsWith('s1:')).toBe(true)
        expect(sealed).not.toContain('tok')
        expect(await unseal(keys.privateKey, context, sealed)).toEqual({ accountSid: 'AC1', authToken: 'tok' })
    })

    it("won't open a value moved to another engine, service or workspace, or with another key", async () => {
        const keys = await newEngineKeys()
        const other = await newEngineKeys()
        const sealed = await seal(keys.publicKey, sealContext('ws1', 'r1', 'openai'), { apiKey: 'sk-1' })
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r2', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r1', 'anthropic'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws2', 'r1', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(other.privateKey, sealContext('ws1', 'r1', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r1', 'openai'), 'garbage')).rejects.toThrow(/Unreadable/)
    })

    it('gives the same short fingerprint for the same key', async () => {
        const keys = await newEngineKeys()
        const print = await fingerprint(keys.publicKey)
        expect(print).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/)
        expect(await fingerprint(keys.publicKey)).toBe(print)
    })

    it('checks and trims the fields each service needs', () => {
        expect(checkFields('bluebubbles', { serverUrl: ' http://mac:1234 ', password: 'pw' })).toEqual({ serverUrl: 'http://mac:1234', password: 'pw' })
        expect(checkFields('local', { url: 'http://localhost:11434/v1', key: '' })).toEqual({ url: 'http://localhost:11434/v1' })
        expect(() => checkFields('twilio', { accountSid: 'AC1' })).toThrow(/Auth token is missing/)
        expect(() => checkFields('openai', null)).toThrow(/Unreadable/)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/sealed.test.ts`
Expected: FAIL, cannot resolve `./sealed`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/sealed.ts
// Keys entered in the dashboard are locked in your browser so only your engine can open them; Convex stores the
// locked value and can't read it. Web Crypto only, so the same code runs in the browser, in the engine and in tests.

export const SEALED_SERVICES = ['openai', 'anthropic', 'google', 'xai', 'local', 'twilio', 'sendblue', 'bluebubbles', 'resend'] as const
export type SealedService = (typeof SEALED_SERVICES)[number]

export type SecretFields = {
    openai: { apiKey: string }
    anthropic: { apiKey: string }
    google: { apiKey: string }
    xai: { apiKey: string }
    local: { url: string; key?: string }
    twilio: { accountSid: string; authToken: string }
    sendblue: { keyId: string; secret: string }
    bluebubbles: { serverUrl: string; password: string }
    resend: { apiKey: string; from: string }
}

export type Field = { name: string; label: string; secret: boolean; optional?: boolean; placeholder?: string }

const apiKey = (placeholder: string): Field[] => [{ name: 'apiKey', label: 'API key', secret: true, placeholder }]

// What each service asks for, in form order
export const FIELDS: Record<SealedService, Field[]> = {
    openai: apiKey('sk-...'),
    anthropic: apiKey('sk-ant-...'),
    google: apiKey('AIza...'),
    xai: apiKey('xai-...'),
    local: [
        { name: 'url', label: 'Server URL', secret: false, placeholder: 'http://localhost:11434/v1' },
        { name: 'key', label: 'Key', secret: true, optional: true },
    ],
    twilio: [
        { name: 'accountSid', label: 'Account SID', secret: false, placeholder: 'AC...' },
        { name: 'authToken', label: 'Auth token', secret: true },
    ],
    sendblue: [
        { name: 'keyId', label: 'API key ID', secret: false },
        { name: 'secret', label: 'API secret', secret: true },
    ],
    bluebubbles: [
        { name: 'serverUrl', label: 'Server URL', secret: false, placeholder: 'https://your-mac.example.com' },
        { name: 'password', label: 'Password', secret: true },
    ],
    resend: [
        { name: 'apiKey', label: 'API key', secret: true, placeholder: 're_...' },
        { name: 'from', label: 'From address', secret: false, placeholder: 'alerts@yourdomain.com' },
    ],
}

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const
const VERSION = 's1'
const encode = (text: string) => new TextEncoder().encode(text)

function b64(bytes: ArrayBuffer | Uint8Array) {
    let text = ''
    for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) text += String.fromCharCode(b)
    return btoa(text)
}
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

// An engine's own key pair, made once on first run. Only the public half ever leaves the machine.
export async function newEngineKeys() {
    const pair = await crypto.subtle.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt'])
    return {
        publicKey: b64(await crypto.subtle.exportKey('spki', pair.publicKey)),
        privateKey: b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    }
}

// A short form of the public key, shown by the engine and in Connections so you can check they match
export async function fingerprint(publicKey: string) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(publicKey)))
    const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 16).match(/.{4}/g)!.join(' ')
}

// Bound to the locked value, so it won't open if moved to another workspace, engine or service
export const sealContext = (workspaceId: string, runnerId: string, service: SealedService) => `${workspaceId}:${runnerId}:${service}`

// A fresh AES-256-GCM key locks the value; the engine's public key locks that key
export async function seal(publicKey: string, context: string, fields: object) {
    const rsa = await crypto.subtle.importKey('spki', unb64(publicKey), RSA, false, ['encrypt'])
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(context) }, aes, encode(JSON.stringify(fields)))
    const wrapped = await crypto.subtle.encrypt(RSA, rsa, await crypto.subtle.exportKey('raw', aes))
    return [VERSION, b64(wrapped), b64(iv), b64(body)].join(':')
}

export async function unseal(privateKey: string, context: string, sealed: string): Promise<unknown> {
    const [version, wrapped, iv, body] = sealed.split(':')
    if (version !== VERSION || !wrapped || !iv || !body) throw new Error('Unreadable key')
    const rsa = await crypto.subtle.importKey('pkcs8', unb64(privateKey), RSA, false, ['decrypt'])
    const raw = await crypto.subtle.decrypt(RSA, rsa, unb64(wrapped))
    const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encode(context) }, aes, unb64(body))
    return JSON.parse(new TextDecoder().decode(text))
}

// The fields a service needs, trimmed; empty optional fields are left out
export function checkFields<S extends SealedService>(service: S, value: unknown): SecretFields[S] {
    if (!value || typeof value !== 'object') throw new Error('Unreadable key')
    const out: Record<string, string> = {}
    for (const field of FIELDS[service]) {
        const v = (value as Record<string, unknown>)[field.name]
        if (typeof v === 'string' && v.trim()) out[field.name] = v.trim()
        else if (!field.optional) throw new Error(`${field.label} is missing`)
    }
    return out as SecretFields[S]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/sealed.test.ts`
Expected: PASS (4 tests). RSA key generation takes ~1s per pair; that's expected.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/sealed.ts convex/lib/sealed.test.ts
git commit -m "Lock keys in the browser for one engine (Web Crypto)"
```

---

### Task 2: Convex storage and API

**Files:**
- Modify: `convex/schema.ts` (runners table ~line 156; add `sealedService` after `service`; add `secrets` table)
- Create: `convex/secrets.ts`
- Modify: `convex/runners.ts` (`revoke`, new `setPublicUrl`)
- Modify: `convex/runner.ts` (`heartbeat`, new `dashboard` query)
- Test: `convex/secrets.test.ts`

**Interfaces:**
- Consumes: `SEALED_SERVICES` from Task 1 (for the validator).
- Produces:
  - `api.secrets.list: () => { service: SealedService; runnerIds: Id<'runners'>[]; updatedAt: number }[]`
  - `api.secrets.set: ({ service, sealed: { runnerId: Id<'runners'>; sealed: string }[] }) => null`
  - `api.secrets.remove: ({ service }) => null`
  - `api.runners.setPublicUrl: ({ id: Id<'runners'>; publicUrl?: string }) => null`
  - `api.runner.heartbeat` gains optional arg `publicKey: string`
  - `api.runner.dashboard: ({ token }) => { workspaceId: Id<'workspace'>; runnerId: Id<'runners'>; publicUrl?: string; secrets: { service: SealedService; sealed: string }[] }`
  - `runners.list` rows now include `publicKey?` and `publicUrl?`.

- [ ] **Step 1: Read `convex/_generated/ai/guidelines.md`** (required by CLAUDE.md before Convex work).

- [ ] **Step 2: Write the failing tests**

```ts
// convex/secrets.test.ts
// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')
const KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA' // any base64; Convex never parses it
const SEALED = 's1:d3JhcHBlZA==:aXY=:Ym9keQ=='

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const t = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

async function setup() {
    const base = convexTest(schema, modules)
    const owner = await user(base)
    const engine = async (name: string, publicKey?: string) => {
        const token = newToken()
        const runnerId = await owner.mutation(api.runners.create, { name, tokenHash: await hashToken(token) })
        const beat = (key = publicKey) => base.mutation(api.runner.heartbeat, { token, version: '0.3.0', services: [], models: [], channels: [], lines: [], demo: false, publicKey: key })
        if (publicKey) await beat()
        return { token, runnerId, beat }
    }
    return { base, owner, engine }
}

describe('keys entered in the dashboard', () => {
    it('stores locked values per engine and never returns them to the dashboard', async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        const list = await owner.query(api.secrets.list, {})
        expect(list).toEqual([{ service: 'openai', runnerIds: [mac.runnerId], updatedAt: expect.any(Number) }])
        expect(JSON.stringify(list)).not.toContain(SEALED)
        const dashboard = await base.query(api.runner.dashboard, { token: mac.token })
        expect(dashboard.secrets).toEqual([{ service: 'openai', sealed: SEALED }])
    })

    it('replaces a service on save and deletes it on remove', async () => {
        const { owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: 's1:bmV3:aXY=:Ym9keQ==' }] })
        expect(await owner.query(api.secrets.list, {})).toHaveLength(1)
        await owner.mutation(api.secrets.remove, { service: 'openai' })
        expect(await owner.query(api.secrets.list, {})).toEqual([])
    })

    it("gives each engine only its own values, and refuses a bad token", async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        const vm = await engine('VM', KEY)
        await owner.mutation(api.secrets.set, {
            service: 'twilio',
            sealed: [
                { runnerId: mac.runnerId, sealed: SEALED },
                { runnerId: vm.runnerId, sealed: 's1:dm0=:aXY=:Ym9keQ==' },
            ],
        })
        expect((await base.query(api.runner.dashboard, { token: vm.token })).secrets).toEqual([{ service: 'twilio', sealed: 's1:dm0=:aXY=:Ym9keQ==' }])
        await expect(base.query(api.runner.dashboard, { token: newToken() })).rejects.toThrow(/invalid or was revoked/)
    })

    it("refuses another workspace's engine, an engine that hasn't started, and other users", async () => {
        const { base, owner, engine } = await setup()
        const fresh = await engine('Never started')
        await expect(owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: fresh.runnerId, sealed: SEALED }] })).rejects.toThrow(/hasn’t started yet/)
        const other = await user(base, 'Ali')
        const mac = await engine('Mac mini', KEY)
        await expect(other.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })).rejects.toThrow(/Not found/)
        await expect(base.query(api.secrets.list, {})).rejects.toThrow(/Sign in/)
        await expect(owner.mutation(api.secrets.set, { service: 'openai', sealed: [] })).rejects.toThrow(/start it once/)
    })

    it('forgets an engine’s values when its key changes or it is revoked', async () => {
        const { owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await mac.beat(KEY) // same key: kept
        expect(await owner.query(api.secrets.list, {})).toHaveLength(1)
        await mac.beat(KEY + 'AA') // new key pair (data directory wiped): the old values can't be opened anymore
        expect(await owner.query(api.secrets.list, {})).toEqual([])
        await mac.beat(KEY + 'AA')
        await owner.mutation(api.secrets.set, { service: 'openai', sealed: [{ runnerId: mac.runnerId, sealed: SEALED }] })
        await owner.mutation(api.runners.revoke, { id: mac.runnerId })
        expect(await owner.query(api.secrets.list, {})).toEqual([])
    })

    it('stores a public URL per engine for the engine to read', async () => {
        const { base, owner, engine } = await setup()
        const mac = await engine('Mac mini', KEY)
        await owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId, publicUrl: ' https://bots.example.com/ ' })
        expect((await base.query(api.runner.dashboard, { token: mac.token })).publicUrl).toBe('https://bots.example.com')
        await expect(owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId, publicUrl: 'bots.example.com' })).rejects.toThrow(/https:\/\//)
        await owner.mutation(api.runners.setPublicUrl, { id: mac.runnerId })
        expect((await base.query(api.runner.dashboard, { token: mac.token })).publicUrl).toBeUndefined()
    })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run convex/secrets.test.ts`
Expected: FAIL (`api.secrets` undefined / heartbeat rejects `publicKey`).

- [ ] **Step 4: Schema**

In `convex/schema.ts`, add the validator after `service`, listing the services in the order of `SEALED_SERVICES` (Task 1):

```ts
// The services whose keys can be entered in the dashboard (see convex/lib/sealed.ts)
export const sealedService = v.union(
    v.literal('openai'),
    v.literal('anthropic'),
    v.literal('google'),
    v.literal('xai'),
    v.literal('local'),
    v.literal('twilio'),
    v.literal('sendblue'),
    v.literal('bluebubbles'),
    v.literal('resend'),
)
```

In the `runners` table, after `demo`:

```ts
        // Public half of the engine's own key pair: the dashboard locks your keys with it
        publicKey: v.optional(v.string()),
        // Where Twilio, Sendblue or BlueBubbles reach this engine, set in Connections (not secret)
        publicUrl: v.optional(v.string()),
```

After the `tasks` table:

```ts
    // Keys entered in the dashboard, locked in the browser for one engine; Convex can't open them
    secrets: defineTable({
        ...ws,
        runnerId: v.id('runners'),
        service: sealedService,
        sealed: v.string(),
        updatedAt: v.number(),
    })
        .index('by_workspace_and_service', ['workspaceId', 'service'])
        .index('by_runnerId', ['runnerId']),
```

Add `'secrets'` to the `Owned` union in `convex/lib/access.ts` only if you use `owned()` on it (this plan doesn't).

- [ ] **Step 5: `convex/secrets.ts`**

```ts
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { sealedService } from './schema'

// Keys you enter in Connections. The browser locks each one for every engine you run; this file only ever handles
// the locked values, and never sends them back to the dashboard.

// Which services have a key saved, on which engines, and when
export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', ws._id))
            .take(500)
        const byService = new Map<string, { service: (typeof rows)[number]['service']; runnerIds: Id<'runners'>[]; updatedAt: number }>()
        for (const row of rows) {
            const entry = byService.get(row.service) ?? { service: row.service, runnerIds: [], updatedAt: 0 }
            entry.runnerIds.push(row.runnerId)
            entry.updatedAt = Math.max(entry.updatedAt, row.updatedAt)
            byService.set(row.service, entry)
        }
        return [...byService.values()]
    },
})

async function clear(ctx: MutationCtx, workspaceId: Id<'workspace'>, service: (typeof sealedService)['type']) {
    const rows = await ctx.db
        .query('secrets')
        .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', workspaceId).eq('service', service))
        .take(100)
    for (const row of rows) await ctx.db.delete('secrets', row._id)
}

// Saves (or replaces) one service's key, locked once per engine
export const set = mutation({
    args: { service: sealedService, sealed: v.array(v.object({ runnerId: v.id('runners'), sealed: v.string() })) },
    handler: async (ctx, { service, sealed }) => {
        const ws = await requireWorkspace(ctx)
        if (!sealed.length) throw new Error('Add your engine and start it once, then enter keys here')
        if (sealed.length > 50 || new Set(sealed.map((s) => s.runnerId)).size !== sealed.length) throw new Error('One value per engine')
        for (const s of sealed) {
            const runner = await owned(ctx, ws, 'runners', s.runnerId)
            if (!runner.publicKey) throw new Error(`${runner.name} hasn’t started yet. Start it once, then save again.`)
            if (s.sealed.length > 8_000 || !s.sealed.startsWith('s1:')) throw new Error('That key couldn’t be locked. Reload the page and try again.')
        }
        await clear(ctx, ws._id, service)
        const updatedAt = Date.now()
        for (const s of sealed) await ctx.db.insert('secrets', { workspaceId: ws._id, runnerId: s.runnerId, service, sealed: s.sealed, updatedAt })
        return null
    },
})

// Removes one service's key from every engine; an environment variable on the engine takes over, if set
export const remove = mutation({
    args: { service: sealedService },
    handler: async (ctx, { service }) => {
        const ws = await requireWorkspace(ctx)
        await clear(ctx, ws._id, service)
        return null
    },
})
```

- [ ] **Step 6: `convex/runners.ts`**

Change `revoke` to also delete the engine's locked values, and add `setPublicUrl`:

```ts
// The engine using this token is cut off on its next call, and the keys locked for it are deleted
export const revoke = mutation({
    args: { id: v.id('runners') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'runners', id)
        for (const row of await ctx.db.query('secrets').withIndex('by_runnerId', (q) => q.eq('runnerId', id)).take(100)) await ctx.db.delete('secrets', row._id)
        await ctx.db.delete('runners', id)
    },
})

// Where your accounts reach this engine. Not secret, so it's stored as is.
export const setPublicUrl = mutation({
    args: { id: v.id('runners'), publicUrl: v.optional(v.string()) },
    handler: async (ctx, { id, publicUrl }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'runners', id)
        const url = publicUrl?.trim().replace(/\/+$/, '') || undefined
        if (url && !/^https?:\/\/[^\s/]+/.test(url)) throw new Error('Enter a URL starting with https://')
        if (url && url.length > 300) throw new Error('That URL is too long')
        await ctx.db.patch('runners', id, { publicUrl: url })
        return null
    },
})
```

- [ ] **Step 7: `convex/runner.ts`**

In `heartbeat`, add `publicKey: v.optional(v.string())` to `args`, and replace the handler body:

```ts
    handler: async (ctx, { token, publicKey, ...status }) => {
        const runner = await runnerFor(ctx, token)
        if (status.models.length > 500 || status.lines.length > 200 || status.services.length > 20 || status.channels.length > 10) throw new Error('Too much to report')
        if (publicKey !== undefined && (publicKey.length > 1_000 || !/^[A-Za-z0-9+/=]+$/.test(publicKey))) throw new Error('Unreadable public key')
        // A new key pair (the engine's data folder was wiped) can't open values locked for the old one
        if (publicKey && runner.publicKey && publicKey !== runner.publicKey) {
            for (const row of await ctx.db.query('secrets').withIndex('by_runnerId', (q) => q.eq('runnerId', runner._id)).take(100)) await ctx.db.delete('secrets', row._id)
        }
        await ctx.db.patch('runners', runner._id, { ...status, ...(publicKey ? { publicKey } : {}), lastSeenAt: Date.now() })
    },
```

Update the file's top comment: "None of them accepts or returns message text, contact details or readable credentials; `dashboard` returns keys locked for this engine only."

Add the engine's query:

```ts
// The keys entered in the dashboard, locked for this engine, plus its public URL (reactive)
export const dashboard = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const runner = await runnerFor(ctx, token)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_runnerId', (q) => q.eq('runnerId', runner._id))
            .take(50)
        return { workspaceId: runner.workspaceId, runnerId: runner._id, publicUrl: runner.publicUrl, secrets: rows.map(({ service, sealed }) => ({ service, sealed })) }
    },
})
```

- [ ] **Step 8: Regenerate types and run tests**

Run: `npx convex codegen` (if it needs a deployment, run `npx convex dev --once` against dev instead), then `npx vitest run convex/`
Expected: PASS, including the existing `convex/runner.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add convex/schema.ts convex/secrets.ts convex/secrets.test.ts convex/runners.ts convex/runner.ts convex/_generated
git commit -m "Store keys locked for each engine; engines report their public key"
```

---

### Task 3: Engine identity and settings merge

**Files:**
- Create: `runner/src/identity.ts`
- Modify: `runner/src/config.ts`
- Test: `runner/src/dashboard.test.ts`

**Interfaces:**
- Consumes: `newEngineKeys`, `unseal`, `sealContext`, `checkFields`, `SealedService`, `SecretFields` (Task 1); the shape of `api.runner.dashboard` (Task 2).
- Produces:
  - `loadEngineKeys(dir: string): Promise<{ publicKey: string; privateKey: string }>`
  - `Settings` gains `macSetting?: boolean`; `loadSettings` no longer throws when `OPENBOTS_PUBLIC_URL` is missing
  - `type DashboardValues = { publicUrl?: string; secrets: Partial<{ [S in SealedService]: SecretFields[S] }> }`
  - `withDashboard(base: Settings, d: DashboardValues): Settings`
  - `type DashboardDoc = { workspaceId: string; runnerId: string; publicUrl?: string; secrets: { service: SealedService; sealed: string }[] }`
  - `openDashboard(privateKey: string, doc: DashboardDoc): Promise<{ values: DashboardValues; problems: { service: SealedService; error: string }[] }>`

- [ ] **Step 1: Write the failing tests**

```ts
// runner/src/dashboard.test.ts
// @vitest-environment node
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { newEngineKeys, seal, sealContext } from '../../convex/lib/sealed'
import { loadSettings, openDashboard, withDashboard } from './config'
import { loadEngineKeys } from './identity'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENAI_API_KEY: 'sk-env', OPENBOTS_MAC: 'false' }
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('keys from the dashboard', () => {
    it('beat environment variables, and removing them falls back', () => {
        const base = loadSettings(ENV)
        const merged = withDashboard(base, { publicUrl: 'https://bots.example.com/', secrets: { openai: { apiKey: 'sk-dash' }, twilio: { accountSid: 'AC1', authToken: 't' } } })
        expect(merged.brains.keys.openai).toBe('sk-dash')
        expect(merged.twilio).toEqual({ accountSid: 'AC1', authToken: 't' })
        expect(merged.publicUrl).toBe('https://bots.example.com')
        expect(withDashboard(base, { secrets: {} }).brains.keys.openai).toBe('sk-env')
    })

    it('starts with no texting channel and no public URL instead of refusing', () => {
        const base = loadSettings({ ...ENV, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' })
        expect(base.publicUrl).toBeUndefined()
        expect(base.twilio).toBeDefined()
    })

    it('opens what was locked for this engine and reports what it can’t', async () => {
        const keys = await newEngineKeys()
        const doc = {
            workspaceId: 'ws1',
            runnerId: 'r1',
            secrets: [
                { service: 'anthropic' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r1', 'anthropic'), { apiKey: 'sk-ant' }) },
                // Locked for another engine
                { service: 'openai' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r2', 'openai'), { apiKey: 'sk-1' }) },
                // Missing a field
                { service: 'resend' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r1', 'resend'), { apiKey: 're_1' }) },
            ],
        }
        const { values, problems } = await openDashboard(keys.privateKey, doc)
        expect(values.secrets).toEqual({ anthropic: { apiKey: 'sk-ant' } })
        expect(problems).toEqual([
            { service: 'openai', error: expect.stringMatching(/enter it again/) },
            { service: 'resend', error: expect.stringMatching(/From address is missing/) },
        ])
    })

    it('makes its key pair once and keeps it private', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'engine-'))
        dirs.push(dir)
        const first = await loadEngineKeys(dir)
        expect(await loadEngineKeys(dir)).toEqual(first)
        expect(statSync(join(dir, 'engine-key.json')).mode & 0o777).toBe(0o600)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run runner/src/dashboard.test.ts`
Expected: FAIL (`identity` missing, `withDashboard` not exported).

- [ ] **Step 3: `runner/src/identity.ts`**

```ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newEngineKeys } from '../../convex/lib/sealed'

export type EngineKeys = { publicKey: string; privateKey: string }

// This engine's key pair, made on first run and kept next to the history (readable only by you). The dashboard
// locks your keys with the public half; only this file can open them.
export async function loadEngineKeys(dir: string): Promise<EngineKeys> {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const path = join(dir, 'engine-key.json')
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(await newEngineKeys()), { mode: 0o600, flag: 'wx' })
    chmodSync(path, 0o600)
    const keys = JSON.parse(readFileSync(path, 'utf8')) as Partial<EngineKeys>
    if (typeof keys.publicKey !== 'string' || typeof keys.privateKey !== 'string')
        throw new Error(`${path} isn't a valid engine key file. Delete it to make a new one, then enter your keys in Connections again.`)
    return { publicKey: keys.publicKey, privateKey: keys.privateKey }
}
```

- [ ] **Step 4: `runner/src/config.ts`**

1. Add to `Settings`: `// OPENBOTS_MAC as set; unset means "on a Mac with no other texting"` and `macSetting?: boolean`.
2. In `loadSettings`, delete the line that pushes `'OPENBOTS_PUBLIC_URL (where Twilio, Sendblue or BlueBubbles reach this agent)'` into `missing`.
3. Replace the `macSetting` / `mac` lines with:

```ts
    const macRaw = get('OPENBOTS_MAC')
    const macSetting = macRaw ? macRaw === 'true' : undefined
```

and in the returned object put `macSetting, mac: resolveMac({ macSetting, relay, twilio, sendblue, bluebubbles }),`.

4. Add below `loadSettings`:

```ts
// Messages on this Mac: on by default on macOS when no other way to text is set up
const resolveMac = (s: Pick<Settings, 'macSetting' | 'relay' | 'twilio' | 'sendblue' | 'bluebubbles'>) =>
    s.macSetting ?? (platform() === 'darwin' && !s.relay && !s.twilio && !s.sendblue && !s.bluebubbles)

export type DashboardValues = { publicUrl?: string; secrets: Partial<{ [S in SealedService]: SecretFields[S] }> }

// Keys from the dashboard over the environment: what you entered in Connections wins, and removing it there falls
// back to the environment variable
export function withDashboard(base: Settings, d: DashboardValues): Settings {
    const s = d.secrets
    const keys = { ...base.brains.keys }
    for (const provider of ['openai', 'anthropic', 'google', 'xai'] as const) if (s[provider]) keys[provider] = s[provider].apiKey
    const merged: Settings = {
        ...base,
        publicUrl: d.publicUrl?.replace(/\/+$/, '') || base.publicUrl,
        twilio: s.twilio ?? base.twilio,
        sendblue: s.sendblue ?? base.sendblue,
        bluebubbles: s.bluebubbles ?? base.bluebubbles,
        resend: s.resend ?? base.resend,
        brains: { ...base.brains, keys, local: s.local ? { url: s.local.url, key: s.local.key } : base.brains.local },
    }
    return { ...merged, mac: resolveMac(merged) }
}

export type DashboardDoc = { workspaceId: string; runnerId: string; publicUrl?: string; secrets: { service: SealedService; sealed: string }[] }

// Opens each key locked for this engine. One that won't open is reported for its service, not fatal.
export async function openDashboard(privateKey: string, doc: DashboardDoc) {
    const values: DashboardValues = { publicUrl: doc.publicUrl, secrets: {} }
    const problems: { service: SealedService; error: string }[] = []
    for (const { service, sealed } of doc.secrets) {
        let opened: unknown
        try {
            opened = await unseal(privateKey, sealContext(doc.workspaceId, doc.runnerId, service), sealed)
        } catch {
            problems.push({ service, error: 'The key saved in the dashboard can’t be opened on this engine; enter it again in Connections' })
            continue
        }
        try {
            ;(values.secrets as Record<string, unknown>)[service] = checkFields(service, opened)
        } catch (e) {
            problems.push({ service, error: `${e instanceof Error ? e.message : String(e)}; enter it again in Connections` })
        }
    }
    return { values, problems }
}
```

with imports `import { checkFields, sealContext, unseal, type SealedService, type SecretFields } from '../../convex/lib/sealed'`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run runner/src/`
Expected: PASS (new tests plus existing `agent.test.ts`, `transports.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add runner/src/identity.ts runner/src/config.ts runner/src/dashboard.test.ts
git commit -m "Engine: own key pair, and dashboard keys merged over the environment"
```

---

### Task 4: Engine applies changes live

**Files:**
- Create: `runner/src/services.ts`
- Modify: `runner/src/server.ts`, `runner/src/pipeline.ts`, `runner/src/sync.ts`, `runner/src/main.ts`
- Test: `runner/src/services.test.ts`

**Interfaces:**
- Consumes: `Settings`, `withDashboard`, `openDashboard`, `DashboardDoc` (Task 3); `loadEngineKeys` (Task 3); `fingerprint` (Task 1); `api.runner.dashboard`, heartbeat `publicKey` (Task 2).
- Produces:
  - `buildServices(settings: Settings, deps: { server: Server; store: Store; secret: string }): { transports: Partial<Record<Channel, Transport>>; twilio?: TwilioTransport; problems: { service: 'twilio' | 'sendblue' | 'bluebubbles'; error: string }[] }`
  - `Server.clearRoutes(): void`; `Server.start()` is a no-op when already listening
  - `Pipeline.update(parts: Partial<Pick<Deps, 'transports' | 'brains' | 'email'>>): void`
  - `ConvexLink.onDashboard(cb: (doc: DashboardDoc) => void): void`; `Status.publicKey?: string`

- [ ] **Step 1: Write the failing test**

```ts
// runner/src/services.test.ts
// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSettings, withDashboard } from './config'
import { Vault } from './crypto'
import { Server } from './server'
import { buildServices } from './services'
import { Store } from './store'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENBOTS_MAC: 'false' }
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

function deps() {
    const dir = mkdtempSync(join(tmpdir(), 'services-'))
    dirs.push(dir)
    return { server: new Server({ host: '127.0.0.1', port: 0 }), store: new Store(join(dir, 'db'), Vault.open(dir)), secret: 's3cret' }
}

describe('texting services', () => {
    it('builds nothing, without failing, when nothing is set up', () => {
        const built = buildServices(loadSettings(ENV), deps())
        expect(built.transports).toEqual({})
        expect(built.problems).toEqual([])
    })

    it('reports a webhook channel without a public URL instead of starting it', () => {
        const settings = withDashboard(loadSettings(ENV), { secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeUndefined()
        expect(built.problems).toEqual([{ service: 'twilio', error: expect.stringMatching(/public URL/) }])
    })

    it('starts it once the public URL is set', () => {
        const settings = withDashboard(loadSettings(ENV), { publicUrl: 'https://bots.example.com', secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeDefined()
        expect(built.twilio).toBe(built.transports.twilio)
        expect(built.problems).toEqual([])
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run runner/src/services.test.ts`
Expected: FAIL, cannot resolve `./services`.

- [ ] **Step 3: `runner/src/services.ts`**

```ts
import type { Settings } from './config'
import type { Server } from './server'
import type { Store } from './store'
import { BlueBubblesTransport } from './transports/bluebubbles'
import { MacTransport } from './transports/mac'
import { RelayTransport } from './transports/relay'
import { SendblueTransport } from './transports/sendblue'
import { TwilioTransport } from './transports/twilio'
import type { Channel, Transport } from './transports/types'

type Webhooked = 'twilio' | 'sendblue' | 'bluebubbles'

// The ways this engine can text, from its current settings. A channel that can't start yet (no public URL for its
// webhooks) is reported instead, so the rest still run.
export function buildServices(settings: Settings, deps: { server: Server; store: Store; secret: string }) {
    const transports: Partial<Record<Channel, Transport>> = {}
    const problems: { service: Webhooked; error: string }[] = []
    // Webhook paths carry a random secret, so only your accounts know where to post
    const hook = (channel: Channel) => `${settings.publicUrl}/hooks/${channel}/${deps.secret}`
    const reachable = (service: Webhooked) => {
        if (settings.publicUrl) return true
        problems.push({ service, error: 'Set this engine’s public URL in Connections, so your account can reach it' })
        return false
    }

    if (settings.mac) transports.mac = new MacTransport(deps.store)
    if (settings.relay) transports.relay = new RelayTransport(deps.server, settings.relay)
    let twilio: TwilioTransport | undefined
    if (settings.twilio && reachable('twilio')) transports.twilio = twilio = new TwilioTransport(deps.server, settings.twilio, hook('twilio'))
    if (settings.sendblue && reachable('sendblue')) transports.sendblue = new SendblueTransport(deps.server, settings.sendblue, hook('sendblue'))
    if (settings.bluebubbles && reachable('bluebubbles')) transports.bluebubbles = new BlueBubblesTransport(deps.server, settings.bluebubbles, hook('bluebubbles'))
    return { transports, twilio, problems }
}

export type Services = ReturnType<typeof buildServices>
```

- [ ] **Step 4: `runner/src/server.ts`**

Add to `Server`:

```ts
    // Before the channels are rebuilt with new settings; each new one adds its route again
    clearRoutes() {
        this.routes.clear()
    }
```

and make `start` idempotent by adding `if (this.server) return` as its first line.

- [ ] **Step 5: `runner/src/pipeline.ts`**

Add to `Pipeline` (after the constructor):

```ts
    // New channels, keys or email after a change in the dashboard; texts already queued use them when they go out
    update(parts: Partial<Pick<Deps, 'transports' | 'brains' | 'email'>>) {
        Object.assign(this.deps, parts)
    }
```

Add a test to `runner/src/agent.test.ts` in the existing reply describe block, using its `setup()` helper:

```ts
    it('uses new keys after an update', async () => {
        const { pipeline, complete, text } = await setup()
        pipeline.update({ brains: { keys: { anthropic: 'sk-new' }, demo: false } })
        await text('hello')
        await vi.runAllTimersAsync()
        expect(complete.mock.calls.at(-1)?.[0]).toMatchObject({ keys: { anthropic: 'sk-new' } })
    })
```

(Adjust `vi.runAllTimersAsync()` to whatever the neighbouring reply tests use to flush the reply delay; copy their pattern exactly.)

- [ ] **Step 6: `runner/src/sync.ts`**

Add `publicKey?: string` to `Status`, import `type { DashboardDoc } from './config'`, and add to `ConvexLink`:

```ts
    // Keys entered in the dashboard (locked for this engine) and its public URL, now and whenever they change
    onDashboard(onChange: (doc: DashboardDoc) => void) {
        const sub = this.client.onUpdate(api.runner.dashboard, { token: this.token }, onChange, (error) => console.error(`Couldn't read your keys from the dashboard: ${reason(error)}`))
        this.unsubscribers.push(() => sub.unsubscribe())
    }
```

`heartbeat(status)` already spreads `status`, so `publicKey` goes through.

- [ ] **Step 7: `runner/src/main.ts`**

Rewrite `main()` so services come from `buildServices` and are rebuilt when the dashboard changes. Replace everything from `const settings = loadSettings()` through the `console.log(\`Answering through …\`)` line with:

```ts
    const base = loadSettings()
    const store = new Store(join(base.dataDir, 'openbots.db'), Vault.open(base.dataDir))
    const engineKeys = await loadEngineKeys(base.dataDir)
    const link = new ConvexLink(base.convexUrl, base.token)

    console.log(`OpenBots engine ${VERSION}: connecting to your workspace…`)
    console.log(`Engine key ${await fingerprint(engineKeys.publicKey)} (Connections shows the same for this engine)`)
    await link.connect((m) => console.error(m))

    const secret = store.getMeta('hooks.secret') ?? randomBytes(18).toString('base64url')
    store.setMeta('hooks.secret', secret)
    const server = new Server({ host: base.host, port: base.port })

    let settings = withDashboard(base, { secrets: {} })
    let services: Services = { transports: {}, problems: [] }
    let keyProblems: { service: SealedService; error: string }[] = []
    let status: Status = { version: VERSION, services: [], models: [], channels: [], lines: [], demo: base.brains.demo, publicKey: engineKeys.publicKey }
    const pipeline = new Pipeline({ store, link, transports: {}, brains: settings.brains, models: () => status.models })

    // Stops the channels, rebuilds them from the new settings and starts them again
    const apply = async (next: Settings) => {
        for (const t of Object.values(services.transports)) await t.stop()
        server.clearRoutes()
        settings = next
        services = buildServices(settings, { server, store, secret })
        const resend = settings.resend
        pipeline.update({ transports: services.transports, brains: settings.brains, email: resend ? (to, subject, text) => sendEmail(resend, to, subject, text) : undefined })
        for (const t of Object.values(services.transports)) await t.start((text) => pipeline.receive(text))
        if (server.hasRoutes) await server.start()
        status = { ...status, channels: Object.keys(services.transports) as Channel[] }
        const channels = Object.keys(services.transports)
        console.log(channels.length ? `Answering through ${channels.join(', ')}${server.hasRoutes ? ` (listening on ${base.host}:${base.port})` : ''}.` : 'No way to text is set up yet. Add one in Connections, or set it on this engine. Waiting…')
    }
```

Then in `checkAll`, change `settings[s]` to read the current `settings`, `transports` to `services.transports`, and append the problems:

```ts
            services: [
                ...keys.results.map((r) => ({ service: r.provider, label: r.error ? undefined : `${r.count} models`, error: r.error })),
                ...checked,
                ...services.problems,
                ...keyProblems,
            ],
```

Replace the old `checkAll(); beat(); timers` startup lines and the `pipeline.resume()` / transport start lines with a serialized dashboard subscription:

```ts
    const beat = () => link.heartbeat(status).catch((e) => console.error(`Heartbeat failed: ${message(e)}`))
    let applied = ''
    let chain = Promise.resolve()
    let resumed = false
    const ready = new Promise<void>((resolve) => {
        link.onDashboard((doc) => {
            chain = chain
                .then(async () => {
                    const opened = await openDashboard(engineKeys.privateKey, doc)
                    keyProblems = opened.problems
                    const next = withDashboard(base, opened.values)
                    const fingerprintOf = JSON.stringify(next)
                    if (fingerprintOf !== applied) {
                        applied = fingerprintOf
                        await apply(next)
                    }
                    await checkAll()
                    await beat()
                    if (!resumed) {
                        resumed = true
                        pipeline.resume()
                        resolve()
                    }
                })
                .catch((e) => console.error(`Couldn't apply your dashboard keys: ${message(e)}`))
        })
    })
    await ready
    const timers = [setInterval(beat, HEARTBEAT_MS), setInterval(() => void checkAll().then(beat), CHECK_MS)]
```

In the task runner (`run`), replace `twilio` with `services.twilio` and the message "Twilio isn't set up on this agent" with "Twilio isn't set up on this engine". In `shutdown`, stop `services.transports`. Remove the old `throw new Error('Set up at least one way to text …')`. Imports to add: `withDashboard, openDashboard, type Settings` from `./config`; `loadEngineKeys` from `./identity`; `buildServices, type Services` from `./services`; `fingerprint, type SealedService` from `../../convex/lib/sealed`. Remove the transport class imports main no longer uses.

- [ ] **Step 8: Run tests and build the engine**

Run: `npx vitest run runner/src/ && npm run runner:build && npx tsc -b`
Expected: all PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add runner/src
git commit -m "Engine waits for keys and applies dashboard changes without a restart"
```

---

### Task 5: Key forms in Connections

**Files:**
- Create: `src/crm/key-form.tsx`
- Modify: `src/crm/views/connections.tsx`

**Interfaces:**
- Consumes: `FIELDS`, `seal`, `sealContext`, `checkFields`, `fingerprint`, `SealedService` (Task 1); `api.secrets.list/set/remove`, `api.runners.setPublicUrl`, `runners.list` rows with `publicKey` / `publicUrl` (Task 2); `api.workspace.get`.
- Produces: `KeyForm({ service, runners, saved })` component.

- [ ] **Step 1: `src/crm/key-form.tsx`**

```tsx
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertCircle, Lock } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { checkFields, FIELDS, seal, sealContext, type SealedService } from '@convex/lib/sealed'
import { Input } from '@/components/ui/input'
import { relativeTime } from './lib/time'
import { useNow } from './use-now'
import { useRun } from './use-run'
import { Btn, ConfirmDelete } from './ui'

type Runner = Omit<Doc<'runners'>, 'tokenHash'>
export type Saved = { service: SealedService; runnerIds: Id<'runners'>[]; updatedAt: number }

// A key entered here is locked in this browser for each of your engines before it's sent, so Convex stores only
// what it can't open. The field is write-only: once saved, it shows when, never the key.
export function KeyForm({ service, runners, saved }: { service: SealedService; runners: Runner[]; saved?: Saved }) {
    const ws = useQuery(api.workspace.get)
    const set = useMutation(api.secrets.set)
    const remove = useMutation(api.secrets.remove)
    const run = useRun()
    const now = useNow(60_000)
    const [open, setOpen] = useState(false)
    const [values, setValues] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const started = runners.filter((r) => r.publicKey)
    // Engines added (or reset) after this key was saved can't open it
    const missing = saved ? started.filter((r) => !saved.runnerIds.includes(r._id)) : []

    const save = async () => {
        if (!ws) return
        let fields
        try {
            fields = checkFields(service, values)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            return
        }
        setSaving(true)
        const sealed = await Promise.all(started.map(async (r) => ({ runnerId: r._id, sealed: await seal(r.publicKey!, sealContext(ws._id, r._id, service), fields) })))
        const res = await run(set({ service, sealed }))
        setSaving(false)
        if (res.ok) {
            setValues({})
            setError(null)
            setOpen(false)
        }
    }

    if (!started.length) return <p className="text-[12px] text-neutral-500">Add your engine above and start it once, then enter this key here.</p>

    return (
        <div className="space-y-2">
            {saved && (
                <p className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                    <Lock className="size-3.5" />
                    Saved {relativeTime(saved.updatedAt, now)}, readable only by your engine
                </p>
            )}
            {missing.length > 0 && (
                <p className="flex items-center gap-1.5 text-[12px] text-amber-700">
                    <AlertCircle className="size-3.5" />
                    Not on {missing.map((r) => r.name).join(', ')} yet: enter it again to add it there
                </p>
            )}
            {open ? (
                <form
                    className="space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void save()
                    }}>
                    {FIELDS[service].map((f) => (
                        <Input
                            key={f.name}
                            aria-label={f.label}
                            type={f.secret ? 'password' : 'text'}
                            autoComplete="off"
                            placeholder={`${f.label}${f.optional ? ' (optional)' : ''}${f.placeholder ? `: ${f.placeholder}` : ''}`}
                            value={values[f.name] ?? ''}
                            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                            className="h-8"
                        />
                    ))}
                    {error && <p className="text-[12px] text-destructive">{error}</p>}
                    <div className="flex gap-2">
                        <Btn type="submit" variant="primary" disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Btn>
                        <Btn type="button" variant="ghost" onClick={() => setOpen(false)}>
                            Cancel
                        </Btn>
                    </div>
                </form>
            ) : (
                <div className="flex items-center gap-2">
                    <Btn variant={saved ? 'default' : 'primary'} onClick={() => setOpen(true)}>
                        {saved ? 'Replace' : 'Add key'}
                    </Btn>
                    {saved && <ConfirmDelete label="Remove" what={`the saved ${service} key`} onConfirm={() => void run(remove({ service }))} />}
                </div>
            )}
        </div>
    )
}
```

Check `Btn`'s variant names in `src/crm/ui.tsx` before using `'default'`; use the neutral one it defines. Button colours follow the project rule: primary for the main action.

- [ ] **Step 2: `src/crm/views/connections.tsx`**

1. `ConnectionsView`: `const saved = useQuery(api.secrets.list)`; pass `saved={saved?.find((s) => s.service === id)}` into `ServiceCard`.
2. `ServiceCard`: for ids in `SEALED_SERVICES`, render `<KeyForm service={id} runners={runners} saved={saved} />` in the card body (below the status line, and in place of the numbered env steps when not set up). Keep the env var chips under a small "Or set on your engine:" label so both routes are visible. Mac and relay cards keep their current steps.
3. Change each `steps` entry in `INFO` that says "Set it on your agent and restart it." to "Paste it here, or set it on your engine." and the BlueBubbles/Sendblue/Twilio steps to say "Enter its URL and password here (or set them on your engine), plus this engine’s public URL above." Adjust each to its own fields.
4. Engines list (the `Agents` component, rename it `Engines`): under each row show `Key <fingerprint>` (compute with `fingerprint(r.publicKey)` in a `useEffect`/`useState`, or a small `usePromise` hook) and an inline public URL field:

```tsx
function PublicUrl({ runner }: { runner: Runner }) {
    const setUrl = useMutation(api.runners.setPublicUrl)
    const run = useRun()
    const [value, setValue] = useState(runner.publicUrl ?? '')
    return (
        <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
                e.preventDefault()
                void run(setUrl({ id: runner._id, publicUrl: value || undefined }))
            }}>
            <Input aria-label="Public URL" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Public URL, e.g. https://bots.example.com" className="h-8 w-72" />
            <Btn type="submit" disabled={value === (runner.publicUrl ?? '')}>Save</Btn>
        </form>
    )
}
```

with a one-line explanation: "Where Twilio, Sendblue or BlueBubbles reach this engine. Only needed for those."
5. `Setup` (shown after adding an engine): drop `OPENAI_API_KEY=sk-...` from both snippets and change the text to "Copy this token now… Start the engine with it, then add your keys in the cards below (or as more variables on the engine)."
6. Toolbar line: "Keys you enter here are locked in your browser so only your engine can read them."

- [ ] **Step 3: Check it in the browser**

Run `npx convex dev` (dev deployment) and `npm run dev`. Open `/dashboard` → Connections. Expected: each AI, BlueBubbles, Sendblue, Twilio, Resend and local card shows "Add your engine above and start it once…" when no engine has reported a public key. Then start an engine locally (Task 7 covers the full loop).

- [ ] **Step 4: Typecheck, lint, commit**

Run: `npx tsc -b && npm run lint`
Expected: clean.

```bash
git add src/crm/key-form.tsx src/crm/views/connections.tsx
git commit -m "Connections: enter keys locked for your engine; engine fingerprints and public URL"
```

---

### Task 6: "Engine" wording and docs

**Files:**
- Modify: `src/crm/views/connections.tsx` (remaining copy), `src/crm/setup-checklist.tsx`, `src/crm/views/settings.tsx`, `src/crm/views/numbers.tsx`, `src/crm/slot-select.tsx`, `src/crm/crm-app.tsx`, `src/crm/views/analytics.tsx` (comment only), `src/crm/lib/view.ts` (comment only)
- Modify: `SECURITY.md`, `runner/README.md`, `.env.example`, `README.md`

- [ ] **Step 1: UI copy.** Replace "agent" with "engine" wherever it means the program (not the assistants). Exact lines found by `grep -rn -i -E "your agent( |,|\.|’|')|the agent( |,|\.|’|')|on your agent|agent token|add agent" src/crm`:
  - `setup-checklist.tsx`: "Start your agent" → "Start your engine"; "Add your agent" → "Add your engine"; "set on your agent" → "entered in Connections or set on your engine".
  - `settings.tsx:162,165,215,216,235`: "Your agent texts you…" → "Your engine texts you…"; "they live on your agent" → "they live on your engine".
  - `numbers.tsx:59,60,185,188,302`: "your agent texts from" → "your engine texts from"; "set up texting on your agent" → "set up texting in Connections"; "Your agent couldn’t do that" / "didn’t answer" → "Your engine …"; "Your agent points the number’s incoming texts at itself" → "Your engine points…".
  - `slot-select.tsx:20`: "No AI key on your agent yet." → "No AI key yet."
  - `crm-app.tsx:81`: "they live on your agent, which you add under Connections" → "you add them under Connections, where they're locked so only your engine can read them".
  - `connections.tsx`: section "Your agent" → "Your engine"; "Add agent" → "Add engine"; aria-label "Agent name" → "Engine name"; "Never connected. Start it with the token you copied." stays.
  Leave "agent" where it means an assistant ("point it at an agent", "your agents’ replies").

- [ ] **Step 2: SECURITY.md.** Replace the "Dashboard code served by the developer" risk with:

> **Dashboard code served by the developer.** The dashboard never sees your messages. Keys you type into Connections do pass through the page: it locks them with your engine's public key before sending, so Convex, its operator and database backups can't read them, but a malicious dashboard update could read a key as you type it, or show a public key that isn't your engine's. Check that the key fingerprint Connections shows matches the one your engine prints when it starts. If you'd rather not trust the dashboard with keys at all, set them as environment variables on the engine instead; they never leave that machine.

Also add a row/sentence in "who can see what": "Keys entered in the dashboard: stored in Convex locked for your engine; only the engine can open them."

- [ ] **Step 3: runner/README.md and .env.example.** Add near the top of runner/README.md: "You can enter your keys in the dashboard (Connections) instead of setting them here. They're locked for this engine; a key entered there wins over the same variable here. The engine prints its key fingerprint at startup: check it matches Connections." In `.env.example`, above the AI keys: `# Or enter these in the dashboard (Connections); a key entered there wins.` Call the program "engine" in prose; keep variable names.

- [ ] **Step 4: README.md.** In "The agent (`runner/`)" section: retitle "The engine (`runner/`)", and replace "set their keys and accounts as environment variables on that machine" with "enter their keys in Connections (locked so only the engine can read them) or set them as environment variables on that machine".

- [ ] **Step 5: Typecheck, lint, test, commit**

Run: `npx tsc -b && npm run lint && npm test`
Expected: clean, all tests pass.

```bash
git add src/crm SECURITY.md runner/README.md .env.example README.md
git commit -m "Call the program the engine; document keys entered in the dashboard"
```

---

### Task 7: End-to-end check

**Files:** none (verification only)

- [ ] **Step 1:** Run `npx convex dev` and `npm run dev`. In Connections, add an engine named "Laptop" and copy the token.
- [ ] **Step 2:** Start it with only the token: `OPENBOTS_CONVEX_URL=<dev url> OPENBOTS_TOKEN=<token> OPENBOTS_DEMO=true OPENBOTS_DATA_DIR=$(mktemp -d) npm run runner`. Expected: it prints "Engine key xxxx xxxx xxxx xxxx", then "No way to text is set up yet… Waiting…" and keeps running. Connections shows the engine online with the same fingerprint.
- [ ] **Step 3:** In the OpenAI card, click Add key, paste a real or deliberately wrong key, Save. Expected within ~5s, without restarting the engine: the card shows "Saved just now…" and either "N models" or the provider's rejection message.
- [ ] **Step 4:** Click Remove. Expected: the card returns to "Add key"; the engine logs no error.
- [ ] **Step 5:** Stop the engine, delete its data dir, start it again with the same token. Expected: Connections shows a new fingerprint; previously saved keys are gone from that engine ("Add key" again).
- [ ] **Step 6:** Confirm Convex holds nothing readable: `npx convex data secrets` shows only `s1:…` values.
- [ ] **Step 7:** Report results to the user with what was seen at each step.
