import { v } from 'convex/values'
import { env, mutation, query, type QueryCtx } from './_generated/server'
import { BACKEND_ONLY, checkFields, decryptSecret, secretContext } from './lib/sealed'
import { canComputerUse } from './lib/computers'
import { handleKey } from './lib/handles'
import { insertNumber } from './lib/numbers'
import { IGNORED_KEPT, MAX_ALLOWED, verifiedOwner } from './lib/owner'
import { TASK_EXPIRED, TASK_PENDING_MS } from './lib/tasks'
import { hashToken } from './lib/tokens'
import { creditsFor, dayKey, weekStart, withDefaults } from './lib/usage'
import { channel, keyModel, service, taskResult } from './schema'

// The API your engine (runner/) calls. Every function takes the engine's token, checks it, and stays inside that
// engine's workspace. None of them accepts or returns message text. The only contact details are the ones you typed
// into Settings (your phone, Allowed people) and the numbers of the last few strangers the engine ignored (`ignored`).
// `dashboard` returns the keys saved in Connections for that workspace.

async function runnerFor(ctx: QueryCtx, token: string) {
    const tokenHash = await hashToken(token)
    const runner = await ctx.db
        .query('runners')
        .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
        .unique()
    if (!runner) throw new Error('This engine token is invalid or was revoked. Make a new one in Connections.')
    return runner
}

// Everything the engine needs to reply: your settings, agents, numbers and knowledge. Reactive, so edits in
// the dashboard reach the engine right away.
// An engine that ignores strangers says so with `allowedOnly`. One from before Allowed people existed doesn't, and would
// answer anyone, so it gets every agent as paused: it then answers only your verified phone until you update it.
export const config = query({
    args: { token: v.string(), allowedOnly: v.optional(v.boolean()) },
    handler: async (ctx, { token, allowedOnly }) => {
        const runner = await runnerFor(ctx, token)
        const { workspaceId } = runner
        const ws = await ctx.db.get('workspace', workspaceId)
        if (!ws) return null
        const [agents, numbers, knowledge, people] = await Promise.all([
            ctx.db.query('agents').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', workspaceId)).take(500),
            ctx.db.query('numbers').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId)).take(500),
            ctx.db.query('knowledge').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', workspaceId)).take(500),
            ctx.db.query('allowedPeople').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId)).take(MAX_ALLOWED),
        ])
        const { userId, notifyDigest, lastDigestDay, ...workspace } = ws
        // An unverified phone isn't sent at all, so no engine (even one older than verification) treats it as yours
        const ownerHandle = verifiedOwner(ws)
        return {
            workspace: withDefaults({ ...workspace, ownerHandle, ownerVerifiedAt: ownerHandle ? ws.ownerVerifiedAt : undefined, ownerVerifiedKey: ownerHandle ? ws.ownerVerifiedKey : undefined }),
            agents: allowedOnly ? agents : agents.map((a) => ({ ...a, status: 'paused' as const })),
            numbers,
            knowledge,
            // The people agents answer besides you; everyone else is ignored
            allowed: people.map(({ name, handle }) => ({ name, handle })),
            computerUse: runner.computerUse === true && canComputerUse(runner),
        }
    },
})

// Says which budget is used up, if any. `today` comes from the engine so the query never reads the clock.
export const budget = query({
    args: { token: v.string(), today: v.string() },
    handler: async (ctx, { token, today }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const found = await ctx.db.get('workspace', workspaceId)
        if (!found) return null
        // A workspace without a daily budget of its own has the default one
        const ws = withDefaults(found)
        const rows = await ctx.db
            .query('usage')
            .withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', workspaceId).gte('day', weekStart(today)).lte('day', today))
            .take(5_000)
        const week = rows.reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        const day = rows.filter((r) => r.day === today).reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
        if (day >= ws.dailyBudget) return `Today's usage budget (${ws.dailyBudget} credits) is used up.`
        if (ws.weeklyBudget && week >= ws.weeklyBudget) return `This week's usage budget (${ws.weeklyBudget} credits) is used up.`
        return null
    },
})

// The engine checks in every minute with what it has set up: services (never their keys), the models its AI keys
// can use, and the lines its texting channels answer on
export const heartbeat = mutation({
    args: {
        token: v.string(),
        version: v.string(),
        services: v.array(v.object({ service, label: v.optional(v.string()), error: v.optional(v.string()) })),
        models: v.array(keyModel),
        channels: v.array(channel),
        lines: v.array(v.object({ channel, handle: v.string(), externalId: v.optional(v.string()) })),
        demo: v.boolean(),
        // The address of the engine's own tunnel, when it runs one
        tunnelUrl: v.optional(v.string()),
        os: v.optional(v.union(v.literal('windows'), v.literal('mac'), v.literal('linux'), v.literal('other'))),
        jobs: v.optional(v.array(v.object({ agentId: v.id('agents'), reminders: v.number(), watches: v.number() }))),
    },
    handler: async (ctx, { token, ...status }) => {
        const runner = await runnerFor(ctx, token)
        if (status.models.length > 500 || status.lines.length > 200 || status.services.length > 20 || status.channels.length > 10 || (status.jobs?.length ?? 0) > 500) throw new Error('Too much to report')
        if (status.tunnelUrl !== undefined && (status.tunnelUrl.length > 200 || !/^https:\/\/[^\s/]+$/.test(status.tunnelUrl))) throw new Error('Unreadable tunnel address')
        await ctx.db.patch('runners', runner._id, { ...status, lastSeenAt: Date.now() })
    },
})

// The keys saved in Connections for this engine's account, decrypted, plus its public URL (reactive). A key that
// won't decrypt is reported for its service instead of failing the rest.
export const dashboard = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const runner = await runnerFor(ctx, token)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', runner.workspaceId))
            .take(50)
        const secrets: { service: (typeof rows)[number]['service']; fields: Record<string, string> }[] = []
        const problems: { service: (typeof rows)[number]['service']; error: string }[] = []
        for (const { service, sealed } of rows) {
            // The Orgo key is the backend's, to create computers; the engine never needs it
            if (BACKEND_ONLY.includes(service)) continue
            try {
                if (!env.ENCRYPTION_KEY) throw new Error('no ENCRYPTION_KEY')
                secrets.push({ service, fields: checkFields(service, await decryptSecret(env.ENCRYPTION_KEY, secretContext(runner.workspaceId, service), sealed)) })
            } catch {
                problems.push({ service, error: 'The key saved in Connections can’t be read; save it again' })
            }
        }
        return { publicUrl: runner.publicUrl, secrets, problems }
    },
})

const count = v.optional(v.number())
const COUNTS = ['conversations', 'newContacts', 'messagesIn', 'messagesOut', 'handoffs', 'ignored'] as const

// Adds to today's counts for one agent: model usage for the budget, and activity for Analytics
export const record = mutation({
    args: {
        token: v.string(),
        agentId: v.id('agents'),
        usage: v.optional(v.object({ slot: v.string(), model: v.string() })),
        activity: v.optional(v.object({ conversations: count, newContacts: count, messagesIn: count, messagesOut: count, handoffs: count, ignored: count })),
    },
    handler: async (ctx, { token, agentId, usage, activity }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const agent = await ctx.db.get('agents', agentId)
        if (!agent || agent.workspaceId !== workspaceId) return
        const day = dayKey(Date.now())
        if (usage) {
            const row = await ctx.db
                .query('usage')
                .withIndex('by_agent_and_slot_and_model_and_day', (q) => q.eq('agentId', agentId).eq('slot', usage.slot).eq('model', usage.model).eq('day', day))
                .unique()
            if (row) await ctx.db.patch('usage', row._id, { count: row.count + 1 })
            else await ctx.db.insert('usage', { workspaceId, agentId, ...usage, day, count: 1 })
        }
        if (activity) {
            for (const n of Object.values(activity)) if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 1000)) throw new Error('Counts must be small whole numbers')
            const row = await ctx.db
                .query('activity')
                .withIndex('by_agent_and_day', (q) => q.eq('agentId', agentId).eq('day', day))
                .unique()
            const next = Object.fromEntries(COUNTS.map((k) => [k, (row?.[k] ?? 0) + (activity[k] ?? 0)])) as Record<(typeof COUNTS)[number], number>
            if (row) await ctx.db.patch('activity', row._id, next)
            else await ctx.db.insert('activity', { workspaceId, agentId, day, ...next })
        }
    },
})

// The numbers of people whose texts the engine just ignored (not on Allowed people), so the dashboard can offer to
// allow them. Numbers only, never what they wrote; only the newest IGNORED_KEPT are kept.
export const ignored = mutation({
    args: { token: v.string(), senders: v.array(v.string()) },
    handler: async (ctx, { token, senders }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        if (senders.length > IGNORED_KEPT) throw new Error('Too many to report')
        const now = Date.now()
        for (const raw of senders) {
            const handle = raw.trim().slice(0, 100)
            const key = handleKey(handle)
            if (!key) continue
            // Someone allowed meanwhile isn't a stranger
            const allowed = await ctx.db
                .query('allowedPeople')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId).eq('key', key))
                .first()
            if (allowed) continue
            const row = await ctx.db
                .query('ignoredSenders')
                .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', workspaceId).eq('key', key))
                .first()
            if (row) await ctx.db.patch('ignoredSenders', row._id, { at: now })
            else await ctx.db.insert('ignoredSenders', { workspaceId, handle, key, at: now })
        }
        const kept = await ctx.db
            .query('ignoredSenders')
            .withIndex('by_workspace_and_at', (q) => q.eq('workspaceId', workspaceId))
            .order('desc')
            .take(IGNORED_KEPT * 3)
        for (const r of kept.slice(IGNORED_KEPT)) await ctx.db.delete('ignoredSenders', r._id)
        return null
    },
})

// Requests from the dashboard waiting for an engine (reactive). Requests nobody claims in time are closed by
// tasks.expire, which takes them off this list; claimTask refuses any that are past due anyway.
export const tasks = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const { workspaceId } = await runnerFor(ctx, token)
        const rows = await ctx.db
            .query('tasks')
            .withIndex('by_workspace_and_status', (q) => q.eq('workspaceId', workspaceId).eq('status', 'pending'))
            .take(20)
        return rows.map(({ _id, request }) => ({ _id, request }))
    },
})

// An engine takes a request before doing it, so with several engines only one does it (one Twilio purchase, not
// one per engine). True if this engine got it; false if another engine has it, or it's closed or past due.
export const claimTask = mutation({
    args: { token: v.string(), id: v.id('tasks') },
    handler: async (ctx, { token, id }) => {
        const runner = await runnerFor(ctx, token)
        const task = await ctx.db.get('tasks', id)
        if (!task || task.workspaceId !== runner.workspaceId || task.status !== 'pending') return false
        if (Date.now() >= task._creationTime + TASK_PENDING_MS) {
            await ctx.db.patch('tasks', id, { status: 'failed', error: TASK_EXPIRED })
            return false
        }
        await ctx.db.patch('tasks', id, { status: 'running', runnerId: runner._id })
        return true
    },
})

// The engine's answer to a task it claimed. A bought or reused Twilio number is added to your numbers here.
export const finishTask = mutation({
    args: { token: v.string(), id: v.id('tasks'), result: v.optional(taskResult), error: v.optional(v.string()) },
    handler: async (ctx, { token, id, result, error }) => {
        const runner = await runnerFor(ctx, token)
        const { workspaceId } = runner
        const task = await ctx.db.get('tasks', id)
        // Only the engine that claimed it, and only while it's open
        if (!task || task.workspaceId !== workspaceId || task.status !== 'running' || task.runnerId !== runner._id) return
        const { request } = task
        // A verification code: only its hash is kept, on its ownerCodes row, and never on the task the dashboard reads
        if (request.kind === 'ownerCode') {
            const row = await ctx.db
                .query('ownerCodes')
                .withIndex('by_taskId', (q) => q.eq('taskId', id))
                .unique()
            const hash = result && 'codeHash' in result ? result.codeHash : undefined
            if (error || !row || !hash || !/^[0-9a-f]{64}$/.test(hash)) return void (await ctx.db.patch('tasks', id, { status: 'failed', error: (error ?? 'Your engine didn’t send the code').slice(0, 300) }))
            await ctx.db.patch('ownerCodes', row._id, { codeHash: hash, sentAt: Date.now() })
            return void (await ctx.db.patch('tasks', id, { status: 'done', result: { sentTo: request.to } }))
        }
        // A code's hash only ever answers an ownerCode request
        if (result && 'codeHash' in result) return void (await ctx.db.patch('tasks', id, { status: 'failed', error: 'Unexpected answer from your engine' }))
        if (!error && result && 'sid' in result && (request.kind === 'twilioBuy' || request.kind === 'twilioUse')) {
            try {
                await insertNumber(ctx, { workspaceId, handle: result.phoneNumber, channel: 'twilio', externalId: result.sid, agentId: request.agentId })
            } catch (e) {
                error = e instanceof Error ? e.message : String(e)
            }
        }
        await ctx.db.patch('tasks', id, error ? { status: 'failed', error: error.slice(0, 300) } : { status: 'done', result })
    },
})
