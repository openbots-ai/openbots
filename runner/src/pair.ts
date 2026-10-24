import { ConvexClient } from 'convex/browser'
import { hostname } from 'node:os'
import { api } from '../../convex/_generated/api'
import { hashToken, newToken } from '../../convex/lib/tokens'

// Connects this computer to a workspace without pasting anything: it makes its own token, sends Convex only the
// hash, and shows a code. Whoever approves that code in the dashboard (signed in) adds this computer, and the token
// it made starts working. The token never leaves this computer.

export type Os = 'windows' | 'mac' | 'linux' | 'other'
export type Pairing = { code: string; url: string; expiresAt: number }

// What pairing needs from Convex, behind an interface so tests can fake it
export interface PairLink {
    start(tokenHash: string, name: string, os: Os): Promise<{ code: string; expiresAt: number }>
    // Resolves true once approved, false when the code expires first
    approved(tokenHash: string, expiresAt: number): Promise<boolean>
    close(): Promise<void>
}

export function convexPairLink(convexUrl: string): PairLink {
    const client = new ConvexClient(convexUrl)
    return {
        start: (tokenHash, name, os) => client.mutation(api.pairing.start, { tokenHash, name, os }),
        approved: (tokenHash, expiresAt) =>
            new Promise((resolve) => {
                const finish = (ok: boolean) => {
                    clearTimeout(timer)
                    sub.unsubscribe()
                    resolve(ok)
                }
                const timer = setTimeout(() => finish(false), Math.max(0, expiresAt - Date.now()))
                const sub = client.onUpdate(api.pairing.status, { tokenHash, now: Date.now() }, (status) => {
                    if (status === 'approved') finish(true)
                })
            }),
        close: () => client.close(),
    }
}

// The name the dashboard shows for this computer, e.g. "Sams-MacBook-Air" (OPENBOTS_NAME wins)
export const computerName = (env = process.env.OPENBOTS_NAME) => env?.trim() || hostname().replace(/\.(local|lan|home)$/i, '') || 'My computer'

// Asks to join, shows the code, and waits. A code that expires is replaced with a new one until someone approves.
export async function pair({ link, siteUrl, name, os, show }: { link: PairLink; siteUrl: string; name: string; os: Os; show: (p: Pairing) => void }): Promise<string> {
    for (;;) {
        const token = newToken()
        const tokenHash = await hashToken(token)
        const { code, expiresAt } = await link.start(tokenHash, name, os)
        show({ code, url: `${siteUrl.replace(/\/+$/, '')}/dashboard?pair=${code}`, expiresAt })
        if (await link.approved(tokenHash, expiresAt)) return token
    }
}

// How the engine shows a code in a terminal. The desktop app reads the OPENBOTS_EVENT line instead.
export function printPairing(p: Pairing) {
    if (process.env.OPENBOTS_DESKTOP) console.log(`OPENBOTS_EVENT ${JSON.stringify({ type: 'pair', ...p })}`)
    console.log(
        [
            '',
            'Connect this computer to your OpenBots workspace:',
            `  Open ${p.url}`,
            `  or enter ${p.code} under Connections → Your own computer.`,
            'The code works for 10 minutes; a new one appears after that.',
            '',
        ].join('\n'),
    )
}
