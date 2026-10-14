import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env, internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { owned, requireWorkspace } from './lib/access'
import { bash, createComputer, deleteComputer, installSteps, openBotsWorkspace, OrgoError, startComputer, stopComputer } from './lib/orgo'
import { checkFields, decryptSecret, secretContext } from './lib/sealed'
import { hashToken, newToken } from './lib/tokens'

// Computers OpenBots creates on the account's own Orgo, with the Orgo API key saved in Connections. Setup runs one
// step at a time (each under Orgo's 300-second limit) and records its progress on the engine's row.

const setupStatus = v.union(v.literal('creating'), v.literal('installing'), v.literal('ready'), v.literal('failed'))

// The signed-in user's workspace and their saved Orgo key (still encrypted)
export const context = internalQuery({
    args: { runnerId: v.optional(v.id('runners')) },
    handler: async (ctx, { runnerId }) => {
        const ws = await requireWorkspace(ctx)
        const runner = runnerId ? await owned(ctx, ws, 'runners', runnerId) : null
        const row = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', ws._id).eq('service', 'orgo'))
            .unique()
        return { workspaceId: ws._id, sealed: row?.sealed ?? null, runner }
    },
})

async function orgoKey(workspaceId: Id<'workspace'>, sealed: string | null) {
    if (!sealed) throw new Error('Save your Orgo API key in Connections first')
    if (!env.ENCRYPTION_KEY) throw new Error('This server isn’t set up to read saved keys yet. Run `npm run setup`.')
    return checkFields('orgo', await decryptSecret(env.ENCRYPTION_KEY, secretContext(workspaceId, 'orgo'), sealed)).apiKey
}

// For steps that run later without the signed-in user: the key of the runner's own workspace
export const keyFor = internalQuery({
    args: { runnerId: v.id('runners') },
    handler: async (ctx, { runnerId }) => {
        const runner = await ctx.db.get('runners', runnerId)
        if (!runner) return null
        const row = await ctx.db
            .query('secrets')
            .withIndex('by_workspace_and_service', (q) => q.eq('workspaceId', runner.workspaceId).eq('service', 'orgo'))
            .unique()
        return { workspaceId: runner.workspaceId, sealed: row?.sealed ?? null, orgo: runner.orgo }
    },
})

export const addRunner = internalMutation({
    args: { workspaceId: v.id('workspace'), name: v.string(), tokenHash: v.string() },
    handler: (ctx, args) => ctx.db.insert('runners', { ...args, setup: { status: 'creating' } }),
})

export const update = internalMutation({
    args: {
        runnerId: v.id('runners'),
        orgo: v.optional(v.object({ computerId: v.string(), workspaceId: v.string() })),
        tokenHash: v.optional(v.string()),
        setup: v.optional(v.object({ status: setupStatus, step: v.optional(v.string()), error: v.optional(v.string()) })),
    },
    handler: async (ctx, { runnerId, ...patch }) => {
        if (await ctx.db.get('runners', runnerId)) await ctx.db.patch('runners', runnerId, patch)
    },
})

export const removeRunner = internalMutation({
    args: { runnerId: v.id('runners') },
    handler: async (ctx, { runnerId }) => {
        if (await ctx.db.get('runners', runnerId)) await ctx.db.delete('runners', runnerId)
    },
})

const message = (e: unknown) => (e instanceof OrgoError || e instanceof Error ? e.message : String(e))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Writes a fresh token to the computer, then schedules the rest of the setup
async function begin(ctx: ActionCtx, runnerId: Id<'runners'>, apiKey: string, computerId: string, engineUrl: string) {
    const token = newToken()
    await ctx.runMutation(internal.orgo.update, { runnerId, tokenHash: await hashToken(token), setup: { status: 'installing', step: 'Saving the engine’s settings' } })
    const [first] = installSteps({ convexUrl: env.CONVEX_CLOUD_URL, token, engineUrl })
    await runCommand(apiKey, computerId, first.command, first.timeout)
    await ctx.scheduler.runAfter(0, internal.orgo.runStep, { runnerId, index: 1, engineUrl })
}

// Runs one setup command, waiting out the minute or so a new computer takes to become reachable
async function runCommand(apiKey: string, computerId: string, command: string, timeout: number) {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await bash(apiKey, computerId, command, timeout)
            if (res.exit_code !== 0) throw new Error(res.output.trim().split('\n').slice(-3).join(' ').slice(0, 300) || `exit code ${res.exit_code}`)
            return
        } catch (e) {
            if (!(e instanceof OrgoError && e.status === 503) || attempt >= 12) throw e
            await sleep(10_000)
        }
    }
}

const engineUrlArg = v.string()
const checkEngineUrl = (url: string) => {
    if (!/^https:\/\/[^\s/]+\/\S+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S+$/.test(url)) throw new Error('Unexpected engine download address')
}

// Creates an always-on computer on the account's Orgo and sets the engine up on it
export const create = action({
    args: { name: v.string(), engineUrl: engineUrlArg },
    handler: async (ctx, { name, engineUrl }): Promise<Id<'runners'>> => {
        checkEngineUrl(engineUrl)
        const label = name.trim()
        if (!label) throw new Error('Give the computer a name, e.g. "My VM"')
        const { workspaceId, sealed } = await ctx.runQuery(internal.orgo.context, {})
        const apiKey = await orgoKey(workspaceId, sealed)
        // A placeholder hash until the computer is made; the real token is written in `begin`
        const runnerId: Id<'runners'> = await ctx.runMutation(internal.orgo.addRunner, { workspaceId, name: label, tokenHash: await hashToken(newToken()) })
        try {
            const space = await openBotsWorkspace(apiKey)
            const computer = await createComputer(apiKey, space.id, `openbots-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${runnerId.slice(-6)}`)
            await ctx.runMutation(internal.orgo.update, { runnerId, orgo: { computerId: computer.id, workspaceId: space.id } })
            await begin(ctx, runnerId, apiKey, computer.id, engineUrl)
        } catch (e) {
            await ctx.runMutation(internal.orgo.update, { runnerId, setup: { status: 'failed', error: message(e) } })
        }
        return runnerId
    },
})

export const runStep = internalAction({
    args: { runnerId: v.id('runners'), index: v.number(), engineUrl: engineUrlArg },
    handler: async (ctx, { runnerId, index, engineUrl }) => {
        const found = await ctx.runQuery(internal.orgo.keyFor, { runnerId })
        if (!found?.orgo) return
        // Later steps never need the token, so they're generated without it
        const steps = installSteps({ convexUrl: env.CONVEX_CLOUD_URL, token: '', engineUrl })
        const step = steps[index]
        if (!step) return void (await ctx.runMutation(internal.orgo.update, { runnerId, setup: { status: 'ready' } }))
        await ctx.runMutation(internal.orgo.update, { runnerId, setup: { status: 'installing', step: step.name } })
        try {
            await runCommand(await orgoKey(found.workspaceId, found.sealed), found.orgo.computerId, step.command, step.timeout)
            await ctx.scheduler.runAfter(0, internal.orgo.runStep, { runnerId, index: index + 1, engineUrl })
        } catch (e) {
            await ctx.runMutation(internal.orgo.update, { runnerId, setup: { status: 'failed', step: step.name, error: message(e) } })
        }
    },
})

// Runs the whole setup again on the same computer (every step is safe to repeat), with a fresh token
export const retrySetup = action({
    args: { id: v.id('runners'), engineUrl: engineUrlArg },
    handler: async (ctx, { id, engineUrl }) => {
        checkEngineUrl(engineUrl)
        const { workspaceId, sealed, runner } = await ctx.runQuery(internal.orgo.context, { runnerId: id })
        if (!runner?.orgo) throw new Error('That computer isn’t on Orgo')
        try {
            await begin(ctx, id, await orgoKey(workspaceId, sealed), runner.orgo.computerId, engineUrl)
        } catch (e) {
            await ctx.runMutation(internal.orgo.update, { runnerId: id, setup: { status: 'failed', step: 'Saving the engine’s settings', error: message(e) } })
        }
    },
})

const lifecycle = (run: typeof startComputer) =>
    action({
        args: { id: v.id('runners') },
        handler: async (ctx, { id }) => {
            const { workspaceId, sealed, runner } = await ctx.runQuery(internal.orgo.context, { runnerId: id })
            if (!runner?.orgo) throw new Error('That computer isn’t on Orgo')
            await run(await orgoKey(workspaceId, sealed), runner.orgo.computerId)
        },
    })

export const start = lifecycle(startComputer)
export const stop = lifecycle(stopComputer)

// Deletes the computer on Orgo (its disk and the engine's history go with it) and removes it here
export const remove = action({
    args: { id: v.id('runners') },
    handler: async (ctx, { id }) => {
        const { workspaceId, sealed, runner } = await ctx.runQuery(internal.orgo.context, { runnerId: id })
        if (runner?.orgo) {
            try {
                await deleteComputer(await orgoKey(workspaceId, sealed), runner.orgo.computerId)
            } catch (e) {
                // Already gone on Orgo is fine; anything else stops the delete so nothing is left running unseen
                if (!(e instanceof OrgoError && e.status === 404)) throw e
            }
        }
        await ctx.runMutation(internal.orgo.removeRunner, { runnerId: id })
    },
})
