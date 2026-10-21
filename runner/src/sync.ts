import { ConvexClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Infer } from 'convex/values'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import type { KeyModel } from '../../convex/lib/models'
import type { service } from '../../convex/schema'
import type { DashboardDoc } from './config'
import type { Activity, Config, Link } from './pipeline'
import type { Channel, Line } from './transports/types'

export type Status = {
    version: string
    services: { service: Infer<typeof service>; label?: string; error?: string }[]
    models: KeyModel[]
    channels: Channel[]
    lines: Line[]
    demo: boolean
    tunnelUrl?: string
    jobs?: { agentId: Id<'agents'>; reminders: number; watches: number }[]
    os?: 'windows' | 'mac' | 'linux' | 'other'
}
export type Task = { _id: Id<'tasks'>; request: Doc<'tasks'>['request'] }
export type TaskResult = NonNullable<Doc<'tasks'>['result']>

const reason = (error: Error) => error.message.match(/Uncaught Error: (.*?)(?:\n|$)/)?.[1] ?? error.message

// Takes each new request once: claims it, and runs it only if this engine won the claim. A lost or failed claim is
// skipped, so with several engines each request runs on just one of them.
export function claimEach(claim: (id: Id<'tasks'>) => Promise<boolean>, onTask: (task: Task) => void, onError: (error: Error) => void) {
    const seen = new Set<string>()
    return (tasks: Task[]) => {
        for (const t of tasks) {
            if (seen.has(t._id)) continue
            seen.add(t._id)
            claim(t._id).then(
                (won) => {
                    if (won) onTask(t)
                },
                (e: unknown) => onError(e instanceof Error ? e : new Error(String(e))),
            )
        }
    }
}

// The engine's connection to Convex. It reads your configuration and requests (live) and sends back a heartbeat,
// counts and task results. Nothing here carries message text, contact details or credentials.
export class ConvexLink implements Link {
    private client: ConvexClient
    private latest: Config | null = null
    private unsubscribers: (() => void)[] = []

    constructor(
        url: string,
        private token: string,
    ) {
        this.client = new ConvexClient(url)
    }

    // Resolves once the first configuration arrives; rejects if the token is refused
    connect(onError: (message: string) => void) {
        return new Promise<void>((resolve, reject) => {
            let first = true
            const sub = this.client.onUpdate(
                api.runner.config,
                { token: this.token },
                (config) => {
                    this.latest = config
                    if (first && config) {
                        first = false
                        resolve()
                    } else if (first) onError('Waiting for the workspace to be set up in the dashboard…')
                },
                (error) => (first ? reject(new Error(reason(error))) : onError(reason(error))),
            )
            this.unsubscribers.push(() => sub.unsubscribe())
        })
    }

    // Calls `onTask` for each request the dashboard queues that this engine claims (another engine may get it first)
    onTasks(onTask: (task: Task) => void) {
        const each = claimEach(
            (id) => this.client.mutation(api.runner.claimTask, { token: this.token, id }),
            onTask,
            (e) => console.error(`Couldn't take a request from the dashboard: ${reason(e)}`),
        )
        const sub = this.client.onUpdate(api.runner.tasks, { token: this.token }, each)
        this.unsubscribers.push(() => sub.unsubscribe())
    }

    // Keys saved in Connections for this account and the engine's public URL, now and whenever they change
    onDashboard(onChange: (doc: DashboardDoc) => void, onError: (message: string) => void = (m) => console.error(`Couldn't read your keys from the dashboard: ${m}`)) {
        const sub = this.client.onUpdate(api.runner.dashboard, { token: this.token }, onChange, (error) => onError(reason(error)))
        this.unsubscribers.push(() => sub.unsubscribe())
    }

    finishTask(id: Id<'tasks'>, outcome: { result?: TaskResult; error?: string }) {
        return this.client.mutation(api.runner.finishTask, { token: this.token, id, ...outcome })
    }

    config() {
        return this.latest
    }

    budget(today: string) {
        return this.client.query(api.runner.budget, { token: this.token, today })
    }

    async record(agentId: Id<'agents'>, data: { usage?: { slot: string; model: string }; activity?: Activity }) {
        await this.client.mutation(api.runner.record, { token: this.token, agentId, ...data })
    }

    async ignored(senders: string[]) {
        await this.client.mutation(api.runner.ignored, { token: this.token, senders })
    }

    // Fails with a plain reason, e.g. when this engine's key doesn't match the one saved for it
    heartbeat(status: Status) {
        return this.client.mutation(api.runner.heartbeat, { token: this.token, ...status }).catch((error: Error) => {
            throw new Error(reason(error))
        })
    }

    async close() {
        this.unsubscribers.forEach((u) => u())
        await this.client.close()
    }
}
