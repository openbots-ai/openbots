import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { action, env, internalMutation, internalQuery, mutation, query, type ActionCtx } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { decrypt, encrypt, randomToken } from './lib/crypto'
import { check, ConnectError, registerWebhook, type Credentials, type Provider } from './lib/providers'
import { connectionProvider } from './schema'

// The URL a texting account posts incoming messages to
export const webhookUrl = (provider: Provider, token: string) => `${env.CONVEX_SITE_URL}/hooks/${provider}/${token}`

const TEXTING: Provider[] = ['twilio', 'sendblue', 'bluebubbles']

// What the dashboard sees: never the credentials themselves
export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('connections')
            .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', ws._id))
            .take(50)
        return rows.map(({ _id, provider, label, details, status, error, checkedAt, webhookToken }) => ({
            _id,
            provider,
            label,
            details,
            status,
            error,
            checkedAt,
            // Shown for texting accounts so it can be pasted elsewhere if automatic setup ever fails
            webhookUrl: TEXTING.includes(provider) ? webhookUrl(provider, webhookToken) : undefined,
        }))
    },
})

async function workspaceForAction(ctx: ActionCtx): Promise<Id<'workspace'>> {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Sign in to continue')
    const id: Id<'workspace'> | null = await ctx.runQuery(internal.connections.workspaceOf, { userId })
    if (!id) throw new Error('Set up your workspace first')
    return id
}

export const workspaceOf = internalQuery({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => (await ctx.db.query('workspace').withIndex('by_user', (q) => q.eq('userId', userId)).unique())?._id ?? null,
})

// Checks the credentials with the provider, then stores them encrypted. Replaces an earlier connection of the same kind.
export const connect = action({
    args: { provider: connectionProvider, credentials: v.record(v.string(), v.string()) },
    handler: async (ctx, { provider, credentials }): Promise<{ ok: true } | { ok: false; error: string }> => {
        const workspaceId = await workspaceForAction(ctx)
        const creds = Object.fromEntries(Object.entries(credentials).map(([k, val]) => [k, val.trim()])) as Credentials[typeof provider]
        if (Object.values(creds).some((val) => !val)) return { ok: false, error: 'Fill in every field' }
        try {
            const { label, details } = await check(provider, creds)
            const existing: Doc<'connections'> | null = await ctx.runQuery(internal.connections.find, { workspaceId, provider })
            const webhookToken = existing?.webhookToken ?? randomToken()
            await registerWebhook(provider, creds, webhookUrl(provider, webhookToken))
            await ctx.runMutation(internal.connections.store, { workspaceId, provider, secret: await encrypt(creds), label, details, webhookToken })
            return { ok: true }
        } catch (e) {
            if (e instanceof ConnectError) return { ok: false, error: e.message }
            throw e
        }
    },
})

// Re-runs the credential check, e.g. after rotating a key at the provider
export const recheck = action({
    args: { id: v.id('connections') },
    handler: async (ctx, { id }): Promise<void> => {
        const workspaceId = await workspaceForAction(ctx)
        const conn: Doc<'connections'> | null = await ctx.runQuery(internal.connections.byId, { id })
        if (!conn || conn.workspaceId !== workspaceId) throw new Error('Not found')
        try {
            await check(conn.provider, await decrypt<Credentials[typeof conn.provider]>(conn.secret))
            await ctx.runMutation(internal.connections.setStatus, { id, error: undefined })
        } catch (e) {
            if (!(e instanceof ConnectError)) throw e
            await ctx.runMutation(internal.connections.setStatus, { id, error: e.message })
        }
    },
})

// Disconnects an account. Numbers that ran through it are removed too, since they can no longer send or receive.
export const remove = mutation({
    args: { id: v.id('connections') },
    handler: async (ctx, { id }) => {
        const ws = await requireWorkspace(ctx)
        await owned(ctx, ws, 'connections', id)
        const numbers = await ctx.db
            .query('numbers')
            .withIndex('by_connection', (q) => q.eq('connectionId', id))
            .collect()
        const gone = new Set(numbers.map((n) => n._id))
        if (gone.size) {
            for await (const c of ctx.db.query('conversations').withIndex('by_workspace_and_lastAt', (q) => q.eq('workspaceId', ws._id)))
                if (c.numberId && gone.has(c.numberId)) await ctx.db.patch('conversations', c._id, { numberId: undefined })
        }
        for (const n of numbers) await ctx.db.delete('numbers', n._id)
        await ctx.db.delete('connections', id)
    },
})

export const find = internalQuery({
    args: { workspaceId: v.id('workspace'), provider: connectionProvider },
    handler: (ctx, { workspaceId, provider }) =>
        ctx.db
            .query('connections')
            .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', workspaceId).eq('provider', provider))
            .first(),
})

export const byId = internalQuery({
    args: { id: v.id('connections') },
    handler: (ctx, { id }) => ctx.db.get('connections', id),
})

export const byToken = internalQuery({
    args: { token: v.string() },
    handler: (ctx, { token }) =>
        ctx.db
            .query('connections')
            .withIndex('by_webhookToken', (q) => q.eq('webhookToken', token))
            .unique(),
})

export const store = internalMutation({
    args: {
        workspaceId: v.id('workspace'),
        provider: connectionProvider,
        secret: v.string(),
        label: v.string(),
        details: v.optional(v.record(v.string(), v.string())),
        webhookToken: v.string(),
    },
    handler: async (ctx, args) => {
        const fields = { ...args, status: 'ok' as const, error: undefined, checkedAt: Date.now() }
        const existing = await ctx.db
            .query('connections')
            .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', args.workspaceId).eq('provider', args.provider))
            .first()
        if (existing) await ctx.db.patch('connections', existing._id, fields)
        else await ctx.db.insert('connections', fields)
    },
})

export const setStatus = internalMutation({
    args: { id: v.id('connections'), error: v.optional(v.string()) },
    handler: async (ctx, { id, error }) => {
        if (await ctx.db.get('connections', id)) await ctx.db.patch('connections', id, { status: error ? 'error' : 'ok', error, checkedAt: Date.now() })
    },
})
