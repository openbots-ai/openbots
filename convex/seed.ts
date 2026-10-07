import type { Id } from './_generated/dataModel'
import { internalMutation, mutation } from './_generated/server'
import { v } from 'convex/values'
import { handleKind } from './lib/handles'
import { HOUR, MIN, SCRIPTS, SEED_AGENTS, SEED_CONFIG, SEED_CONTACTS, SEED_KNOWLEDGE, SEED_NUMBERS, SEED_WORKSPACE, mulberry32 } from './lib/seedData'
import { DAY } from './lib/stats'
import { insertSampleUsage } from './lib/seedUsage'
import { dayKey } from './lib/usage'

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
            agentIds.set(a.name, await ctx.db.insert('agents', { ...a, ...SEED_CONFIG[a.name], avatar, updatedAt: now - Math.floor(rand() * 10 * DAY) }))
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

        const agents = await ctx.db.query('agents').take(100)
        await insertSampleUsage(ctx, agents, await ctx.db.query('workspace').first(), dayKey(now), rand)
    },
})

// One-off for deployments seeded before model slots existed: gives the sample agents their model mix and
// writes sample usage. Internal, so only the CLI can run it: npx convex run seed:backfillModels '{"today":"2026-10-07"}'
export const backfillModels = internalMutation({
    args: { today: v.string() },
    handler: async (ctx, { today }) => {
        if (await ctx.db.query('usage').first()) return 'usage already present, nothing to do'
        const agents = await ctx.db.query('agents').take(100)
        for (const agent of agents) {
            const mix = SEED_CONFIG[agent.name]?.models
            if (mix && !agent.models) await ctx.db.patch('agents', agent._id, { models: mix, model: undefined })
        }
        await insertSampleUsage(ctx, await ctx.db.query('agents').take(100), await ctx.db.query('workspace').first(), today, mulberry32(11))
        return `backfilled ${agents.length} agents`
    },
})

// One-off for deployments seeded with the old mascot names: npx convex run seed:renameMascots
export const renameMascots = internalMutation({
    args: {},
    handler: async (ctx) => {
        const renames: Record<string, string> = { Ava: 'Pip', Emily: 'Mochi', Jason: 'Biscuit', Kai: 'Pebble', Leo: 'Penny', Marcus: 'Waffles', Nora: 'Honey', Sam: 'Sprout' }
        let count = 0
        for (const agent of await ctx.db.query('agents').take(100)) {
            const name = renames[agent.name]
            if (!name) continue
            const seed = SEED_AGENTS.find((a) => a.name === name)
            await ctx.db.patch('agents', agent._id, { name, avatar: `/avatars/${name.toLowerCase()}.webp`, greeting: seed?.greeting ?? agent.greeting })
            count++
        }
        return `renamed ${count} agents`
    },
})
