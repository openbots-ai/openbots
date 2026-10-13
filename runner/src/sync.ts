import { ConvexClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { Activity, Config, Link } from './pipeline'

// The agent's connection to Convex. It reads your configuration (live) and sends back a heartbeat and counts.
// Nothing here carries message text, contact details or provider keys.
export class ConvexLink implements Link {
    private client: ConvexClient
    private latest: Config | null = null
    private unsubscribe?: () => void

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
            this.unsubscribe = this.client.onUpdate(
                api.runner.config,
                { token: this.token },
                (config) => {
                    this.latest = config
                    if (first && config) {
                        first = false
                        resolve()
                    } else if (first) onError('Waiting for the workspace to be set up in the dashboard…')
                },
                (error) => {
                    const message = error.message.match(/Uncaught Error: (.*?)(?:\n|$)/)?.[1] ?? error.message
                    if (first) reject(new Error(message))
                    else onError(message)
                },
            ).unsubscribe
        })
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

    heartbeat(status: { version: string; transport: string; providers: Record<string, boolean>; demo: boolean }) {
        return this.client.mutation(api.runner.heartbeat, { token: this.token, ...status })
    }

    async close() {
        this.unsubscribe?.()
        await this.client.close()
    }
}
