import { env } from '../_generated/server'

// Credentials are encrypted with AES-GCM under ENCRYPTION_KEY (32 random bytes, base64) before they're stored.
// Only actions call these: encryption needs fresh randomness and keys are only ever used for outgoing requests.

const b64 = {
    encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
    decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
}

async function key() {
    const raw = env.ENCRYPTION_KEY
    if (!raw) throw new Error('ENCRYPTION_KEY is not set on this deployment, so credentials cannot be stored safely')
    const bytes = b64.decode(raw)
    if (bytes.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded')
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(value: unknown): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = new TextEncoder().encode(JSON.stringify(value))
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data))
    return `${b64.encode(iv)}.${b64.encode(sealed)}`
}

export async function decrypt<T>(blob: string): Promise<T> {
    const [iv, sealed] = blob.split('.').map(b64.decode)
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(), sealed)
    return JSON.parse(new TextDecoder().decode(data)) as T
}

// An unguessable token for webhook URLs
export function randomToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Shows enough of a key to recognise it: sk-…a1b2
export const mask = (secret: string) => (secret.length > 10 ? `${secret.slice(0, 3)}…${secret.slice(-4)}` : '••••')
