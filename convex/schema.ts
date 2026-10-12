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
    ownerEmail: v.optional(v.string()),
    timezone: v.optional(v.string()),
    defaultAgentId: v.optional(v.id('agents')),
    quietEnabled: v.optional(v.boolean()),
    quietStart: v.optional(v.string()),
    quietEnd: v.optional(v.string()),
    replyDelaySec: v.optional(v.number()),
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

// Accounts a workspace connects, each with its own credentials (encrypted in `secret`, never sent to the browser).
// AI providers write replies; texting channels carry messages; resend emails notifications.
export const connectionProvider = v.union(
    v.literal('openai'),
    v.literal('anthropic'),
    v.literal('google'),
    v.literal('xai'),
    v.literal('twilio'),
    v.literal('sendblue'),
    v.literal('bluebubbles'),
    v.literal('resend'),
)

// Where a number's texts come from and go out through
export const channel = v.union(v.literal('twilio'), v.literal('sendblue'), v.literal('bluebubbles'))

const ws = { workspaceId: v.id('workspace') }

export default defineSchema({
    ...authTables,
    // One per signed-in user
    workspace: defineTable({ userId: v.id('users'), name: v.string(), ownerName: v.string(), ...workspaceSettings, lastDigestDay: v.optional(v.string()) }).index('by_user', ['userId']),
    connections: defineTable({
        ...ws,
        provider: connectionProvider,
        // AES-GCM ciphertext of the provider's credentials (see convex/lib/crypto.ts)
        secret: v.string(),
        // Safe to show: a masked key, the Twilio account name, the BlueBubbles server URL, the sender email
        label: v.string(),
        // Non-secret settings, e.g. { serverUrl } for BlueBubbles or { from } for Resend
        details: v.optional(v.record(v.string(), v.string())),
        // Unguessable path segment for this connection's incoming webhook
        webhookToken: v.string(),
        status: v.union(v.literal('ok'), v.literal('error')),
        error: v.optional(v.string()),
        checkedAt: v.number(),
    })
        .index('by_workspace_and_provider', ['workspaceId', 'provider'])
        .index('by_webhookToken', ['webhookToken']),
    agents: defineTable({ ...ws, ...agentFields, updatedAt: v.number() }).index('by_workspace_and_updatedAt', ['workspaceId', 'updatedAt']),
    numbers: defineTable({
        ...ws,
        handle: v.string(),
        // Digits only for phones, lowercased for emails, so "+1 (415) 555-0101" and "14155550101" match
        key: v.string(),
        kind: v.union(v.literal('phone'), v.literal('email')),
        agentId: v.optional(v.id('agents')),
        channel,
        connectionId: v.id('connections'),
        // The provider's id for the number (Twilio's PN… sid), so it can be reconfigured or released
        externalId: v.optional(v.string()),
    })
        .index('by_workspace_and_key', ['workspaceId', 'key'])
        .index('by_agent', ['agentId'])
        .index('by_connection', ['connectionId']),
    contacts: defineTable({
        ...ws,
        name: v.string(),
        handle: v.string(),
        key: v.string(),
        tags: v.array(v.string()),
        notes: v.string(),
        agentId: v.optional(v.id('agents')),
        lastSeenAt: v.optional(v.number()),
    })
        .index('by_workspace_and_name', ['workspaceId', 'name'])
        .index('by_workspace_and_key', ['workspaceId', 'key'])
        .index('by_agent', ['agentId']),
    conversations: defineTable({
        ...ws,
        // For a group chat, the person who started it; replies go to the whole group
        contactId: v.id('contacts'),
        agentId: v.id('agents'),
        // The number the contact texted, so replies go out from the same one
        numberId: v.optional(v.id('numbers')),
        // Started from the dashboard's Test a text: replies are written but never sent anywhere
        test: v.optional(v.boolean()),
        // Group chats: the channel's id for the thread (BlueBubbles chat guid, Sendblue group_id) and its name
        threadKey: v.optional(v.string()),
        title: v.optional(v.string()),
        lastMessage: v.string(),
        lastAt: v.number(),
        // Set when the agent handed the conversation to you or couldn't reply; cleared when you answer
        needsYou: v.optional(v.boolean()),
        // Why the agent stopped, in plain words (missing API key, agent paused, provider error)
        problem: v.optional(v.string()),
        // True while a reply is scheduled or being written, for the typing indicator
        replying: v.optional(v.boolean()),
    })
        .index('by_workspace_and_lastAt', ['workspaceId', 'lastAt'])
        .index('by_contact_and_agent', ['contactId', 'agentId'])
        .index('by_agent', ['agentId'])
        .index('by_workspace_and_thread', ['workspaceId', 'threadKey'])
        .index('by_workspace_and_needsYou_and_lastAt', ['workspaceId', 'needsYou', 'lastAt']),
    messages: defineTable({
        conversationId: v.id('conversations'),
        from: messageFrom,
        // Contact messages: who sent it (matters in group chats)
        senderId: v.optional(v.id('contacts')),
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
        ...ws,
        agentId: v.id('agents'),
        slot: v.string(),
        model: v.string(),
        day: v.string(),
        count: v.number(),
    })
        .index('by_workspace_and_day', ['workspaceId', 'day'])
        .index('by_agent_and_slot_and_model_and_day', ['agentId', 'slot', 'model', 'day']),
    knowledge: defineTable({
        ...ws,
        title: v.string(),
        body: v.string(),
        agentId: v.optional(v.id('agents')),
        updatedAt: v.number(),
    })
        .index('by_workspace_and_updatedAt', ['workspaceId', 'updatedAt'])
        .index('by_workspace_and_agent', ['workspaceId', 'agentId']),
    // In-app inbox: new contacts, handoffs and the daily digest (also emailed when Resend is connected)
    notifications: defineTable({
        ...ws,
        kind: v.union(v.literal('new_contact'), v.literal('handoff'), v.literal('digest')),
        title: v.string(),
        body: v.string(),
        at: v.number(),
        read: v.boolean(),
        conversationId: v.optional(v.id('conversations')),
    })
        .index('by_workspace_and_at', ['workspaceId', 'at'])
        .index('by_workspace_and_read_and_at', ['workspaceId', 'read', 'at']),
})
