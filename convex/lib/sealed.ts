// Keys entered in the dashboard belong to your account. The backend encrypts them with its own ENCRYPTION_KEY before
// storing them and decrypts them only to hand them to your engine. Web Crypto only, so it runs in Convex and in tests.

export const SEALED_SERVICES = ['openai', 'anthropic', 'google', 'xai', 'local', 'twilio', 'sendblue', 'bluebubbles', 'resend', 'orgo'] as const
export type SealedService = (typeof SEALED_SERVICES)[number]
// Used by the backend itself (to create computers), never handed to engines
export const BACKEND_ONLY: readonly SealedService[] = ['orgo']

export type SecretFields = {
    openai: { apiKey: string }
    anthropic: { apiKey: string }
    google: { apiKey: string }
    xai: { apiKey: string }
    local: { url: string; key?: string }
    twilio: { accountSid: string; authToken: string }
    sendblue: { keyId: string; secret: string }
    bluebubbles: { serverUrl: string; password: string }
    resend: { apiKey: string; from: string }
    orgo: { apiKey: string }
}

export type Field = { name: string; label: string; secret: boolean; optional?: boolean; placeholder?: string }

const apiKey = (placeholder: string): Field[] => [{ name: 'apiKey', label: 'API key', secret: true, placeholder }]

// What each service asks for, in form order
export const FIELDS: Record<SealedService, Field[]> = {
    openai: apiKey('sk-...'),
    anthropic: apiKey('sk-ant-...'),
    google: apiKey('AIza...'),
    xai: apiKey('xai-...'),
    local: [
        { name: 'url', label: 'Server URL', secret: false, placeholder: 'http://localhost:11434/v1' },
        { name: 'key', label: 'Key', secret: true, optional: true },
    ],
    twilio: [
        { name: 'accountSid', label: 'Account SID', secret: false, placeholder: 'AC...' },
        { name: 'authToken', label: 'Auth token', secret: true },
    ],
    sendblue: [
        { name: 'keyId', label: 'API key ID', secret: false },
        { name: 'secret', label: 'API secret', secret: true },
    ],
    bluebubbles: [
        { name: 'serverUrl', label: 'Server URL', secret: false, placeholder: 'https://your-mac.example.com' },
        { name: 'password', label: 'Password', secret: true },
    ],
    resend: [
        { name: 'apiKey', label: 'API key', secret: true, placeholder: 're_...' },
        { name: 'from', label: 'From address', secret: false, placeholder: 'alerts@yourdomain.com' },
    ],
    orgo: apiKey('from orgo.ai'),
}

const VERSION = 'k1'
const encode = (text: string) => new TextEncoder().encode(text)

function b64(bytes: ArrayBuffer | Uint8Array) {
    let text = ''
    for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) text += String.fromCharCode(b)
    return btoa(text)
}
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function aesKey(encryptionKey: string) {
    const raw = unb64(encryptionKey)
    if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64. Run `npm run setup`.')
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// Bound to the encrypted value, so it won't decrypt if moved to another workspace or service
export const secretContext = (workspaceId: string, service: SealedService) => `${workspaceId}:${service}`

// AES-256-GCM with a fresh random nonce
export async function encryptSecret(encryptionKey: string, context: string, fields: object) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(context) }, await aesKey(encryptionKey), encode(JSON.stringify(fields)))
    return [VERSION, b64(iv), b64(body)].join(':')
}

export async function decryptSecret(encryptionKey: string, context: string, sealed: string): Promise<unknown> {
    const [version, iv, body, ...extra] = sealed.split(':')
    if (version !== VERSION || !iv || !body || extra.length) throw new Error('Unreadable key')
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encode(context) }, await aesKey(encryptionKey), unb64(body))
    return JSON.parse(new TextDecoder().decode(text))
}

// The fields a service needs, trimmed; empty optional fields are left out
export function checkFields<S extends SealedService>(service: S, value: unknown): SecretFields[S] {
    if (!value || typeof value !== 'object') throw new Error('Unreadable key')
    const out: Record<string, string> = {}
    for (const field of FIELDS[service]) {
        const v = (value as Record<string, unknown>)[field.name]
        if (typeof v === 'string' && v.trim()) out[field.name] = v.trim()
        else if (!field.optional) throw new Error(`${field.label} is missing`)
    }
    return out as SecretFields[S]
}
