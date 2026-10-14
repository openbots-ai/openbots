import { registerWebhook, sendText, type Credentials } from '../providers'
import { json, type Server } from '../server'
import type { OnText, Outgoing, Transport } from './types'

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

// iMessage through your Sendblue account. Sendblue posts every message on the account to the engine's public URL;
// the engine registers that webhook itself when it starts.
export class SendblueTransport implements Transport {
    readonly channel = 'sendblue'

    constructor(
        private server: Server,
        private creds: Credentials['sendblue'],
        readonly hookUrl: string,
    ) {}

    async start(onText: OnText) {
        this.server.route(new URL(this.hookUrl).pathname, async ({ body }) => {
            const d = (() => {
                try {
                    return JSON.parse(body) as Record<string, unknown>
                } catch {
                    return null
                }
            })()
            // Skip the messages Sendblue sent for us
            if (!d || d.is_outbound === true) return json({ ok: true })
            const from = str(d.number) ?? str(d.from_number)
            const text = str(d.content)
            const groupId = str(d.group_id)
            if (from && text) await onText({ channel: 'sendblue', from, to: str(d.sendblue_number) ?? str(d.to_number), body: text, thread: groupId ? { key: groupId, title: str(d.group_display_name) } : undefined })
            return json({ ok: true })
        })
        await registerWebhook('sendblue', this.creds, this.hookUrl)
    }

    send(message: Outgoing) {
        return sendText('sendblue', this.creds, message)
    }

    async stop() {}
}
