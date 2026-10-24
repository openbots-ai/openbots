import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The engine's token unlocks every key saved in Connections, so it's never typed or pasted: the engine makes it
// itself while pairing (pair.ts) and keeps it in a file only you can read. OPENBOTS_TOKEN still wins when set, for
// Docker, Orgo or a .env file.

export const tokenFile = (dataDir: string) => join(dataDir, 'token')

export type TokenSource = 'env' | 'file' | 'paired'

export function saveToken(dataDir: string, token: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    const path = tokenFile(dataDir)
    writeFileSync(path, `${token}\n`, { mode: 0o600 })
    // An existing file keeps its old mode on write
    chmodSync(path, 0o600)
}

// The token from OPENBOTS_TOKEN, else the saved file, else a new one from pairing (saved for next time)
export async function findToken({ envToken, dataDir, pair }: { envToken?: string; dataDir: string; pair: () => Promise<string> }): Promise<{ token: string; source: TokenSource }> {
    if (envToken) return { token: envToken, source: 'env' }
    const path = tokenFile(dataDir)
    const saved = existsSync(path) ? readFileSync(path, 'utf8').trim() : ''
    if (saved) return { token: saved, source: 'file' }
    const token = await pair()
    saveToken(dataDir, token)
    return { token, source: 'paired' }
}
