import type { Id } from './_generated/dataModel'
import { mutation } from './_generated/server'
import { handleKind } from './lib/handles'
import { HOUR, MIN, SCRIPTS, SEED_AGENTS, SEED_CONTACTS, SEED_KNOWLEDGE, SEED_NUMBERS, SEED_WORKSPACE, mulberry32 } from './lib/seedData'
import { DAY } from './lib/stats'

// Fills an empty deployment with the mascot team and two weeks of sample activity.
// The workspace row doubles as the "already seeded" marker, so deleting every agent never reseeds.
export const run = mutation({
    args: {},
    handler: async (ctx) => {
        if (await ctx.db.query('workspace').first()) return
        const now = Date.now()
        const rand = mulberry32(7)
        await ctx.db.insert('workspace', SEED_WORKSPACE)

        const agentIds = new Map<string, Id<'agents'>>()
        for (const a of SEED_AGENTS) {
            const avatar = `/avatars/${a.name.toLowerCase()}.webp`
            agentIds.set(a.name, await ctx.db.insert('agents', { ...a, avatar, updatedAt: now - Math.floor(rand() * 10 * DAY) }))
        }

        for (const n of SEED_NUMBERS) {
            await ctx.db.insert('numbers', {
                handle: n.handle,
                kind: handleKind(n.handle) ?? 'phone',
                agentId: n.agent ? agentIds.get(n.agent) : undefined,
            })
        }

        for (const k of SEED_KNOWLEDGE) {
            await ctx.db.insert('knowledge', { title: k.title, body: k.body, agentId: agentIds.get(k.agent), updatedAt: now - Math.floor(rand() * 20 * DAY) })
        }

        const talkers = SEED_AGENTS.filter((a) => SCRIPTS[a.name])
        for (const [i, c] of SEED_CONTACTS.entries()) {
            const agent = talkers[i % talkers.length]
            const agentId = agentIds.get(agent.name)!
            const script = SCRIPTS[agent.name]
            const start = Math.floor(rand() * script.length)
            const pairs = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, k) => script[(start + k) % script.length])
            const msgs = pairs.flatMap(([them, us]) => [
                { from: 'contact' as const, body: them },
                { from: 'agent' as const, body: us },
            ])

            // Newest conversations first; the first few land inside the last day so Live has something to show
            let at = now - Math.floor(i * ((13 * DAY) / SEED_CONTACTS.length) + rand() * 2 * HOUR)
            const times: number[] = []
            for (let k = msgs.length - 1; k >= 0; k--) {
                times[k] = at
                at -= msgs[k].from === 'agent' ? Math.floor((1 + rand() * 3) * MIN) : Math.floor((0.5 + rand() * 5) * HOUR)
            }

            const lastContactAt = times[msgs.length - 2]
            const contactId = await ctx.db.insert('contacts', { name: c.name, handle: c.handle, tags: c.tags, notes: c.notes ?? '', agentId, lastSeenAt: lastContactAt })
            const conversationId = await ctx.db.insert('conversations', { contactId, agentId, lastMessage: msgs[msgs.length - 1].body, lastAt: times[msgs.length - 1] })
            for (const [k, m] of msgs.entries()) await ctx.db.insert('messages', { conversationId, from: m.from, body: m.body, at: times[k] })
        }

        await ctx.db.insert('broadcasts', { title: 'October check-in', body: 'quick one: anything we can help with before the month closes?', agentId: agentIds.get('Marcus')!, tag: 'client', scheduledFor: now + DAY, status: 'scheduled' })
        await ctx.db.insert('broadcasts', { title: 'Intro offer', body: 'hey! we have two onboarding slots left this week, want one?', agentId: agentIds.get('Marcus')!, tag: 'lead', scheduledFor: now - 5 * DAY, status: 'sent' })
    },
})
