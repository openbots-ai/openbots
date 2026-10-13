import { getAuthUserId } from '@convex-dev/auth/server'
import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions'
import { mutation as rawMutation, query as rawQuery, type QueryCtx } from '../_generated/server'

// Throws unless the caller is signed in as the workspace's owner. Every dashboard function goes through this.
export async function requireOwner(ctx: QueryCtx) {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error('Sign in to continue')
    const ws = await ctx.db.query('workspace').first()
    if (!ws || ws.ownerId !== userId) throw new Error("You don't have access to this workspace")
    return userId
}

// Drop-in replacements for query/mutation that only the signed-in owner can call
export const query = customQuery(rawQuery, customCtx(async (ctx) => ({ userId: await requireOwner(ctx) })))
export const mutation = customMutation(rawMutation, customCtx(async (ctx) => ({ userId: await requireOwner(ctx) })))
