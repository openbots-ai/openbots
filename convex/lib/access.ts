import type { Doc, Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Ctx = QueryCtx | MutationCtx

// The signed-in user's workspace, or null before they've set one up
export async function currentWorkspace(ctx: Ctx) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return ctx.db
        .query('workspace')
        .withIndex('by_user', (q) => q.eq('userId', identity.tokenIdentifier))
        .unique()
}

// The signed-in Clerk user, as Convex identifies them
export async function requireUser(ctx: Ctx) {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in to continue')
    return identity
}

export async function requireWorkspace(ctx: Ctx) {
    await requireUser(ctx)
    const ws = await currentWorkspace(ctx)
    if (!ws) throw new Error('Set up your workspace first')
    return ws
}

type Owned = 'agents' | 'numbers' | 'knowledge' | 'runners' | 'tasks' | 'allowedPeople' | 'ignoredSenders'

// Loads a document only if it belongs to this workspace; anything else reads as "not found"
export async function owned<T extends Owned & TableNames>(ctx: Ctx, ws: Doc<'workspace'>, table: T, id: Id<T>): Promise<Doc<T>> {
    const doc = (await ctx.db.get(table, id)) as (Doc<T> & { workspaceId: Id<'workspace'> }) | null
    if (!doc || doc.workspaceId !== ws._id) throw new Error('Not found')
    return doc
}
