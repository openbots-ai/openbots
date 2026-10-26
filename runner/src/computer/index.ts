import Anthropic from '@anthropic-ai/sdk'
import type { Store } from '../store'
import type { Driver } from './driver'
import { runTask, type Create } from './loop'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LinuxDriver } from './linux'
import { MacDriver } from './mac'
import { ComputerTasks, type Persist } from './tasks'
import { WindowsDriver } from './windows'

// Calls Claude: the loop's request carries `betas` and `context_management`, so it goes to the beta endpoint
type Client = (apiKey: string) => { beta: { messages: { create: (body: never) => Promise<unknown> } } }
// A computer turn can think for a while before it answers, so each call gets up to 5 minutes
const realClient: Client = (apiKey) => new Anthropic({ apiKey, maxRetries: 1, timeout: 300_000 })

export type ComputerDeps = {
    // Read at each call, so a key saved in Connections works without a restart
    anthropicKey: () => string | undefined
    // The Computer use model of the agent that started the task: the provider's name for it, and the option id usage is counted under
    model: (agentId: string) => { api: string; id: string }
    budget: () => Promise<string | null>
    // One model call, counted on the agent that started the task under the model's option id
    record: (agentId: string, modelId: string) => void
    log: (line: string) => void
    // Why the agent may not go on with its task right now, or null (see computerAllowed)
    allowed?: (agentId: string) => string | null
    persist?: Persist
    driver?: Driver
    create?: Create
    anthropic?: Client
}

// The driver for this machine's screen, mouse and keyboard. Linux keeps the desktop's remote control permission in the
// data folder, so it's asked for once.
export const driverFor = (os: string, dataDir: string = join(homedir(), '.openbots')): Driver | undefined =>
    os === 'windows' ? new WindowsDriver() : os === 'mac' ? new MacDriver() : os === 'linux' ? new LinuxDriver(join(dataDir, 'linux-remote-control')) : undefined

// Computer use for the machine the engine runs on: Windows, Mac and Linux
export function makeComputer(os: string, deps: ComputerDeps): ComputerTasks | undefined {
    if (os !== 'windows' && os !== 'mac' && os !== 'linux') return undefined
    let driver = deps.driver
    const client = deps.anthropic ?? realClient
    const create: Create =
        deps.create ??
        (async (body) => {
            const key = deps.anthropicKey()
            if (!key) throw new Error('Add your Anthropic key in Connections')
            // The computer toolset is newer than the SDK's types, so the request goes as written
            return (await client(key).beta.messages.create(body as never)) as never
        })
    return new ComputerTasks({
        log: deps.log,
        persist: deps.persist,
        allowed: deps.allowed,
        run: async (task, hooks, ctx) => {
            driver ??= driverFor(os)!
            const missing = await driver.ready()
            if (missing) throw new Error(missing)
            const model = deps.model(ctx.agentId)
            try {
                return await runTask(task, {
                    create,
                    model: model.api,
                    os,
                    driver,
                    ask: hooks.ask,
                    approve: hooks.approve,
                    stopped: hooks.stopped,
                    overBudget: deps.budget,
                    record: () => deps.record(ctx.agentId, model.id),
                    now: Date.now,
                })
            } finally {
                // The Windows helper starts again with the next task
                driver.close()
            }
        },
    })
}

// A task goes on only while computer use is on and the agent that started it isn't paused
export function computerAllowed(config: { computerUse?: boolean; agents: { _id: string; status?: string }[] } | null | undefined, agentId: string): string | null {
    if (config?.computerUse !== true) return 'computer use was turned off'
    if (config.agents.find((a) => a._id === agentId)?.status === 'paused') return 'the agent was paused'
    return null
}

const KEY = 'computer.task'
type Saved = { agentId: string; conversationId: number; task: string }

// The running task, sealed in the engine's local store while it runs
export const taskMemory = (store: Pick<Store, 'setSealedMeta' | 'deleteMeta'>): Persist => ({
    save: (t) => store.setSealedMeta(KEY, JSON.stringify(t)),
    clear: () => store.deleteMeta(KEY),
})

// A task the engine's restart ended: texts you once, in the chat it reported to. While that chat's channel isn't
// running it's kept for a later check (each dashboard change runs this again); a deleted chat forgets it.
export async function tellAboutRestart(
    store: Pick<Store, 'getSealedMeta' | 'deleteMeta'>,
    send: (agentId: string, conversationId: number, body: string) => Promise<void>,
    log: (line: string) => void = () => {},
    reach: (conversationId: number) => 'ready' | 'waiting' | 'gone' = () => 'ready',
) {
    let saved: Saved
    try {
        const raw = store.getSealedMeta(KEY)
        if (!raw) return
        saved = JSON.parse(raw) as Saved
    } catch (e) {
        log(`Couldn’t read the computer task the restart stopped: ${e instanceof Error ? e.message : String(e)}`)
        return store.deleteMeta(KEY)
    }
    const where = reach(saved.conversationId)
    if (where === 'gone') {
        log('The chat of the computer task the restart stopped is gone, so it’s forgotten')
        return store.deleteMeta(KEY)
    }
    if (where === 'waiting') return log('The computer task the restart stopped is waiting for its chat’s channel; you’ll hear about it once it runs')
    // Forgotten first, so a failing text can't repeat at every start
    store.deleteMeta(KEY)
    await send(saved.agentId, saved.conversationId, `I was restarted, so I stopped “${saved.task}”. Text me to start it again.`).catch((e) =>
        log(`Couldn’t tell you about the computer task the restart stopped: ${e instanceof Error ? e.message : String(e)}`),
    )
}
