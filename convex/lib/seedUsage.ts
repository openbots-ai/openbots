import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { NONE, SLOTS, resolveModels, type SlotId } from './models'
import { addDays } from './usage'

// Typical weekday volume per slot for one busy agent; decisions and routing scale with replies
const BASE: Partial<Record<SlotId, number>> = { brain: 12, computer: 28, voice: 2, listening: 1.5, vision: 1.5 }
// Agents whose jobs live in other apps click around a lot more
const HANDS_ON = new Set(['Waffles', 'Penny', 'Pebble', 'Honey'])

// Writes eight weeks of sample usage for these agents, following each agent's model mix
export async function insertSampleUsage(ctx: MutationCtx, agents: Doc<'agents'>[], workspace: Doc<'workspace'> | null, today: string, rand: () => number) {
    for (const agent of agents) {
        const activity = agent.status === 'live' ? 1 : agent.status === 'paused' ? 0.2 : 0
        if (!activity) continue
        const models = resolveModels(workspace?.models, agent.models, agent.model)
        for (let back = 55; back >= 0; back--) {
            const day = addDays(today, -back)
            const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
            // Quieter weekends, and a gentle upward trend so recent weeks look busier
            const scale = activity * (weekday === 0 || weekday === 6 ? 0.35 : 1) * (0.6 + 0.4 * ((55 - back) / 55))
            const noise = () => 0.6 + rand() * 0.8
            const replies = Math.round((BASE.brain ?? 0) * scale * noise())
            const counts: Record<SlotId, number> = {
                brain: replies,
                computer: Math.round((BASE.computer ?? 0) * scale * noise() * (HANDS_ON.has(agent.name) ? 1.6 : 0.5)),
                voice: Math.round((BASE.voice ?? 0) * scale * noise()),
                listening: Math.round((BASE.listening ?? 0) * scale * noise()),
                calls: rand() < 0.12 * activity ? Math.round(4 + rand() * 14) : 0,
                vision: Math.round((BASE.vision ?? 0) * scale * noise()),
                decisions: Math.round(replies * (6 + rand() * 3)),
                router: Math.round(replies * (1 + rand() * 0.3)),
                backup: rand() < 0.03 ? 1 : 0,
            }
            for (const slot of SLOTS) {
                const model = models[slot.id].option.id
                if (counts[slot.id] > 0 && model !== NONE) await ctx.db.insert('usage', { agentId: agent._id, slot: slot.id, model, day, count: counts[slot.id] })
            }
        }
    }
}
