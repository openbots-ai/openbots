import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { action, internalMutation, internalQuery, mutation, query, type ActionCtx } from './_generated/server'
import { webhookUrl } from './connections'
import { owned, requireWorkspace } from './lib/access'
import { decrypt } from './lib/crypto'
import { handleKey, handleKind } from './lib/handles'
import { ConnectError, twilioBuy, twilioOwned, twilioPoint, twilioSearch, type Credentials, type TwilioNumber } from './lib/providers'

export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        return ctx.db
            .query('numbers')
            .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', ws._id))
            .take(500)
    },
})

export const assign = mutation({
    args: { id: v.id('numbers'), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { id, agentId }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'numbers', id)
        if (agentId) await owned(ctx, ws, 'agents', agentId)
        await ctx.db.patch('numbers', id, { agentId })
    },
})

// Stops using a number here. A Twilio number stays in the person's Twilio account (release it there to stop paying).
export const remove = mutation({
    args: { id: v.id('numbers') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'numbers', id)
        for await (const c of ctx.db.query('conversations').withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', ws._id)))
            if (c.numberId === id) await ctx.db.patch('conversations', c._id, { numberId: undefined })
        await ctx.db.delete('numbers', id)
    },
})

// The phone number or Apple ID email of a Sendblue line or of the Mac running BlueBubbles
export const addLine = mutation({
    args: { connectionId: v.id('connections'), handle: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { connectionId, handle, agentId }) => {
        const ws = await requireWorkspace(ctx)
        const conn = await owned(ctx, ws, 'connections', connectionId)
        if (conn.provider !== 'sendblue' && conn.provider !== 'bluebubbles') throw new Error('Add Twilio numbers with Get a number')
        if (agentId) await owned(ctx, ws, 'agents', agentId)
        return insert(ctx, { workspaceId: ws._id, handle, agentId, channel: conn.provider, connectionId })
    },
})

type NewNumber = { workspaceId: Id<'workspace'>; handle: string; agentId?: Id<'agents'>; channel: Doc<'numbers'>['channel']; connectionId: Id<'connections'>; externalId?: string }

async function insert(ctx: { db: import('./_generated/server').MutationCtx['db'] }, n: NewNumber) {
    const kind = handleKind(n.handle)
    const key = handleKey(n.handle)
    if (!kind || !key) throw new Error('Enter a phone number or an email address')
    if (n.channel === 'twilio' && kind !== 'phone') throw new Error('Twilio numbers are phone numbers')
    const twin = await ctx.db
        .query('numbers')
        .withIndex('by_workspace_and_key', (q) => q.eq('workspaceId', n.workspaceId).eq('key', key))
        .first()
    if (twin) throw new Error('That number is already added')
    return ctx.db.insert('numbers', { ...n, handle: n.handle.trim(), key, kind })
}

/* Twilio: search, buy and reuse numbers on the person's own Twilio account */

type TwilioCtx = { workspaceId: Id<'workspace'>; connectionId: Id<'connections'>; creds: Credentials['twilio']; smsUrl: string }

async function twilio(ctx: ActionCtx): Promise<TwilioCtx> {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Sign in to continue')
    const conn: Doc<'connections'> | null = await ctx.runQuery(internal.numbers.twilioConnection, { userId })
    if (!conn) throw new Error('Connect your Twilio account in Connections first')
    return { workspaceId: conn.workspaceId, connectionId: conn._id, creds: await decrypt<Credentials['twilio']>(conn.secret), smsUrl: webhookUrl('twilio', conn.webhookToken) }
}

export const twilioConnection = internalQuery({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const ws = await ctx.db
            .query('workspace')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .unique()
        if (!ws) return null
        return ctx.db
            .query('connections')
            .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', ws._id).eq('provider', 'twilio'))
            .first()
    },
})

// Turns a provider error into something the dialog can show
async function friendly<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try {
        return { ok: true, value: await work() }
    } catch (e) {
        if (e instanceof ConnectError) return { ok: false, error: e.message }
        throw e
    }
}

// Numbers for sale in the person's Twilio account, by country and optional area code
export const twilioAvailable = action({
    args: { country: v.string(), areaCode: v.optional(v.string()) },
    handler: async (ctx, { country, areaCode }) => {
        const t = await twilio(ctx)
        return friendly(() => twilioSearch(t.creds, { country, areaCode: areaCode?.trim() || undefined }))
    },
})

// Numbers the person already owns in Twilio, to reuse one
export const twilioExisting = action({
    args: {},
    handler: async (ctx) => {
        const t = await twilio(ctx)
        return friendly(() => twilioOwned(t.creds))
    },
})

// Buys a number on the person's Twilio account (billed by Twilio to them) and points its texts here
export const twilioPurchase = action({
    args: { phoneNumber: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { phoneNumber, agentId }) => {
        const t = await twilio(ctx)
        return friendly(async () => {
            const bought: TwilioNumber = await twilioBuy(t.creds, phoneNumber, t.smsUrl)
            await ctx.runMutation(internal.numbers.insertTwilio, { workspaceId: t.workspaceId, connectionId: t.connectionId, handle: bought.phoneNumber, externalId: bought.sid!, agentId })
            return bought.phoneNumber
        })
    },
})

// Uses a number the person already has in Twilio, pointing its texts here
export const twilioUse = action({
    args: { sid: v.string(), phoneNumber: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { sid, phoneNumber, agentId }) => {
        const t = await twilio(ctx)
        return friendly(async () => {
            await twilioPoint(t.creds, sid, t.smsUrl)
            await ctx.runMutation(internal.numbers.insertTwilio, { workspaceId: t.workspaceId, connectionId: t.connectionId, handle: phoneNumber, externalId: sid, agentId })
            return phoneNumber
        })
    },
})

export const insertTwilio = internalMutation({
    args: { workspaceId: v.id('workspace'), connectionId: v.id('connections'), handle: v.string(), externalId: v.string(), agentId: v.optional(v.id('agents')) },
    handler: async (ctx, { agentId, ...n }) => {
        const agent = agentId && (await ctx.db.get('agents', agentId))
        return insert(ctx, { ...n, channel: 'twilio', agentId: agent && agent.workspaceId === n.workspaceId ? agent._id : undefined })
    },
})
