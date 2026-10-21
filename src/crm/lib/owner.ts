import type { Doc } from '@convex/_generated/dataModel'
import { ONLINE_MS } from '@convex/lib/owner'

// Whether an engine can text the verification code right now: one is online with a texting channel, and one of your
// numbers is on that channel. Otherwise what's missing, in a line.
export function codeSender(runners: Pick<Doc<'runners'>, 'lastSeenAt' | 'channels'>[], numbers: Pick<Doc<'numbers'>, 'channel'>[], now: number): { ready: true } | { ready: false; why: string } {
    if (!runners.length) return { ready: false, why: 'Add your engine in Connections first: it texts the code.' }
    const online = runners.filter((r) => r.lastSeenAt && now - r.lastSeenAt < ONLINE_MS)
    if (!online.length) return { ready: false, why: 'Your engine is offline, and it’s what texts the code. Start it (see Connections).' }
    const channels = new Set(online.flatMap((r) => r.channels ?? []))
    if (!numbers.some((n) => channels.has(n.channel))) return { ready: false, why: 'Set up texting and add a number in Numbers first: the code is texted from it.' }
    return { ready: true }
}

// How many texts from strangers were ignored today, in a sentence (empty when none)
export const ignoredLine = (n: number) => (n ? `${n} text${n === 1 ? '' : 's'} from people not on your list ${n === 1 ? 'was' : 'were'} ignored today.` : '')
