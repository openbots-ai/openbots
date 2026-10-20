import { sendText, twilioBuy, twilioOwned, twilioPoint, twilioSearch, twilioSignature, type Credentials } from '../providers'
import type { Server } from '../server'
import { sameSecret } from './relay'
import type { Line, OnText, Outgoing, Transport } from './types'

const twiml = { body: '<?xml version="1.0" encoding="UTF-8"?><Response/>', type: 'text/xml' }

// SMS through your own Twilio account. Twilio posts each text to the engine's public URL, signed with your auth token;
// numbers bought or reused from the dashboard are pointed there.
export class TwilioTransport implements Transport {
    readonly channel = 'twilio'

    constructor(
        private server: Server,
        private creds: Credentials['twilio'],
        // Where Twilio posts texts: your engine's public URL plus an unguessable path
        readonly hookUrl: string,
    ) {}

    async start(onText: OnText) {
        this.server.route(new URL(this.hookUrl).pathname, async ({ headers, body }) => {
            const params = Object.fromEntries(new URLSearchParams(body)) as Record<string, string>
            // Compared in constant time, so the response time gives nothing away about the right signature
            if (!sameSecret(String(headers['x-twilio-signature'] ?? ''), await twilioSignature(this.creds.authToken, this.hookUrl, params))) return { status: 403, body: 'Bad signature' }
            if (params.From && params.To && params.Body) await onText({ channel: 'twilio', from: params.From, to: params.To, body: params.Body })
            return twiml
        })
    }

    send({ from, to, body }: Outgoing) {
        return sendText('twilio', this.creds, { from, to, body })
    }

    // Numbers on the account whose texts already come to this agent
    async lines(): Promise<Line[]> {
        return (await twilioOwned(this.creds)).filter((n) => n.smsUrl === this.hookUrl).map((n) => ({ channel: 'twilio', handle: n.phoneNumber, externalId: n.sid }))
    }

    search(country: string, areaCode?: string) {
        return twilioSearch(this.creds, { country, areaCode })
    }

    owned() {
        return twilioOwned(this.creds)
    }

    async buy(phoneNumber: string) {
        const n = await twilioBuy(this.creds, phoneNumber, this.hookUrl)
        return { phoneNumber: n.phoneNumber, sid: n.sid! }
    }

    async use(sid: string, phoneNumber: string) {
        await twilioPoint(this.creds, sid, this.hookUrl)
        return { phoneNumber, sid }
    }

    async stop() {}
}
