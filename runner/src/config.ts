import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_KEYS, type Brains } from './brain'
import { checkFields, type SealedService, type SecretFields } from '../../convex/lib/sealed'
import type { Credentials } from './providers'

// Everything the engine needs comes from environment variables (or a .env file passed with node --env-file).
// Keys, account logins and history stay on this machine; see runner/README.md.
export type Settings = {
    convexUrl: string
    // OPENBOTS_TOKEN when set; otherwise the engine asks for it once and saves it (see token.ts)
    token?: string
    dataDir: string
    // The engine's web server, for your relay and your accounts' webhooks
    host: string
    port: number
    // How the internet (Twilio, Sendblue) or your Mac (BlueBubbles) reaches that server
    publicUrl?: string
    // OPENBOTS_MAC as set; unset means "on a Mac with no other texting"
    macSetting?: boolean
    mac: boolean
    relay?: { inboundSecret: string; relayUrl: string; relaySecret?: string }
    twilio?: Credentials['twilio']
    sendblue?: Credentials['sendblue']
    bluebubbles?: Credentials['bluebubbles']
    resend?: Credentials['resend']
    brains: Brains
    // Cloudflare's quick tunnel gives the engine a public address when Twilio or Sendblue need one and no public URL is
    // set. On unless OPENBOTS_TUNNEL=false; `bin` is OPENBOTS_CLOUDFLARED, else a pinned copy is downloaded (cloudflared.ts)
    tunnel?: { bin?: string }
    // Make new webhook secrets for Twilio, Sendblue and BlueBubbles on this start (OPENBOTS_ROTATE_WEBHOOKS=true)
    rotateHooks?: boolean
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
    const get = (name: string) => env[name]?.trim() || undefined
    const missing: string[] = []
    const need = (name: string) => {
        const value = get(name)
        if (!value) missing.push(name)
        return value ?? ''
    }
    // Both or neither: a half-set account is a mistake worth pointing out
    const pair = <A extends string, B extends string>(a: string, b: string, as: [A, B]) => {
        const [x, y] = [get(a), get(b)]
        if (!x && !y) return undefined
        if (!x || !y) missing.push(x ? b : a)
        return { [as[0]]: x ?? '', [as[1]]: y ?? '' } as Record<A | B, string>
    }

    const convexUrl = need('OPENBOTS_CONVEX_URL')
    const token = get('OPENBOTS_TOKEN')
    const relay = get('OPENBOTS_INBOUND_SECRET') || get('OPENBOTS_RELAY_URL') ? { inboundSecret: need('OPENBOTS_INBOUND_SECRET'), relayUrl: need('OPENBOTS_RELAY_URL'), relaySecret: get('OPENBOTS_RELAY_SECRET') } : undefined
    const twilio = pair('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', ['accountSid', 'authToken'])
    const sendblue = pair('SENDBLUE_API_KEY_ID', 'SENDBLUE_API_SECRET', ['keyId', 'secret'])
    const bluebubbles = pair('BLUEBUBBLES_URL', 'BLUEBUBBLES_PASSWORD', ['serverUrl', 'password'])
    const resend = pair('RESEND_API_KEY', 'RESEND_FROM', ['apiKey', 'from'])
    const publicUrl = get('OPENBOTS_PUBLIC_URL')?.replace(/\/+$/, '')
    if (relay && relay.inboundSecret && relay.inboundSecret.length < 16) throw new Error('OPENBOTS_INBOUND_SECRET should be at least 16 characters')
    if (missing.length) throw new Error(`Set ${missing.join(', ')} (see runner/README.md)`)

    const macRaw = get('OPENBOTS_MAC')
    const macSetting = macRaw ? macRaw === 'true' : undefined

    const keys = Object.fromEntries(Object.entries(PROVIDER_KEYS).flatMap(([provider, name]) => (get(name) ? [[provider, get(name)!]] : [])))
    const localUrl = get('OPENBOTS_LOCAL_URL')
    return {
        convexUrl,
        token,
        dataDir: get('OPENBOTS_DATA_DIR') || join(homedir(), '.openbots'),
        host: get('OPENBOTS_HOST') || '127.0.0.1',
        port: Number(get('OPENBOTS_PORT') || 8787),
        publicUrl,
        macSetting,
        mac: resolveMac({ macSetting, publicUrl, relay, twilio, sendblue, bluebubbles }),
        relay,
        twilio,
        sendblue,
        bluebubbles,
        resend,
        brains: { keys, local: localUrl ? { url: localUrl, key: get('OPENBOTS_LOCAL_KEY') } : undefined, demo: get('OPENBOTS_DEMO') === 'true' },
        tunnel: get('OPENBOTS_TUNNEL') === 'false' ? undefined : { bin: get('OPENBOTS_CLOUDFLARED') },
        rotateHooks: get('OPENBOTS_ROTATE_WEBHOOKS') === 'true',
    }
}

// Messages on this Mac: on by default on macOS when no other way to text can run. Twilio, Sendblue and BlueBubbles
// only count once there's a public URL, since they can't start without one.
export const resolveMac = (s: Pick<Settings, 'macSetting' | 'publicUrl' | 'relay' | 'twilio' | 'sendblue' | 'bluebubbles'>, os: string = platform()) =>
    s.macSetting ?? (os === 'darwin' && !s.relay && !(s.publicUrl && (s.twilio || s.sendblue || s.bluebubbles)))

export type DashboardValues = { publicUrl?: string; secrets: Partial<{ [S in SealedService]: SecretFields[S] }> }

// Keys from the dashboard over the environment: what you entered in Connections wins, and removing it there falls
// back to the environment variable
export function withDashboard(base: Settings, d: DashboardValues): Settings {
    const s = d.secrets
    const keys = { ...base.brains.keys }
    for (const provider of ['openai', 'anthropic', 'google', 'xai'] as const) if (s[provider]) keys[provider] = s[provider].apiKey
    const merged: Settings = {
        ...base,
        publicUrl: d.publicUrl?.replace(/\/+$/, '') || base.publicUrl,
        twilio: s.twilio ?? base.twilio,
        sendblue: s.sendblue ?? base.sendblue,
        bluebubbles: s.bluebubbles ?? base.bluebubbles,
        resend: s.resend ?? base.resend,
        brains: { ...base.brains, keys, local: s.local ? { url: s.local.url, key: s.local.key } : base.brains.local },
    }
    return { ...merged, mac: resolveMac(merged) }
}

export type DashboardDoc = {
    publicUrl?: string
    secrets: { service: SealedService; fields: Record<string, string> }[]
    problems: { service: SealedService; error: string }[]
}

// The keys saved in Connections for this account. One with a missing field is reported for its service, not fatal.
export function fromDashboard(doc: DashboardDoc) {
    const values: DashboardValues = { publicUrl: doc.publicUrl, secrets: {} }
    const problems = [...doc.problems]
    for (const { service, fields } of doc.secrets) {
        try {
            ;(values.secrets as Record<string, unknown>)[service] = checkFields(service, fields)
        } catch (e) {
            problems.push({ service, error: `${e instanceof Error ? e.message : String(e)}; save it again in Connections` })
        }
    }
    return { values, problems }
}
