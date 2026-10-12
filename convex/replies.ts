import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { notify } from './lib/notify'
import { decrypt } from './lib/crypto'
import { complete, isTextProvider, ReplyError, type Prompt, type TextProvider } from './lib/llm'
import { NONE, resolveModels, type ModelOption } from './lib/models'
import { MAX_TOKENS, parseReply, systemPrompt, toTurns } from './lib/prompt'
import { queueDelivery, recordUsage } from './lib/inbox'
import { creditsFor, dayKey, weekStart } from './lib/usage'
import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'

// Says which budget is used up, if any
async function overBudget(ctx: QueryCtx, ws: Doc<'workspace'> | null, now: number) {
    if (!ws?.dailyBudget && !ws?.weeklyBudget) return null
    const today = dayKey(now)
    const rows = await ctx.db
        .query('usage')
        .withIndex('by_workspace_and_day', (q) => q.eq('workspaceId', ws._id).gte('day', weekStart(today)).lte('day', today))
        .take(5_000)
    const week = rows.reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
    const day = rows.filter((r) => r.day === today).reduce((s, r) => s + creditsFor(r.slot, r.count), 0)
    if (ws.dailyBudget && day >= ws.dailyBudget) return `Today's usage budget (${ws.dailyBudget} credits) is used up. Raise it in Settings, or reply yourself.`
    if (ws.weeklyBudget && week >= ws.weeklyBudget) return `This week's usage budget (${ws.weeklyBudget} credits) is used up. Raise it in Settings, or reply yourself.`
    return null
}

// How much history the model sees
const HISTORY = 40

// Everything the reply needs, or null when this job is stale (a newer text arrived, or the agent stopped)
export const context = internalQuery({
    args: { conversationId: v.id('conversations'), messageId: v.id('messages'), now: v.number() },
    handler: async (ctx, { conversationId, messageId, now }) => {
        const conversation = await ctx.db.get('conversations', conversationId)
        if (!conversation) return null
        const recent = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
            .order('desc')
            .take(HISTORY)
        const latestFromContact = recent.find((m) => m.from === 'contact')
        // A newer text has its own job queued; an answer already sent means someone beat us to it
        if (latestFromContact?._id !== messageId || recent[0].from !== 'contact') return { kind: 'stale' as const }

        const [agent, contact, workspace] = await Promise.all([ctx.db.get('agents', conversation.agentId), ctx.db.get('contacts', conversation.contactId), ctx.db.get('workspace', conversation.workspaceId)])
        if (!agent || !contact) return { kind: 'stale' as const }
        if (agent.status !== 'live') return { kind: 'stale' as const }
        const budget = await overBudget(ctx, workspace, now)
        if (budget) return { kind: 'blocked' as const, problem: budget }

        const wsId = conversation.workspaceId
        const [own, shared] = await Promise.all([
            ctx.db.query('knowledge').withIndex('by_workspace_and_agent', (q) => q.eq('workspaceId', wsId).eq('agentId', agent._id)).take(50),
            ctx.db.query('knowledge').withIndex('by_workspace_and_agent', (q) => q.eq('workspaceId', wsId).eq('agentId', undefined)).take(50),
        ])
        const models = resolveModels(workspace?.models, agent.models, agent.model)
        const length = agent.replyLength ?? 'short'
        const history = recent.reverse()
        // In a group chat each line is prefixed with who said it, so the model can tell people apart
        let turnsFrom = history
        if (conversation.threadKey) {
            const ids = [...new Set(history.flatMap((m) => (m.senderId ? [m.senderId] : [])))]
            const names = new Map(await Promise.all(ids.map(async (id) => [id, (await ctx.db.get('contacts', id))?.name ?? 'someone'] as const)))
            turnsFrom = history.map((m) => (m.from === 'contact' && m.senderId ? { ...m, body: `${names.get(m.senderId)}: ${m.body}` } : m))
        }
        // Encrypted keys for the providers this reply might use; the action decrypts them
        const keyFor = async (provider: string) => {
            if (!isTextProvider(provider as TextProvider)) return undefined
            const conn = await ctx.db
                .query('connections')
                .withIndex('by_workspace_and_provider', (q) => q.eq('workspaceId', wsId).eq('provider', provider as TextProvider))
                .first()
            return conn?.secret
        }
        const backup = models.backup.option.id === NONE ? null : models.backup.option
        const prompt: Prompt = {
            system: systemPrompt({ agent, workspace, contact, knowledge: [...own, ...shared], now, group: conversation.threadKey ? (conversation.title ?? 'a group chat') : undefined }),
            turns: toTurns(turnsFrom),
            temperature: agent.temperature,
            maxTokens: MAX_TOKENS[length],
        }
        return {
            kind: 'ready' as const,
            agentId: agent._id,
            agentName: agent.name,
            prompt,
            brain: models.brain.option,
            backup,
            brainKey: await keyFor(models.brain.option.provider),
            backupKey: backup ? await keyFor(backup.provider) : undefined,
        }
    },
})

export const generate = internalAction({
    args: { conversationId: v.id('conversations'), messageId: v.id('messages') },
    handler: async (ctx, { conversationId, messageId }) => {
        const job = await ctx.runQuery(internal.replies.context, { conversationId, messageId, now: Date.now() })
        if (!job) return
        if (job.kind === 'stale') {
            await ctx.runMutation(internal.replies.settle, { conversationId })
            return
        }
        if (job.kind === 'blocked') {
            await ctx.runMutation(internal.replies.fail, { conversationId, problem: job.problem })
            return
        }

        const key = async (secret: string | undefined) => (secret ? (await decrypt<{ apiKey: string }>(secret)).apiKey : undefined)
        const attempt = async (option: ModelOption, secret: string | undefined) => ({ option, text: await complete(option, job.prompt, await key(secret)) })
        let result: { option: ModelOption; text: string } | undefined
        let slot = 'brain'
        let problem: string
        try {
            result = await attempt(job.brain, job.brainKey)
        } catch (brainError) {
            problem = describe(brainError)
            // The Backup slot takes over when the brain's provider fails
            if (job.backup && job.backup.id !== job.brain.id) {
                try {
                    result = await attempt(job.backup, job.backupKey)
                    slot = 'backup'
                } catch (backupError) {
                    problem = `${problem}. Backup ${job.backup.label} failed too: ${describe(backupError)}`
                }
            }
        }

        if (result) await ctx.runMutation(internal.replies.save, { conversationId, agentId: job.agentId, slot, model: result.option.id, raw: result.text })
        else await ctx.runMutation(internal.replies.fail, { conversationId, problem: `${job.agentName} couldn't reply. ${problem!}` })
    },
})

const describe = (e: unknown) => (e instanceof ReplyError ? e.message : `${e instanceof Error ? e.message : String(e)}`.slice(0, 300))

// The job had nothing to do; stop showing the typing indicator
export const settle = internalMutation({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const c = await ctx.db.get('conversations', conversationId)
        if (c?.replying) await ctx.db.patch('conversations', conversationId, { replying: false })
    },
})

export const save = internalMutation({
    args: { conversationId: v.id('conversations'), agentId: v.id('agents'), slot: v.string(), model: v.string(), raw: v.string() },
    handler: async (ctx, { conversationId, agentId, slot, model, raw }) => {
        const conversation = await ctx.db.get('conversations', conversationId)
        if (!conversation) return
        const { body, handoff } = parseReply(raw)
        const at = Date.now()
        // A reply that was only the marker still hands off, without sending an empty text
        if (body) {
            const messageId = await ctx.db.insert('messages', { conversationId, from: 'agent', body, at, by: 'ai', model })
            await queueDelivery(ctx, messageId, conversation)
        }
        await ctx.db.patch('conversations', conversationId, {
            ...(body ? { lastMessage: body, lastAt: at } : {}),
            replying: false,
            needsYou: handoff || undefined,
            problem: handoff ? 'The agent asked you to step in.' : undefined,
        })
        await recordUsage(ctx, conversation.workspaceId, agentId, slot, model, at)
        if (handoff) {
            const [agent, contact] = await Promise.all([ctx.db.get('agents', agentId), ctx.db.get('contacts', conversation.contactId)])
            await notify(ctx, conversation.workspaceId, 'handoff', `${agent?.name ?? 'An agent'} needs you with ${contact?.name ?? 'a contact'}`, body || 'Open the conversation to reply.', conversationId)
        }
    },
})

export const fail = internalMutation({
    args: { conversationId: v.id('conversations'), problem: v.string() },
    handler: async (ctx, { conversationId, problem }) => {
        const conversation = await ctx.db.get('conversations', conversationId)
        if (!conversation) return
        await ctx.db.patch('conversations', conversationId, { replying: false, needsYou: true, problem })
        const contact = await ctx.db.get('contacts', conversation.contactId)
        await notify(ctx, conversation.workspaceId, 'handoff', `No reply sent to ${contact?.name ?? 'a contact'}`, problem, conversationId)
    },
})
