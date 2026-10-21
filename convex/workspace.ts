import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { mutation, query, type QueryCtx } from './_generated/server'
import { currentWorkspace, owned, requireUser, requireWorkspace } from './lib/access'
import { handleKey, handleKind } from './lib/handles'
import { requireKeyOffers } from './lib/keyModels'
import { isSavableChoice } from './lib/models'
import { CODE, CODE_ATTEMPTS, CODE_SENDS_PER_HOUR, CODE_TTL_MS, cleanCode, codeHash, EMAIL_CHANNELS, HOUR_MS, ONLINE_MS, verifiedOwner } from './lib/owner'
import { TASK_PENDING_MS } from './lib/tasks'
import { DEFAULT_DAILY_BUDGET, withDefaults } from './lib/usage'
import { workspaceSettings } from './schema'

// Every setting the Settings form saves. Your phone isn't one: it changes only through sendOwnerCode, so it can't be
// set (or swapped for another number) without the code texted to it.
const { ownerHandle: _ownerHandle, ...editableSettings } = workspaceSettings

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// The signed-in user's workspace, or null until they've set it up. Limits it hasn't set show their defaults.
export const get = query({
    args: {},
    handler: async (ctx) => {
        const ws = await currentWorkspace(ctx)
        return ws && { ...withDefaults(ws), ownerVerified: !!verifiedOwner(ws) }
    },
})

// First visit after signing up: the dashboard asks for these two names and creates the workspace
export const create = mutation({
    args: { name: v.string(), ownerName: v.string(), timezone: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const userId = await requireUser(ctx)
        if (await currentWorkspace(ctx)) throw new Error('Your workspace is already set up')
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')
        const user = await ctx.db.get('users', userId)
        return ctx.db.insert('workspace', { userId, name, ownerName, timezone: args.timezone, ownerEmail: user?.email, dailyBudget: DEFAULT_DAILY_BUDGET })
    },
})

export const update = mutation({
    args: { name: v.string(), ownerName: v.string(), ...editableSettings },
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        const name = args.name.trim()
        const ownerName = args.ownerName.trim()
        if (!name || !ownerName) throw new Error('Workspace and owner name are required')

        const ownerEmail = args.ownerEmail?.trim() || undefined
        if (ownerEmail && handleKind(ownerEmail) !== 'email') throw new Error('Enter a valid email address')
        if ((args.quietStart && !TIME.test(args.quietStart)) || (args.quietEnd && !TIME.test(args.quietEnd))) throw new Error('Quiet hours need a start and end time')
        if (args.replyDelaySec !== undefined && (args.replyDelaySec < 0 || args.replyDelaySec > 60)) throw new Error('Reply delay must be between 0 and 60 seconds')
        for (const budget of [args.dailyBudget, args.weeklyBudget]) if (budget !== undefined && !(budget > 0)) throw new Error('A budget must be more than 0 credits')
        if (args.contactRepliesPerHour !== undefined && !(Number.isInteger(args.contactRepliesPerHour) && args.contactRepliesPerHour >= 1 && args.contactRepliesPerHour <= 1000)) throw new Error('Replies per contact must be a whole number from 1 to 1000')
        if (args.defaultAgentId) await owned(ctx, ws, 'agents', args.defaultAgentId)

        // Every settings key is written explicitly, so one the client left out (undefined) is cleared.
        // Model choices are the exception: the Models page saves those through setModel.
        const settings = Object.fromEntries(
            Object.keys(editableSettings)
                .filter((k) => k !== 'models')
                .map((k) => [k, args[k as keyof typeof editableSettings]]),
        )
        await ctx.db.patch('workspace', ws._id, { ...settings, name, ownerName, ownerEmail, newContactTag: args.newContactTag?.trim().toLowerCase() || undefined })
    },
})

// Sets the workspace-wide model for one slot (Models page)
export const setModel = mutation({
    args: { slot: v.string(), model: v.string() },
    handler: async (ctx, { slot, model }) => {
        if (!isSavableChoice(slot, model)) throw new Error(`${model} can't be used for ${slot}`)
        const ws = await requireWorkspace(ctx)
        if (ws.models?.[slot] !== model) await requireKeyOffers(ctx, ws._id, slot, model)
        await ctx.db.patch('workspace', ws._id, { models: { ...ws.models, [slot]: model } })
    },
})

// Your configuration and counts, for the Settings → Export button. Conversations and contacts live on your engine.
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const id = ws._id
        const [agents, knowledge, usage, activity, numbers] = await Promise.all([
            ctx.db.query('agents').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('knowledge').withIndex('by_workspace_and_updatedAt', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('usage').withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('activity').withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', id)).collect(),
            ctx.db.query('numbers').withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', id)).collect(),
        ])
        const { userId, ...workspace } = ws
        return { workspace, agents, numbers, knowledge, usage, activity }
    },
})

// The newest code asked for, if any
const latestCode = (ctx: QueryCtx, ws: Doc<'workspace'>) =>
    ctx.db
        .query('ownerCodes')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
        .order('desc')
        .first()

// Your phone and where its verification stands, for Settings and the setup checklist. Never returns the code's hash.
export const ownerPhone = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const verified = !!verifiedOwner(ws)
        // The codes that may still count against the hourly limit, newest first; the dashboard works out what's left
        const sends = await ctx.db
            .query('ownerCodes')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
            .order('desc')
            .take(CODE_SENDS_PER_HOUR)
        const row = sends[0]
        // A code for the number now in Settings, while it isn't verified
        const pending = !verified && row && ws.ownerHandle && row.key === handleKey(ws.ownerHandle) ? row : null
        const task = pending && (await ctx.db.get('tasks', pending.taskId))
        return {
            handle: ws.ownerHandle ?? null,
            verified,
            sentTimes: sends.map((r) => r._creationTime),
            code: pending
                ? {
                      status: pending.codeHash ? ('sent' as const) : task?.status === 'failed' ? ('failed' as const) : ('sending' as const),
                      error: task?.status === 'failed' ? task.error : undefined,
                      sentAt: pending.sentAt,
                      attemptsLeft: Math.max(0, CODE_ATTEMPTS - pending.attempts),
                  }
                : null,
        }
    },
})

// Saves the phone you typed and asks your engine to text it a 6-digit code (see confirmOwnerCode). A number other than
// the verified one stops counting as yours right away. Returns null when this number is already verified.
export const sendOwnerCode = mutation({
    args: { handle: v.string() },
    handler: async (ctx, args) => {
        const ws = await requireWorkspace(ctx)
        const handle = args.handle.trim()
        const kind = handleKind(handle)
        const key = handleKey(handle)
        if (!kind || !key) throw new Error('Enter your phone number with its area code, or your Apple ID email')
        const ours = await ctx.db
            .query('numbers')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id).eq('key', key))
            .first()
        if (ours) throw new Error('That’s one of your agents’ numbers. Enter your own phone.')

        // Already verified: keep it, spelled as typed now
        if (ws.ownerVerifiedAt && ws.ownerVerifiedKey === key) {
            await ctx.db.patch('workspace', ws._id, { ownerHandle: handle })
            return null
        }
        // Any other number is unverified from now on, whatever happens to the code
        await ctx.db.patch('workspace', ws._id, { ownerHandle: handle, ownerVerifiedAt: undefined, ownerVerifiedKey: undefined })

        const now = Date.now()
        const recent = await ctx.db
            .query('ownerCodes')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
            .order('desc')
            .take(20)
        const lastHour = recent.filter((r) => r._creationTime > now - HOUR_MS)
        if (lastHour.length >= CODE_SENDS_PER_HOUR) {
            const minutes = Math.min(60, Math.max(1, Math.ceil((lastHour[lastHour.length - 1]._creationTime + HOUR_MS - now) / 60_000)))
            throw new Error(`You’ve asked for ${CODE_SENDS_PER_HOUR} codes in the last hour. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
        }

        // Your engine texts the code, so one must be online with a channel that can reach this number
        const runners = await ctx.db
            .query('runners')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
            .take(50)
        const online = runners.filter((r) => r.lastSeenAt && now - r.lastSeenAt < ONLINE_MS)
        if (!online.length) throw new Error(runners.length ? 'Your engine is offline, and it’s what texts the code. Start it, then send the code again.' : 'Add your engine in Connections first: it texts the code.')
        const channels = new Set(online.flatMap((r) => r.channels ?? []))
        const numbers = await ctx.db
            .query('numbers')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id))
            .take(500)
        const running = numbers.filter((n) => channels.has(n.channel))
        if (!running.length) throw new Error('Set up texting in Connections and add a number in Numbers first: the code is texted from it.')
        if (kind === 'email' && !running.some((n) => EMAIL_CHANNELS.includes(n.channel))) throw new Error('Only iMessage from a Mac (Messages, a relay or BlueBubbles) can text an Apple ID email. Enter your phone number instead.')

        // Rows older than an hour no longer count against the limit
        for (const r of recent) if (r._creationTime <= now - HOUR_MS) await ctx.db.delete('ownerCodes', r._id)
        const taskId = await ctx.db.insert('tasks', { workspaceId: ws._id, request: { kind: 'ownerCode', to: handle }, status: 'pending' })
        await ctx.scheduler.runAfter(TASK_PENDING_MS, internal.tasks.expire, { id: taskId })
        await ctx.db.insert('ownerCodes', { workspaceId: ws._id, taskId, handle, key, attempts: 0 })
        return taskId
    },
})

// Checks the code you typed against the newest one sent to your phone. A wrong code uses up one of its tries, so the
// problem is returned rather than thrown (a throw would undo that count).
export const confirmOwnerCode = mutation({
    args: { code: v.string() },
    handler: async (ctx, args): Promise<{ ok: true } | { ok: false; error: string }> => {
        const ws = await requireWorkspace(ctx)
        const code = cleanCode(args.code)
        if (!CODE.test(code)) return { ok: false, error: 'Enter the 6 digits from the text' }
        const row = await latestCode(ctx, ws)
        if (!row || !ws.ownerHandle || row.key !== handleKey(ws.ownerHandle)) return { ok: false, error: 'Send a code to your phone first' }
        if (!row.codeHash || !row.sentAt) return { ok: false, error: 'That code hasn’t been sent yet. Wait for the text, or send a new code.' }
        if (Date.now() - row.sentAt > CODE_TTL_MS) return { ok: false, error: 'That code has expired. Send a new one.' }
        if (row.attempts >= CODE_ATTEMPTS) return { ok: false, error: 'Too many wrong tries. Send a new code.' }
        if ((await codeHash(row.taskId, code)) !== row.codeHash) {
            const left = CODE_ATTEMPTS - row.attempts - 1
            await ctx.db.patch('ownerCodes', row._id, { attempts: row.attempts + 1 })
            return { ok: false, error: left ? `That’s not the code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That’s not the code, and that was the last try. Send a new code.' }
        }
        // Used up, so it can't verify again; the row stays to count against the hourly limit
        await ctx.db.patch('ownerCodes', row._id, { codeHash: undefined })
        await ctx.db.patch('workspace', ws._id, { ownerVerifiedAt: Date.now(), ownerVerifiedKey: row.key })
        return { ok: true }
    },
})

// Forgets your phone: agents then answer nobody and text you nothing until you verify one again
export const removeOwnerHandle = mutation({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        await ctx.db.patch('workspace', ws._id, { ownerHandle: undefined, ownerVerifiedAt: undefined, ownerVerifiedKey: undefined })
        return null
    },
})
