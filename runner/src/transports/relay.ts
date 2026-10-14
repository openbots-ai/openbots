import { timingSafeEqual } from 'node:crypto'
import { json, type Server } from '../server'
import type { OnText, Outgoing, Transport } from './types'

// A relay you run on your Mac posts texts to the engine and receives its replies:
//   in:  POST http://<agent>/inbound  Authorization: Bearer $OPENBOTS_INBOUND_SECRET
//        { "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional>" }  →  { ok, markRead }
//   out: POST $OPENBOTS_RELAY_URL  Authorization: Bearer $OPENBOTS_RELAY_SECRET
//        { type: "message", from, to, body }, and { type: "typing", from, to } just before a reply
export type RelayOptions = { inboundSecret: string; relayUrl: string; relaySecret?: string }

export const sameSecret = (given: string, expected: string) => {
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
}

const field = (data: unknown, k: string) => {
    const value = data && typeof data === 'object' ? (data as Record<string, unknown>)[k] : undefined
    return typeof value === 'string' && value ? value : undefined
}

export class RelayTransport implements Transport {
    readonly channel = 'relay'

    constructor(
        private server: Server,
        private options: RelayOptions,
    ) {}

    async start(onText: OnText) {
        this.server.route('/inbound', async ({ headers, body }) => {
            if (!sameSecret(headers.authorization ?? '', `Bearer ${this.options.inboundSecret}`)) return json({ error: 'Unauthorized' }, 401)
            const data: unknown = (() => {
                try {
                    return JSON.parse(body)
                } catch {
                    return null
                }
            })()
            const [to, from, text] = [field(data, 'to'), field(data, 'from'), field(data, 'body')]
            if (!to || !from || !text) return json({ error: 'Send JSON with string fields to, from and body' }, 400)
            const { markRead } = await onText({ channel: 'relay', to, from, body: text, name: field(data, 'name') })
            return json({ ok: true, markRead })
        })
    }

    private async post(data: unknown) {
        const { relayUrl, relaySecret } = this.options
        const res = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(relaySecret ? { Authorization: `Bearer ${relaySecret}` } : {}) },
            body: JSON.stringify(data),
            // A relay that never answers must not hold up the reply or the scheduler
            signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) throw new Error(`Relay answered ${res.status}`)
    }

    send({ from, to, body }: Outgoing) {
        return this.post({ type: 'message', from, to, body })
    }

    async typing({ from, to }: Omit<Outgoing, 'body'>) {
        await this.post({ type: 'typing', from, to }).catch(() => undefined)
    }

    async stop() {}
}
