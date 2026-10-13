import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { keyModels, modelLabel, NONE, parseModel, PROVIDER_NAMES, slotOf, type KeyModel } from './models'

// Every model the workspace's AI keys can use, as its agents last reported them (the keys stay on the agents)
export async function workspaceModels(ctx: QueryCtx, workspaceId: Id<'workspace'>) {
    const runners = await ctx.db
        .query('runners')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
        .take(50)
    return keyModels(runners.flatMap((r) => r.models ?? ([] as KeyModel[])))
}

// Refuses a Brain or Backup choice the workspace's keys can't use, saying what to do about it
export async function requireKeyOffers(ctx: QueryCtx, workspaceId: Id<'workspace'>, slot: string, model: string) {
    if (!slotOf(slot)?.fromKeys || model === NONE) return
    const parsed = parseModel(model)
    if (!parsed) throw new Error(`${model} can't be used for ${slot}`)
    const available = await workspaceModels(ctx, workspaceId)
    const name = PROVIDER_NAMES[parsed.provider]
    if (!available.some((o) => o.provider === parsed.provider)) {
        throw new Error(parsed.provider === 'local' ? `Set up a local model server on your agent to use ${modelLabel(model)}` : `Add your ${name} key to your agent to use ${modelLabel(model)}`)
    }
    if (!available.some((o) => o.id === `${parsed.provider}:${parsed.model}`)) {
        throw new Error(parsed.provider === 'local' ? `Your local model server doesn't have ${modelLabel(model)}` : `Your ${name} key can't use ${modelLabel(model)}`)
    }
}
