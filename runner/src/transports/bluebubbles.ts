import { check, registerWebhook, sendText, type Credentials } from '../providers'
import { json, type Server } from '../server'
import type { Line, OnText, Outgoing, Transport } from './types'

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

// iMessage from your own Mac through its BlueBubbles server. The server posts new messages to the engine (on your
// network, or its public URL); the engine registers that webhook itself when it starts.
export class BlueBubblesTransport implements Transport {
    readonly channel = 'bluebubbles'

    constructor(
        private server: Server,
        private creds: Credentials['bluebubbles'],
        readonly hookUrl: string,
    ) {}

    async start(onText: OnText) {
        this.server.route(new URL(this.hookUrl).pathname, async ({ body }) => {
            const d = (() => {
                try {
                    return JSON.parse(body) as { type?: string; data?: Record<string, unknown> }
                } catch {
                    return null
                }
            })()
            const m = d?.data
            if (d?.type !== 'new-message' || !m || m.isFromMe === true) return json({ ok: true })
            const from = str((m.handle as { address?: unknown } | undefined)?.address)
            const text = str(m.text)
            const chat = ((m.chats as Record<string, unknown>[] | undefined) ?? [])[0]
            const chatGuid = str(chat?.guid)
            // Group chat guids contain ";+;"
            const isGroup = !!chatGuid && chatGuid.includes(';+;')
            if (from && text) await onText({ channel: 'bluebubbles', from, body: text, thread: isGroup ? { key: chatGuid!, title: str(chat?.displayName) } : undefined })
            return json({ ok: true })
        })
        await registerWebhook('bluebubbles', this.creds, this.hookUrl)
    }

    send(message: Outgoing) {
        return sendText('bluebubbles', this.creds, message)
    }

    // The Apple ID the Mac is signed in to
    async lines(): Promise<Line[]> {
        const { details } = await check('bluebubbles', this.creds)
        return details?.account ? [{ channel: 'bluebubbles', handle: details.account }] : []
    }

    async stop() {}
}
