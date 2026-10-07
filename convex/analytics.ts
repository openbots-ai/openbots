import { query } from './_generated/server'
import { DAY, bucketByDay } from './lib/stats'

export const overview = query({
    args: {},
    handler: async (ctx) => {
        const now = Date.now()
        const [agents, contacts, conversations, messages] = await Promise.all([
            ctx.db.query('agents').collect(),
            ctx.db.query('contacts').collect(),
            ctx.db.query('conversations').collect(),
            ctx.db.query('messages').collect(),
        ])
        const recent = messages.filter((m) => m.at >= now - 14 * DAY)
        const agentOf = new Map(conversations.map((c) => [c._id, c.agentId]))
        const perAgent = agents
            .map((a) => ({ agentId: a._id, name: a.name, avatar: a.avatar, hue: a.hue, count: recent.filter((m) => agentOf.get(m.conversationId) === a._id).length }))
            .sort((a, b) => b.count - a.count)
        return {
            agents: agents.length,
            agentsLive: agents.filter((a) => a.status === 'live').length,
            contacts: contacts.length,
            conversations: conversations.length,
            messages7d: messages.filter((m) => m.at >= now - 7 * DAY).length,
            perDay: bucketByDay(recent.map((m) => m.at), 14, now),
            perAgent,
        }
    },
})
