import { spawn, type ChildProcess } from 'node:child_process'

// A public HTTPS address for the engine's web server without opening any port: Cloudflare's quick tunnel connects out
// and prints an https://….trycloudflare.com address. Used on computers that can't take incoming connections (Orgo).

const ADDRESS = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

// The tunnel's address, if this output has it
export const tunnelAddress = (output: string) => output.match(ADDRESS)?.[0]

type Spawn = (command: string, args: string[]) => ChildProcess

// Starts the tunnel to the local server and calls `onAddress` each time it gets a new address (it changes when the
// tunnel restarts). Restarts it if it stops. Returns a function that stops it for good.
export function startTunnel(bin: string, port: number, onAddress: (url: string) => void, log: (line: string) => void, run: Spawn = (c, a) => spawn(c, a, { stdio: ['ignore', 'pipe', 'pipe'] })) {
    let stopped = false
    let child: ChildProcess | undefined
    let current: string | undefined
    const launch = () => {
        child = run(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`])
        let seen = ''
        const read = (chunk: Buffer | string) => {
            seen = (seen + chunk.toString()).slice(-4000)
            const url = tunnelAddress(seen)
            if (url && url !== current) {
                current = url
                seen = ''
                onAddress(url)
            }
        }
        child.stdout?.on('data', read)
        child.stderr?.on('data', read)
        child.on('error', (e) => log(`Tunnel couldn't start: ${e.message}`))
        child.on('exit', (code) => {
            if (stopped) return
            log(`Tunnel stopped (${code ?? 'signal'}); starting it again`)
            setTimeout(launch, 5_000)
        })
    }
    launch()
    return () => {
        stopped = true
        child?.kill()
    }
}
