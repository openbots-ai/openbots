import { v, type Infer } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { sealedService } from './schema'

// Keys you enter in Connections. The browser locks each one for every engine you run; this file only ever handles
// the locked values, and never sends them back to the dashboard.

type Service = Infer<typeof sealedService>

// Which services have a key saved, on which engines, and when
export const list = query({
    args: {},
    handler: async (ctx) => {
        const ws = await requireWorkspace(ctx)
        const rows = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', ws._id))
            .take(500)
        const byService = new Map<Service, { service: Service; runnerIds: Id<'runners'>[]; updatedAt: number }>()
        for (const row of rows) {
            const entry = byService.get(row.service) ?? { service: row.service, runnerIds: [], updatedAt: 0 }
            entry.runnerIds.push(row.runnerId)
            entry.updatedAt = Math.max(entry.updatedAt, row.updatedAt)
            byService.set(row.service, entry)
        }
        return [...byService.values()]
    },
})

async function clear(ctx: MutationCtx, workspaceId: Id<'workspace'>, service: Service) {
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
