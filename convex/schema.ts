import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const agentStatus = v.union(v.literal('draft'), v.literal('live'), v.literal('paused'))

export const agentFields = {
    name: v.string(),
    role: v.string(),
    avatar: v.optional(v.string()),
    hue: v.number(),
    prompt: v.string(),
    greeting: v.string(),
    status: agentStatus,
    folder: v.optional(v.string()),
    // Model and voice settings; optional so agents made before they existed stay valid (the UI shows defaults)
    model: v.optional(v.string()),
    voice: v.optional(v.string()),
    language: v.optional(v.string()),
    temperature: v.optional(v.number()),
    replyLength: v.optional(v.union(v.literal('short'), v.literal('medium'), v.literal('long'))),
    // Per-slot model overrides (slot id → model id); missing slots use the workspace's choice
    models: v.optional(v.record(v.string(), v.string())),
}

// Optional so workspaces created before these settings existed stay valid; the UI fills in defaults
export const workspaceSettings = {
    // Workspace-wide model per slot (slot id → model id); see convex/lib/models.ts
    models: v.optional(v.record(v.string(), v.string())),
    ownerEmail: v.optional(v.string()),
    timezone: v.optional(v.string()),
    defaultAgentId: v.optional(v.id('agents')),
    quietEnabled: v.optional(v.boolean()),
    quietStart: v.optional(v.string()),
    quietEnd: v.optional(v.string()),
    replyDelaySec: v.optional(v.number()),
    typingIndicator: v.optional(v.boolean()),
    readReceipts: v.optional(v.boolean()),
    newContactTag: v.optional(v.string()),
    notifyNewContact: v.optional(v.boolean()),
    notifyHandoff: v.optional(v.boolean()),
    notifyDigest: v.optional(v.boolean()),
    // Usage budget in credits (see convex/lib/usage.ts). Agents stop replying once one is used up; unset means no cap.
    dailyBudget: v.optional(v.number()),
    weeklyBudget: v.optional(v.number()),
}

export const messageFrom = v.union(v.literal('contact'), v.literal('agent'))

// What happened to an agent message on its way out: queued for the relay, accepted by it, or failed.
// Messages written before delivery existed have none.
export const deliveryStatus = v.union(v.literal('queued'), v.literal('sent'), v.literal('failed'))

export default defineSchema({
    workspace: defineTable({ name: v.string(), ownerName: v.string(), ...workspaceSettings, lastDigestDay: v.optional(v.string()) }),
    agents: defineTable({ ...agentFields, updatedAt: v.number() }).index('by_updatedAt', ['updatedAt']),
    numbers: defineTable({
        handle: v.string(),
        // Digits only for phones, lowercased for emails, so "+1 (415) 555-0101" and "14155550101" match
        key: v.optional(v.string()),
        kind: v.union(v.literal('phone'), v.literal('email')),
        agentId: v.optional(v.id('agents')),
    })
        .index('by_key', ['key'])
        .index('by_agent', ['agentId']),
    contacts: defineTable({
        name: v.string(),
        handle: v.string(),
        key: v.optional(v.string()),
        tags: v.array(v.string()),
        notes: v.string(),
        agentId: v.optional(v.id('agents')),
        lastSeenAt: v.optional(v.number()),
    })
        .index('by_name', ['name'])
        .index('by_key', ['key'])
        .index('by_agent', ['agentId']),
    conversations: defineTable({
        contactId: v.id('contacts'),
        agentId: v.id('agents'),
        // The iMessage number the contact texted, so replies go out from the same one
        numberId: v.optional(v.id('numbers')),
        lastMessage: v.string(),
        lastAt: v.number(),
        // Set when the agent handed the conversation to you or couldn't reply; cleared when you answer
        needsYou: v.optional(v.boolean()),
        // Why the agent stopped, in plain words (missing API key, agent paused, provider error)
        problem: v.optional(v.string()),
        // True while a reply is scheduled or being written, for the typing indicator
        replying: v.optional(v.boolean()),
    })
        .index('by_lastAt', ['lastAt'])
        .index('by_contact_and_agent', ['contactId', 'agentId'])
        .index('by_agent', ['agentId'])
        .index('by_needsYou_and_lastAt', ['needsYou', 'lastAt']),
    messages: defineTable({
        conversationId: v.id('conversations'),
        from: messageFrom,
        body: v.string(),
        at: v.number(),
        // Agent messages only: who wrote it (the model, or you from the dashboard) and which model
        by: v.optional(v.union(v.literal('ai'), v.literal('you'))),
        model: v.optional(v.string()),
        delivery: v.optional(deliveryStatus),
        deliveryError: v.optional(v.string()),
    }).index('by_conversation', ['conversationId', 'at']),
    // Work done per agent, model slot and day; feeds Analytics. One row per (agent, slot, model, day).
    usage: defineTable({
        agentId: v.id('agents'),
        slot: v.string(),
        model: v.string(),
        day: v.string(),
        count: v.number(),
    })
        .index('by_day', ['day'])
        .index('by_agent_and_slot_and_model_and_day', ['agentId', 'slot', 'model', 'day']),
    knowledge: defineTable({
        title: v.string(),
        body: v.string(),
        agentId: v.optional(v.id('agents')),
        updatedAt: v.number(),
    })
        .index('by_updatedAt', ['updatedAt'])
        .index('by_agent', ['agentId']),
    // In-app inbox: new contacts, handoffs and the daily digest (also emailed when email is set up)
    notifications: defineTable({
        kind: v.union(v.literal('new_contact'), v.literal('handoff'), v.literal('digest')),
        title: v.string(),
        body: v.string(),
        at: v.number(),
        read: v.boolean(),
        conversationId: v.optional(v.id('conversations')),
    })
        .index('by_at', ['at'])
        .index('by_read_and_at', ['read', 'at']),
})
