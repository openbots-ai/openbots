import type { SlotId } from './models'

// What one unit of work is for each model slot, and how many usage credits it costs against your budget
export const SLOT_UNITS: Record<SlotId, { one: string; many: string; weight: number }> = {
    brain: { one: 'reply', many: 'replies', weight: 1 },
    computer: { one: 'step', many: 'steps', weight: 2 },
    voice: { one: 'voice note', many: 'voice notes', weight: 1 },
    listening: { one: 'note heard', many: 'notes heard', weight: 0.5 },
    calls: { one: 'call minute', many: 'call minutes', weight: 3 },
    vision: { one: 'image read', many: 'images read', weight: 1 },
    decisions: { one: 'decision', many: 'decisions', weight: 0.05 },
    router: { one: 'task routed', many: 'tasks routed', weight: 0.05 },
    backup: { one: 'takeover', many: 'takeovers', weight: 1 },
}

// The daily cap a workspace has until you set your own, so texts from strangers can't run up an open-ended bill.
// About this many replies a day; raise it in Settings → Usage budget.
export const DEFAULT_DAILY_BUDGET = 200

// The most replies an agent sends one person in an hour until you set your own (your own chats have no limit).
// Past it the agent stops replying to them and tells you once.
export const DEFAULT_CONTACT_REPLIES_PER_HOUR = 20

// At most this many new-contact alerts an hour; the next one says more are coming and the rest wait for the hour
export const NEW_CONTACT_ALERTS_PER_HOUR = 3

// A workspace's settings as the dashboard and engine read them: a limit you haven't set is the default one
export const withDefaults = <W extends { dailyBudget?: number; contactRepliesPerHour?: number }>(ws: W): W & { dailyBudget: number; contactRepliesPerHour: number } => ({
    ...ws,
    dailyBudget: ws.dailyBudget ?? DEFAULT_DAILY_BUDGET,
    contactRepliesPerHour: ws.contactRepliesPerHour ?? DEFAULT_CONTACT_REPLIES_PER_HOUR,
})

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)

export const creditsFor = (slot: string, count: number) => count * (SLOT_UNITS[slot as SlotId]?.weight ?? 1)

// Budget weeks start on Monday (UTC), like the Analytics page
export const weekStart = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
