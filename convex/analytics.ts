import { query } from './_generated/server'
import { DAY, bucketByDay, conversationTokens, estimateTokens } from './lib/stats'

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
        const since30 = now - 30 * DAY
        const recent = messages.filter((m) => m.at >= now - 14 * DAY)
        const agentOf = new Map(conversations.map((c) => [c._id, c.agentId]))
        const byConversation = new Map<string, typeof messages>()
        for (const m of messages) byConversation.set(m.conversationId, [...(byConversation.get(m.conversationId) ?? []), m])

        const perAgent = agents
            .map((a) => {
                const promptTokens = estimateTokens(a.prompt)
                let input = 0
                let output = 0
                for (const c of conversations) {
                    if (c.agentId !== a._id) continue
                    const t = conversationTokens(byConversation.get(c._id) ?? [], promptTokens, since30)
                    input += t.input
                    output += t.output
                }
                const mine = messages.filter((m) => agentOf.get(m.conversationId) === a._id)
                return {
                    agentId: a._id,
                    name: a.name,
                    avatar: a.avatar,
                    hue: a.hue,
                    model: a.model,
                    count: mine.filter((m) => m.at >= now - 14 * DAY).length,
                    replies30d: mine.filter((m) => m.from === 'agent' && m.at >= since30).length,
                    input,
                    output,
                }
            })
            .sort((a, b) => b.count - a.count)

        return {
            agents: agents.length,
            agentsLive: agents.filter((a) => a.status === 'live').length,
            contacts: contacts.length,
            conversations: conversations.length,
            messages7d: messages.filter((m) => m.at >= now - 7 * DAY).length,
            messages30d: messages.filter((m) => m.at >= since30).length,
            perDay: bucketByDay(recent.map((m) => m.at), 14, now),
            // Eight weeks of daily activity for the heatmap, oldest first
            activity: bucketByDay(messages.map((m) => m.at), 56, now),
            perAgent,
        }
    },
})
