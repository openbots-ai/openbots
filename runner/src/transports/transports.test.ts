// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { twilioSignature } from '../providers'
import { Server } from '../server'
import { BlueBubblesTransport } from './bluebubbles'
import { RelayTransport } from './relay'
import { SendblueTransport } from './sendblue'
import { TwilioTransport } from './twilio'
import type { Incoming } from './types'

// Each channel's webhook, posted to the engine's real web server
let server: Server
let base: string
let received: Incoming[]
const onText = async (t: Incoming) => {
    received.push(t)
    return { markRead: true }
}

beforeEach(() => {
    received = []
    const port = 20000 + Math.floor(Math.random() * 20000)
    server = new Server({ host: '127.0.0.1', port })
    base = `http://127.0.0.1:${port}`
})
afterEach(async () => {
    await server.stop()
    vi.unstubAllGlobals()
})

// The providers' own APIs (webhook registration) are stubbed; posts to the engine go through for real
const stubProviderApis = () => {
    const real = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => (url.startsWith(base) ? real(url, init) : Promise.resolve(new Response('{"data":[]}')))))
}

describe('webhooks', () => {
    it('relay: needs the secret, and passes the text on', async () => {
        await new RelayTransport(server, { inboundSecret: 's3cret-0123456789', relayUrl: 'http://relay' }).start(onText)
        await server.start()
        const post = (auth: string, body: unknown) => fetch(`${base}/inbound`, { method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(body) })
        expect((await post('Bearer nope', {})).status).toBe(401)
        expect((await post('Bearer s3cret-0123456789', { to: 1 })).status).toBe(400)
        const res = await post('Bearer s3cret-0123456789', { to: '+14155550101', from: '+12125550187', body: 'hi', name: 'Dana' })
        expect(await res.json()).toEqual({ ok: true, markRead: true })
        expect(received).toEqual([{ channel: 'relay', to: '+14155550101', from: '+12125550187', body: 'hi', name: 'Dana' }])
    })

    it('twilio: checks the signature against the public URL', async () => {
        const hookUrl = 'https://agent.example.com/hooks/twilio/abc'
        await new TwilioTransport(server, { accountSid: 'AC' + '0'.repeat(32), authToken: 'tok' }, hookUrl).start(onText)
        await server.start()
        const params = { From: '+12125550187', To: '+14155550101', Body: 'hello' }
        const post = (signature: string) => fetch(`${base}/hooks/twilio/abc`, { method: 'POST', headers: { 'X-Twilio-Signature': signature }, body: new URLSearchParams(params) })
        expect((await post('forged')).status).toBe(403)
        expect(received).toEqual([])
        const res = await post(await twilioSignature('tok', hookUrl, params))
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('<Response/>')
        expect(received).toEqual([{ channel: 'twilio', from: '+12125550187', to: '+14155550101', body: 'hello' }])
    })

    it('sendblue: skips its own outbound messages and keeps group chats', async () => {
        stubProviderApis()
        await new SendblueTransport(server, { keyId: 'k', secret: 's' }, 'https://agent.example.com/hooks/sendblue/abc').start(onText)
        await server.start()
        const post = (body: unknown) => fetch(`${base}/hooks/sendblue/abc`, { method: 'POST', body: JSON.stringify(body) })
        await post({ is_outbound: true, number: '+12125550187', content: 'from us' })
        await post({ number: '+12125550187', content: 'hey', sendblue_number: '+14155550101', group_id: 'g1', group_display_name: 'Crew' })
        expect(received).toEqual([{ channel: 'sendblue', from: '+12125550187', to: '+14155550101', body: 'hey', thread: { key: 'g1', title: 'Crew' } }])
    })

    it("bluebubbles: takes new messages that aren't from you, and spots group chats", async () => {
        stubProviderApis()
        await new BlueBubblesTransport(server, { serverUrl: 'http://mac.local:1234', password: 'p' }, 'http://agent.local/hooks/bluebubbles/abc').start(onText)
        await server.start()
        const post = (data: unknown) => fetch(`${base}/hooks/bluebubbles/abc`, { method: 'POST', body: JSON.stringify({ type: 'new-message', data }) })
        await post({ isFromMe: true, text: 'mine', handle: { address: '+12125550187' } })
        await post({ text: 'one to one', handle: { address: '+12125550187' }, chats: [{ guid: 'iMessage;-;+12125550187' }] })
        await post({ text: 'in the group', handle: { address: '+12125550187' }, chats: [{ guid: 'iMessage;+;chat7', displayName: 'Family' }] })
        expect(received).toEqual([
            { channel: 'bluebubbles', from: '+12125550187', body: 'one to one', thread: undefined },
            { channel: 'bluebubbles', from: '+12125550187', body: 'in the group', thread: { key: 'iMessage;+;chat7', title: 'Family' } },
        ])
        expect((await fetch(`${base}/hooks/bluebubbles/wrong`, { method: 'POST', body: '{}' })).status).toBe(404)
    })
})
