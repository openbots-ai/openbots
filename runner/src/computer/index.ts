import Anthropic from '@anthropic-ai/sdk'
import type { Store } from '../store'
import type { Driver } from './driver'
import { runTask, type Create } from './loop'
import { MacDriver } from './mac'
import { ComputerTasks, type Persist } from './tasks'
import { WindowsDriver } from './windows'

// Calls Claude: the loop's request carries `betas` and `context_management`, so it goes to the beta endpoint
type Client = (apiKey: string) => { beta: { messages: { create: (body: never) => Promise<unknown> } } }
const realClient: Client = (apiKey) => new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 })

export type ComputerDeps = {
    // Read at each call, so a key saved in Connections works without a restart
    anthropicKey: () => string | undefined
    // The Computer use model of the agent that started the task
    model: (agentId: string) => string
    budget: () => Promise<string | null>
    // One model call, counted on the agent that started the task
    record: (agentId: string, model: string) => void
    log: (line: string) => void
    persist?: Persist
    driver?: Driver
    create?: Create
    anthropic?: Client
}

// The driver for this machine's screen, mouse and keyboard: Windows and Mac only
export const driverFor = (os: string): Driver | undefined => (os === 'windows' ? new WindowsDriver() : os === 'mac' ? new MacDriver() : undefined)

// Computer use for the machine the engine runs on: Windows and Mac only (Linux computers answer texts only)
export function makeComputer(os: string, deps: ComputerDeps): ComputerTasks | undefined {
    if (os !== 'windows' && os !== 'mac') return undefined
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
        run: async (task, hooks, ctx) => {
            driver ??= driverFor(os)!
            const missing = await driver.ready()
            if (missing) throw new Error(missing)
            const model = deps.model(ctx.agentId)
            try {
                return await runTask(task, {
                    create,
                    model,
                    os,
                    driver,
                    ask: hooks.ask,
                    stopped: hooks.stopped,
                    overBudget: deps.budget,
                    record: () => deps.record(ctx.agentId, model),
                    now: Date.now,
                })
            } finally {
                // The Windows helper starts again with the next task
                driver.close()
            }
        },
    })
}

const KEY = 'computer.task'
type Saved = { agentId: string; conversationId: number; task: string }

// The running task, sealed in the engine's local store while it runs
export const taskMemory = (store: Pick<Store, 'setSealedMeta' | 'deleteMeta'>): Persist => ({
    save: (t) => store.setSealedMeta(KEY, JSON.stringify(t)),
    clear: () => store.deleteMeta(KEY),
})

// A task the engine's restart ended: texts you once, in the chat it reported to
export async function tellAboutRestart(store: Pick<Store, 'getSealedMeta' | 'deleteMeta'>, send: (agentId: string, conversationId: number, body: string) => Promise<void>, log: (line: string) => void = () => {}) {
    let saved: Saved
    try {
        const raw = store.getSealedMeta(KEY)
        if (!raw) return
        saved = JSON.parse(raw) as Saved
    } catch (e) {
        log(`Couldn’t read the computer task the restart stopped: ${e instanceof Error ? e.message : String(e)}`)
        return store.deleteMeta(KEY)
    }
    // Forgotten first, so a failing text can't repeat at every start
    store.deleteMeta(KEY)
    await send(saved.agentId, saved.conversationId, `I was restarted, so I stopped “${saved.task}”. Text me to start it again.`).catch((e) =>
        log(`Couldn’t tell you about the computer task the restart stopped: ${e instanceof Error ? e.message : String(e)}`),
    )
}
