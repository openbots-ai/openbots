import { v, type Infer } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server'
import { requireWorkspace } from './lib/access'
import { checkFields, encryptSecret, secretContext } from './lib/sealed'
import { sealedService } from './schema'

// Keys you save in Connections, one per service for your whole account. They're encrypted with the server's
// ENCRYPTION_KEY before they're stored and are never sent back to the dashboard; only your engines receive them.

type Service = Infer<typeof sealedService>

// Which services have a key saved, and when
export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', ws._id))
            .take(50)
        return rows.map(({ service, updatedAt }) => ({ service, updatedAt }))
    },
})

export const workspaceId = internalQuery({
    args: {},
    handler: async (ctx) => (await requireWorkspace(ctx))._id,
})

async function clear(ctx: MutationCtx, workspaceId: Id<'workspace'>, service: Service) {
    const rows = await ctx.db
        .query('secrets')
        .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', workspaceId).eq('service', service))
        .take(10)
    for (const row of rows) await ctx.db.delete('secrets', row._id)
}

export const store = internalMutation({
    args: { workspaceId: v.id('workspace'), service: sealedService, sealed: v.string() },
    handler: async (ctx, { workspaceId, service, sealed }) => {
        await clear(ctx, workspaceId, service)
        await ctx.db.insert('secrets', { workspaceId, service, sealed, updatedAt: Date.now() })
    },
})

// Saves (or replaces) one service's key. An action, so the encryption gets a truly random nonce.
export const save = action({
    args: { service: sealedService, fields: v.record(v.string(), v.string()) },
    handler: async (ctx, { service, fields }): Promise<null> => {
        const workspaceId: Id<'workspace'> = await ctx.runQuery(internal.secrets.workspaceId, {})
        if (!env.ENCRYPTION_KEY) throw new Error('This server isn’t set up to store keys yet. Run `npm run setup`.')
        const checked = checkFields(service, fields)
        const sealed = await encryptSecret(env.ENCRYPTION_KEY, secretContext(workspaceId, service), checked)
        if (sealed.length > 8_000) throw new Error('That key is too long')
        await ctx.runMutation(internal.secrets.store, { workspaceId, service, sealed })
        return null
    },
})

// Removes one service's key; an environment variable on the engine takes over, if set
export const remove = mutation({
    args: { service: sealedService },
    handler: async (ctx, { service }) => {
        const ws = await requireWorkspace(ctx)
        await clear(ctx, ws._id, service)
        return null
    },
})
