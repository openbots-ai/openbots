import { authTables } from '@convex-dev/auth/server'
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
    // Where the agent texts handoff alerts (the owner's own phone or Apple ID email)
    ownerHandle: v.optional(v.string()),
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
    // Usage budget in credits (see convex/lib/usage.ts). Agents stop replying once one is used up; unset means no cap.
    dailyBudget: v.optional(v.number()),
    weeklyBudget: v.optional(v.number()),
}

export default defineSchema({
    // users, sessions and accounts for Convex Auth
    ...authTables,
    // ownerId is the only account that can use the dashboard; optional for workspaces made before sign-in existed
    workspace: defineTable({
        name: v.string(),
        ownerName: v.string(),
        ownerId: v.optional(v.id('users')),
        ...workspaceSettings,
        // Left over from before the agent ran on your own machine; migrations:purgeLegacy clears them
        ownerEmail: v.optional(v.string()),
        notifyDigest: v.optional(v.boolean()),
        lastDigestDay: v.optional(v.string()),
    }),
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
    // Agents the owner runs on their own machines. Messages, contacts and provider keys stay there; Convex only
    // ever sees the agent's token hash, its version, which provider keys it has, and the counts below.
    runners: defineTable({
        name: v.string(),
        // SHA-256 of the token, hex. The token itself is made in the owner's browser and never sent here.
        tokenHash: v.string(),
        lastSeenAt: v.optional(v.number()),
        version: v.optional(v.string()),
        transport: v.optional(v.string()),
        // Provider → whether the agent has its key (never the key)
        providers: v.optional(v.record(v.string(), v.boolean())),
        demo: v.optional(v.boolean()),
    }).index('by_tokenHash', ['tokenHash']),
    // Anonymous daily counts per agent for Analytics; no names, numbers or message content
    activity: defineTable({
        agentId: v.id('agents'),
        day: v.string(),
        conversations: v.number(),
        newContacts: v.number(),
        messagesIn: v.number(),
        messagesOut: v.number(),
        handoffs: v.number(),
    })
        .index('by_day', ['day'])
        .index('by_agent_and_day', ['agentId', 'day']),
})
