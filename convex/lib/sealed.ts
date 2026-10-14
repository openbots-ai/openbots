// Keys entered in the dashboard are locked in your browser so only your engine can open them; Convex stores the
// locked value and can't read it. Web Crypto only, so the same code runs in the browser, in the engine and in tests.

export const SEALED_SERVICES = ['openai', 'anthropic', 'google', 'xai', 'local', 'twilio', 'sendblue', 'bluebubbles', 'resend'] as const
export type SealedService = (typeof SEALED_SERVICES)[number]

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
}

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const
const VERSION = 's1'
const encode = (text: string) => new TextEncoder().encode(text)

function b64(bytes: ArrayBuffer | Uint8Array) {
    let text = ''
    for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) text += String.fromCharCode(b)
    return btoa(text)
}
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

// An engine's own key pair, made once on first run. Only the public half ever leaves the machine.
export async function newEngineKeys() {
    const pair = await crypto.subtle.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt'])
    return {
        publicKey: b64(await crypto.subtle.exportKey('spki', pair.publicKey)),
        privateKey: b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
    }
}

// A short form of the public key, shown by the engine and in Connections so you can check they match
export async function fingerprint(publicKey: string) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(publicKey)))
    const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 16).match(/.{4}/g)!.join(' ')
}

// Bound to the locked value, so it won't open if moved to another workspace, engine or service
export const sealContext = (workspaceId: string, runnerId: string, service: SealedService) => `${workspaceId}:${runnerId}:${service}`

// A fresh AES-256-GCM key locks the value; the engine's public key locks that key
export async function seal(publicKey: string, context: string, fields: object) {
    const rsa = await crypto.subtle.importKey('spki', unb64(publicKey), RSA, false, ['encrypt'])
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encode(context) }, aes, encode(JSON.stringify(fields)))
    const wrapped = await crypto.subtle.encrypt(RSA, rsa, await crypto.subtle.exportKey('raw', aes))
    return [VERSION, b64(wrapped), b64(iv), b64(body)].join(':')
}

export async function unseal(privateKey: string, context: string, sealed: string): Promise<unknown> {
    const [version, wrapped, iv, body] = sealed.split(':')
    if (version !== VERSION || !wrapped || !iv || !body) throw new Error('Unreadable key')
    const rsa = await crypto.subtle.importKey('pkcs8', unb64(privateKey), RSA, false, ['decrypt'])
    const raw = await crypto.subtle.decrypt(RSA, rsa, unb64(wrapped))
    const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const text = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encode(context) }, aes, unb64(body))
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
