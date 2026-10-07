import type { SlotId } from './models'

// What one unit of work is for each model slot, and how much of the plan it uses.
// Weights and limits are PLACEHOLDERS until pricing is decided.
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

// Plan allowance in usage credits (count × weight), like Claude Code's session and weekly limits
export const PLAN_CREDITS = { day: 900, week: 5_000 }

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => dayKey(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
