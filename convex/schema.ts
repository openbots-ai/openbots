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
}

// Optional so workspaces created before these settings existed stay valid; the UI fills in defaults
export const workspaceSettings = {
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
}

export default defineSchema({
    workspace: defineTable({ name: v.string(), ownerName: v.string(), ...workspaceSettings }),
    agents: defineTable({ ...agentFields, updatedAt: v.number() }),
    numbers: defineTable({
        handle: v.string(),
        kind: v.union(v.literal('phone'), v.literal('email')),
        agentId: v.optional(v.id('agents')),
    }),
    contacts: defineTable({
        name: v.string(),
        handle: v.string(),
        tags: v.array(v.string()),
        notes: v.string(),
        agentId: v.optional(v.id('agents')),
        lastSeenAt: v.optional(v.number()),
    }),
    conversations: defineTable({
        contactId: v.id('contacts'),
        agentId: v.id('agents'),
        lastMessage: v.string(),
        lastAt: v.number(),
    }).index('by_lastAt', ['lastAt']),
    messages: defineTable({
        conversationId: v.id('conversations'),
        from: v.union(v.literal('contact'), v.literal('agent')),
        body: v.string(),
        at: v.number(),
    }).index('by_conversation', ['conversationId', 'at']),
    knowledge: defineTable({
        title: v.string(),
        body: v.string(),
        agentId: v.optional(v.id('agents')),
        updatedAt: v.number(),
    }),
})
