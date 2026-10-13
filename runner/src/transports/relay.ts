import { createServer, type Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { Incoming, Outgoing, Transport } from './types'

// For an agent that isn't on the Mac with iMessage: a relay on your Mac posts texts here and receives replies.
//   in:  POST http://<agent>:<port>/inbound  Authorization: Bearer $OPENBOTS_INBOUND_SECRET
//        { "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional>" }  →  { ok, markRead }
//   out: POST $OPENBOTS_RELAY_URL  Authorization: Bearer $OPENBOTS_RELAY_SECRET
//        { type: "message", from, to, body }, and { type: "typing", from, to } just before a reply
// Both machines are yours; put them on a private network or use HTTPS between them.
export type RelayOptions = { host: string; port: number; inboundSecret: string; relayUrl: string; relaySecret?: string }

const MAX_BODY = 64 * 1024

const sameSecret = (given: string, expected: string) => {
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
}

export class RelayTransport implements Transport {
    readonly name = 'relay'
    private server?: Server

    constructor(private options: RelayOptions) {}

    async start(onText: (text: Incoming) => Promise<{ markRead: boolean }>) {
        const { host, port, inboundSecret } = this.options
        this.server = createServer(async (req, res) => {
            const reply = (status: number, body: unknown) => {
                res.writeHead(status, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(body))
            }
            if (req.method !== 'POST' || req.url !== '/inbound') return reply(404, { error: 'Not found' })
            if (!sameSecret(req.headers.authorization ?? '', `Bearer ${inboundSecret}`)) return reply(401, { error: 'Unauthorized' })

            let raw = ''
            for await (const chunk of req) {
                raw += chunk
                if (raw.length > MAX_BODY) return reply(413, { error: 'Too large' })
            }
            const data: unknown = (() => {
                try {
                    return JSON.parse(raw)
                } catch {
                    return null
                }
            })()
            const field = (k: string) => {
                const value = data && typeof data === 'object' ? (data as Record<string, unknown>)[k] : undefined
                return typeof value === 'string' ? value : undefined
            }
            const [to, from, body] = [field('to'), field('from'), field('body')]
            if (!to || !from || !body) return reply(400, { error: 'Send JSON with string fields to, from and body' })
            try {
                const { markRead } = await onText({ to, from, body, name: field('name') })
                reply(200, { ok: true, markRead })
            } catch (e) {
                reply(422, { error: e instanceof Error ? e.message : 'Could not take that text' })
            }
        })
        await new Promise<void>((resolve) => this.server!.listen(port, host, resolve))
    }

    private async post(data: unknown) {
        const { relayUrl, relaySecret } = this.options
        const res = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(relaySecret ? { Authorization: `Bearer ${relaySecret}` } : {}) },
            body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error(`Relay answered ${res.status}`)
    }

    send(message: Outgoing) {
        return this.post({ type: 'message', ...message })
    }

    async typing(target: Omit<Outgoing, 'body'>) {
        await this.post({ type: 'typing', ...target }).catch(() => undefined)
    }

    async stop() {
        await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()))
    }
}
