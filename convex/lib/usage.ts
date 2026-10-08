import type { SlotId } from './models'

// What one unit of work is for each model slot, and how many usage credits it costs against your budget
export const SLOT_UNITS: Record<SlotId, { one: string; many: string; weight: number }> = {
    brain: { one: 'reply', many: 'replies', weight: 1 },
    computer: { one: 'action', many: 'actions', weight: 2 },
    voice: { one: 'voice note', many: 'voice notes', weight: 1 },
    listening: { one: 'note heard', many: 'notes heard', weight: 0.5 },
    calls: { one: 'call minute', many: 'call minutes', weight: 3 },
    vision: { one: 'image read', many: 'images read', weight: 1 },
    decisions: { one: 'decision', many: 'decisions', weight: 0.05 },
    router: { one: 'task routed', many: 'tasks routed', weight: 0.05 },
    backup: { one: 'takeover', many: 'takeovers', weight: 1 },
}

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)

export const creditsFor = (slot: string, count: number) => count * (SLOT_UNITS[slot as SlotId]?.weight ?? 1)

// Budget weeks start on Monday (UTC), like the Analytics page
export const weekStart = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
