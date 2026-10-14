import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { newEngineKeys } from '../../convex/lib/sealed'

export type EngineKeys = { publicKey: string; privateKey: string }

// This engine's key pair, made on first run and kept next to the history (readable only by you). The dashboard
// locks your keys with the public half; only this file can open them.
export async function loadEngineKeys(dir: string): Promise<EngineKeys> {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const path = join(dir, 'engine-key.json')
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(await newEngineKeys()), { mode: 0o600, flag: 'wx' })
    chmodSync(path, 0o600)
    const keys = JSON.parse(readFileSync(path, 'utf8')) as Partial<EngineKeys>
    if (typeof keys.publicKey !== 'string' || typeof keys.privateKey !== 'string')
        throw new Error(`${path} isn't a valid engine key file. Delete it to make a new one, then enter your keys in Connections again.`)
    return { publicKey: keys.publicKey, privateKey: keys.privateKey }
}
