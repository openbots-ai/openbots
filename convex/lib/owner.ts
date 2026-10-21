import type { Doc } from '../_generated/dataModel'
import { handleKey } from './handles'
import { hashToken } from './tokens'

// Your phone counts only once you've typed the code texted to it. Until then agents answer nobody (not even you),
// and send it no handoffs, alerts or check-ins.

// A code is good for this long after it's sent, for this many tries
export const CODE_TTL_MS = 10 * 60_000
export const CODE_ATTEMPTS = 5
// At most this many codes an hour, so the button can't be used to text a number over and over
export const CODE_SENDS_PER_HOUR = 3
export const HOUR_MS = 60 * 60_000
// An engine counts as online if it checked in this recently (it does every minute)
export const ONLINE_MS = 3 * 60_000

// The channels that can text an Apple ID email: iMessage from a Mac (Messages, a relay, or BlueBubbles). Twilio is SMS
// only and Sendblue sends to phone numbers.
export const EMAIL_CHANNELS: Doc<'numbers'>['channel'][] = ['mac', 'relay', 'bluebubbles']

// How many ignored strangers' numbers Convex keeps per workspace, for "Allow"
export const IGNORED_KEPT = 10

// The most people on one workspace's Allowed people list
export const MAX_ALLOWED = 500

type Owner = { ownerHandle?: string; ownerVerifiedAt?: number; ownerVerifiedKey?: string }

// Your phone as the engine may use it: only when verified, and only while it's still the number that was verified
export function verifiedOwner(ws: Owner): string | undefined {
    if (!ws.ownerHandle || !ws.ownerVerifiedAt || !ws.ownerVerifiedKey) return undefined
    return handleKey(ws.ownerHandle) === ws.ownerVerifiedKey ? ws.ownerHandle : undefined
}

// The code's hash, salted with the task that sent it so the same code on another request doesn't match
export const codeHash = (taskId: string, code: string) => hashToken(`openbots-owner-code:${taskId}:${code}`)

export const codeText = (code: string) => `Your OpenBots code is ${code}. If you didn't ask for this, ignore it.`

// What the dashboard and engine call a code that's six digits once spaces and dashes are gone
export const cleanCode = (raw: string) => raw.replace(/[\s-]/g, '')
export const CODE = /^\d{6}$/
