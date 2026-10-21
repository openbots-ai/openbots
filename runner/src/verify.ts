import { randomInt } from 'node:crypto'
import { handleKey, handleKind } from '../../convex/lib/handles'
import { codeHash, codeText, EMAIL_CHANNELS } from '../../convex/lib/owner'
import type { Config } from './pipeline'
import type { Channel, Transport } from './transports/types'

// Texts a fresh 6-digit code to the phone you entered in Settings, from one of your numbers whose channel runs here,
// and returns only the code's hash for Convex (convex/workspace.ts:confirmOwnerCode checks what you type against it).
// The code itself is never logged, stored or sent anywhere but that text.
export async function sendOwnerCode(opts: { taskId: string; to: string; config: Config | null; transports: Partial<Record<Channel, Transport>>; code?: string }) {
    const { taskId, config, transports } = opts
    const kind = handleKind(opts.to)
    const key = handleKey(opts.to)
    if (!config) throw new Error('Not connected to your workspace yet')
    if (!kind || !key) throw new Error('That isn’t a phone number or email')
    // Twilio and Sendblue need a full international number; iMessage takes an email as it is
    const to = kind === 'phone' ? `+${key}` : opts.to.trim()
    const number = config.numbers.find((n) => transports[n.channel] && (kind === 'phone' || EMAIL_CHANNELS.includes(n.channel)))
    if (!number) throw new Error(kind === 'email' ? 'Only iMessage from a Mac (Messages, a relay or BlueBubbles) can text an Apple ID email, and none runs on this engine' : 'None of your numbers has a texting channel running on this engine')
    const code = opts.code ?? String(randomInt(0, 1_000_000)).padStart(6, '0')
    await transports[number.channel]!.send({ from: number.handle, to, body: codeText(code) })
    return codeHash(taskId, code)
}
