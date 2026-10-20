import { registerWebhook, sendText, type Credentials } from '../providers'
import { json, type Server } from '../server'
import { sameSecret } from './relay'
import type { OnText, Outgoing, Transport } from './types'

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

// iMessage through your Sendblue account. Sendblue posts every message on the account to the engine's public URL;
// the engine registers that webhook itself when it starts, with a signing secret Sendblue sends back in the
// sb-signing-secret header of each post. A post without it is refused.
export class SendblueTransport implements Transport {
    readonly channel = 'sendblue'

    constructor(
        private server: Server,
        private creds: Credentials['sendblue'],
        readonly hookUrl: string,
        private signingSecret: string,
    ) {}

    async start(onText: OnText) {
        this.server.route(new URL(this.hookUrl).pathname, async ({ headers, body }) => {
            if (!sameSecret(String(headers['sb-signing-secret'] ?? ''), this.signingSecret)) return json({ error: 'Unauthorized' }, 401)
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
            // Sendblue falls back to SMS for phones without iMessage; `service` says which it was
            const sms = d.service !== 'iMessage'
            if (from && text) await onText({ channel: 'sendblue', from, to: str(d.sendblue_number) ?? str(d.to_number), body: text, thread: groupId ? { key: groupId, title: str(d.group_display_name) } : undefined, ...(sms ? { sms } : {}) })
            return json({ ok: true })
        })
        await registerWebhook('sendblue', this.creds, this.hookUrl, this.signingSecret)
    }

    send(message: Outgoing) {
        return sendText('sendblue', this.creds, message)
    }

    async stop() {}
}
