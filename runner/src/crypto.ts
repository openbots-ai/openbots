import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Encrypts what the engine stores on disk, so a copied database file is unreadable without the key file next to
// it. The key never leaves this machine: not to Convex, not to the dashboard.
export class Vault {
    private constructor(private key: Buffer) {}

    // Loads <dir>/key, making a new random one (readable only by you) on first run
    static open(dir: string) {
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        const path = join(dir, 'key')
        if (!existsSync(path)) writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' })
        chmodSync(path, 0o600)
        const key = readFileSync(path)
        if (key.length !== 32) throw new Error(`${path} isn't a valid key file. Restore it from a backup; without it the history can't be read.`)
        return new Vault(key)
    }

    static fromKey(key: Buffer) {
        return new Vault(key)
    }

    // AES-256-GCM with a fresh random nonce. `context` (e.g. "message:12") is bound to the ciphertext, so a value
    // copied into another row won't decrypt.
    seal(text: string, context: string) {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', this.key, iv).setAAD(Buffer.from(context))
        const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()])
        return `v1:${iv.toString('base64')}:${body.toString('base64')}`
    }

    open(sealed: string, context: string) {
        const [version, iv, body] = sealed.split(':')
        if (version !== 'v1' || !iv || !body) throw new Error('Unreadable value in the local store')
        const data = Buffer.from(body, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'))
            .setAAD(Buffer.from(context))
            .setAuthTag(data.subarray(data.length - 16))
        return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString('utf8')
    }

    // A stable, keyed fingerprint for lookups (finding a contact by number) without storing the number in clear
    tag(value: string) {
        return createHmac('sha256', this.key).update(value).digest('hex')
    }
}
