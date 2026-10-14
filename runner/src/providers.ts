// Everything that talks to your texting and email accounts: checking credentials, sending texts and email, and
// Twilio number management. Runs only on your engine, with credentials from its environment (see config.ts).

export type Credentials = {
    twilio: { accountSid: string; authToken: string }
    sendblue: { keyId: string; secret: string }
    bluebubbles: { serverUrl: string; password: string }
    resend: { apiKey: string; from: string }
}

// A problem you can fix (wrong key, server unreachable); shown in the dashboard as-is
export class ConnectError extends Error {}

const SENDBLUE = 'https://api.sendblue.com'
const TWILIO = 'https://api.twilio.com/2010-04-01'

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`
const twilioAuth = (c: Credentials['twilio']) => ({ Authorization: basic(c.accountSid, c.authToken) })
const sendblueAuth = (c: Credentials['sendblue']) => ({ 'sb-api-key-id': c.keyId, 'sb-api-secret-key': c.secret, 'Content-Type': 'application/json' })
const bbUrl = (c: Credentials['bluebubbles'], path: string) => `${c.serverUrl.replace(/\/+$/, '')}/api/v1/${path}?password=${encodeURIComponent(c.password)}`

async function call(url: string, init: RequestInit, what: string) {
    let res: Response
    try {
        res = await fetch(url, init)
    } catch (e) {
        throw new ConnectError(`Couldn't reach ${what}: ${e instanceof Error ? e.message : String(e)}`)
    }
    const text = await res.text()
    let data: unknown = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        // Not JSON; the status code decides
    }
    if (res.status === 401 || res.status === 403) throw new ConnectError(`${what} rejected these credentials`)
    if (!res.ok) {
        const msg = (data as { message?: string; error?: { message?: string } | string } | null)?.message ?? (typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : (data as { error?: { message?: string } })?.error?.message)
        throw new ConnectError(`${what} answered ${res.status}${msg ? `: ${msg}` : ''}`)
    }
    return data as Record<string, unknown> & { data?: unknown }
}

const tail = (s: string) => (s.length > 10 ? `${s.slice(0, 3)}…${s.slice(-4)}` : '••••')

// Checks the credentials work and returns what's safe to show about the account
export async function check<P extends keyof Credentials>(provider: P, creds: Credentials[P]): Promise<{ label: string; details?: Record<string, string> }> {
    switch (provider) {
        case 'twilio': {
            const c = creds as Credentials['twilio']
            if (!/^AC[0-9a-f]{32}$/i.test(c.accountSid)) throw new ConnectError('The Account SID starts with AC and has 34 characters')
            const account = await call(`${TWILIO}/Accounts/${c.accountSid}.json`, { headers: twilioAuth(c) }, 'Twilio')
            if (account.status !== 'active') throw new ConnectError(`This Twilio account is ${String(account.status)}`)
            return { label: String(account.friendly_name ?? c.accountSid), details: { accountSid: c.accountSid } }
        }
        case 'sendblue': {
            const c = creds as Credentials['sendblue']
            await call(`${SENDBLUE}/api/account/webhooks`, { headers: sendblueAuth(c) }, 'Sendblue')
            return { label: tail(c.keyId) }
        }
        case 'bluebubbles': {
            const c = creds as Credentials['bluebubbles']
            if (!/^https?:\/\//.test(c.serverUrl)) throw new ConnectError('The server URL starts with http:// or https://')
            const info = await call(bbUrl(c, 'server/info'), {}, 'your BlueBubbles server')
            const data = (info.data ?? {}) as { os_version?: string; server_version?: string; detected_icloud?: string }
            return {
                label: c.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
                details: { serverUrl: c.serverUrl.replace(/\/+$/, ''), ...(data.server_version ? { version: data.server_version } : {}), ...(data.detected_icloud ? { account: data.detected_icloud } : {}) },
            }
        }
        case 'resend': {
            const c = creds as Credentials['resend']
            if (!/@/.test(c.from)) throw new ConnectError('Send from needs an email address on a domain you verified in Resend')
            await call('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${c.apiKey}` } }, 'Resend')
            return { label: c.from, details: { from: c.from } }
        }
    }
    throw new ConnectError('Unknown provider')
}

// Points the account's incoming messages at your engine's webhook, unless it already is. Twilio is set per number
// when a number is added.
export async function registerWebhook(provider: keyof Credentials, creds: Credentials[keyof Credentials], url: string) {
    if (provider === 'sendblue') {
        const c = creds as Credentials['sendblue']
        const existing = await call(`${SENDBLUE}/api/account/webhooks`, { headers: sendblueAuth(c) }, 'Sendblue')
        if (!JSON.stringify(existing).includes(url)) await call(`${SENDBLUE}/api/account/webhooks`, { method: 'POST', headers: sendblueAuth(c), body: JSON.stringify({ webhooks: [url], type: 'receive' }) }, 'Sendblue')
    }
    if (provider === 'bluebubbles') {
        const c = creds as Credentials['bluebubbles']
        const existing = await call(bbUrl(c, 'webhook'), {}, 'your BlueBubbles server')
        if (!JSON.stringify(existing).includes(url)) await call(bbUrl(c, 'webhook'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, events: ['new-message'] }) }, 'your BlueBubbles server')
    }
}

export type Outgoing = { from: string; to: string; body: string; threadKey?: string }

// Sends one text through a texting channel
export async function sendText(provider: 'twilio' | 'sendblue' | 'bluebubbles', creds: Credentials[typeof provider], m: Outgoing) {
    if (provider === 'twilio') {
        const c = creds as Credentials['twilio']
        await call(`${TWILIO}/Accounts/${c.accountSid}/Messages.json`, { method: 'POST', headers: { ...twilioAuth(c), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: m.from, To: m.to, Body: m.body }) }, 'Twilio')
        return
    }
    if (provider === 'sendblue') {
        const c = creds as Credentials['sendblue']
        const body = m.threadKey ? { group_id: m.threadKey, from_number: m.from, content: m.body } : { number: m.to, from_number: m.from, content: m.body }
        await call(`${SENDBLUE}/api/${m.threadKey ? 'send-group-message' : 'send-message'}`, { method: 'POST', headers: sendblueAuth(c), body: JSON.stringify(body) }, 'Sendblue')
        return
    }
    const c = creds as Credentials['bluebubbles']
    // A group is addressed by its chat guid; a one-to-one chat by the person's handle
    const chatGuid = m.threadKey ?? `iMessage;-;${m.to}`
    await call(bbUrl(c, 'message/text'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatGuid, tempGuid: crypto.randomUUID(), message: m.body, method: 'apple-script' }) }, 'your BlueBubbles server')
}

// Sends a notification email through the workspace's Resend account
export async function sendEmail(creds: Credentials['resend'], to: string, subject: string, text: string) {
    await call('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: creds.from, to, subject, text }) }, 'Resend')
}

/* Twilio numbers, bought and billed on the person's own Twilio account */

export type TwilioNumber = { sid?: string; phoneNumber: string; friendlyName: string; locality?: string; region?: string; smsUrl?: string }

export async function twilioSearch(c: Credentials['twilio'], { country, areaCode, contains }: { country: string; areaCode?: string; contains?: string }): Promise<TwilioNumber[]> {
    const q = new URLSearchParams({ SmsEnabled: 'true', PageSize: '12' })
    if (areaCode) q.set('AreaCode', areaCode)
    if (contains) q.set('Contains', contains)
    const data = await call(`${TWILIO}/Accounts/${c.accountSid}/AvailablePhoneNumbers/${country}/Local.json?${q}`, { headers: twilioAuth(c) }, 'Twilio')
    return ((data.available_phone_numbers as Record<string, string>[] | undefined) ?? []).map((n) => ({ phoneNumber: n.phone_number, friendlyName: n.friendly_name, locality: n.locality, region: n.region }))
}

export async function twilioOwned(c: Credentials['twilio']): Promise<TwilioNumber[]> {
    const data = await call(`${TWILIO}/Accounts/${c.accountSid}/IncomingPhoneNumbers.json?PageSize=100`, { headers: twilioAuth(c) }, 'Twilio')
    return ((data.incoming_phone_numbers as Record<string, string>[] | undefined) ?? []).map((n) => ({ sid: n.sid, phoneNumber: n.phone_number, friendlyName: n.friendly_name, smsUrl: n.sms_url }))
}

export async function twilioBuy(c: Credentials['twilio'], phoneNumber: string, smsUrl: string): Promise<TwilioNumber> {
    const n = await call(
        `${TWILIO}/Accounts/${c.accountSid}/IncomingPhoneNumbers.json`,
        { method: 'POST', headers: { ...twilioAuth(c), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ PhoneNumber: phoneNumber, SmsUrl: smsUrl, SmsMethod: 'POST' }) },
        'Twilio',
    )
    return { sid: String(n.sid), phoneNumber: String(n.phone_number), friendlyName: String(n.friendly_name) }
}

export async function twilioPoint(c: Credentials['twilio'], sid: string, smsUrl: string) {
    await call(
        `${TWILIO}/Accounts/${c.accountSid}/IncomingPhoneNumbers/${sid}.json`,
        { method: 'POST', headers: { ...twilioAuth(c), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ SmsUrl: smsUrl, SmsMethod: 'POST' }) },
        'Twilio',
    )
}

// Twilio signs each webhook: base64(HMAC-SHA1(auth token, url + each sorted param name and value))
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
    const payload = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
    return btoa(String.fromCharCode(...sig))
}
