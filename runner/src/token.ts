import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOKEN_PREFIX } from '../../convex/lib/tokens'

// The engine's token unlocks every key saved in Connections, so it isn't typed on the command line (where shell
// history keeps it). The engine asks for it once, with the input hidden, and keeps it in a file only you can read.
// OPENBOTS_TOKEN still wins when set, for Docker, Orgo or a .env file.

export const tokenFile = (dataDir: string) => join(dataDir, 'token')

export type TokenSource = 'env' | 'file' | 'typed'

export type Ask = (question: string) => Promise<string>

const valid = (token: string) => token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length + 20

export function saveToken(dataDir: string, token: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    const path = tokenFile(dataDir)
    writeFileSync(path, `${token}\n`, { mode: 0o600 })
    // An existing file keeps its old mode on write
    chmodSync(path, 0o600)
}

// Asks until a token that looks right is pasted, then saves it
export async function askForToken(dataDir: string, ask: Ask, question = `Paste this computer's token from Connections (it starts with ${TOKEN_PREFIX}; it won't show as you paste): `) {
    for (;;) {
        const token = (await ask(question)).trim()
        if (valid(token)) {
            saveToken(dataDir, token)
            return token
        }
        question = `That doesn't look like a token. It starts with ${TOKEN_PREFIX} and is shown once in Connections: `
    }
}

// The token from OPENBOTS_TOKEN, else the saved file, else asked for (when someone is at the terminal)
export async function findToken({ envToken, dataDir, ask }: { envToken?: string; dataDir: string; ask?: Ask }): Promise<{ token: string; source: TokenSource }> {
    if (envToken) return { token: envToken, source: 'env' }
    const path = tokenFile(dataDir)
    const saved = existsSync(path) ? readFileSync(path, 'utf8').trim() : ''
    if (saved) return { token: saved, source: 'file' }
    if (!ask) throw new Error(`No token yet. Start the engine in a terminal so it can ask for one, or set OPENBOTS_TOKEN (see runner/README.md)`)
    return { token: await askForToken(dataDir, ask), source: 'typed' }
}

// Reads a line from the terminal without echoing it. Undefined when there's no terminal to ask at.
export function hiddenPrompt(): Ask | undefined {
    const { stdin, stdout } = process
    if (!stdin.isTTY || !stdout.isTTY) return undefined
    return (question) =>
        new Promise((resolve) => {
            stdout.write(question)
            stdin.setRawMode(true)
            stdin.setEncoding('utf8')
            stdin.resume()
            let value = ''
            const done = () => {
                stdin.off('data', onData)
                stdin.setRawMode(false)
                stdin.pause()
                stdout.write('\n')
                resolve(value)
            }
            const onData = (chunk: string) => {
                for (const ch of chunk) {
                    if (ch === '\r' || ch === '\n') return done()
                    // Ctrl+C
                    if (ch === '\u0003') {
                        stdout.write('\n')
                        process.exit(130)
                    }
                    if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
                    else if (ch >= ' ') value += ch
                }
            }
            stdin.on('data', onData)
        })
}
