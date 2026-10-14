import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// What's here: each user's workspace and settings, their agents, models, knowledge and numbers, the keys they save
// in Connections (encrypted), and anonymous daily counts. What's never here: messages or contacts. Those live on the
// user's own engine (runner/), which reads this configuration and reports back only counts and what it has set up.

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
    // Per-slot model overrides (slot id → "provider:model"); missing slots use the workspace's choice
    models: v.optional(v.record(v.string(), v.string())),
}

// Optional so workspaces created before these settings existed stay valid; the UI fills in defaults
export const workspaceSettings = {
    // Workspace-wide model per slot (slot id → "provider:model"); see convex/lib/models.ts
    models: v.optional(v.record(v.string(), v.string())),
    // Where your engine sends handoff alerts: a text to your own phone, and an email if the engine has Resend set up
    ownerHandle: v.optional(v.string()),
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
    // Usage budget in credits (see convex/lib/usage.ts). Agents stop replying once one is used up; unset means no cap.
    dailyBudget: v.optional(v.number()),
    weeklyBudget: v.optional(v.number()),
}

// Where a number's texts come from and go out through. All of them run on your engine.
//   mac: Messages on the engine's own Mac · relay: a relay you run · twilio / sendblue / bluebubbles: your accounts
export const channel = v.union(v.literal('mac'), v.literal('relay'), v.literal('twilio'), v.literal('sendblue'), v.literal('bluebubbles'))

// The AI providers and other services an agent reports as set up (never their keys)
export const service = v.union(
    v.literal('openai'),
    v.literal('anthropic'),
    v.literal('google'),
    v.literal('xai'),
    v.literal('local'),
    v.literal('twilio'),
    v.literal('sendblue'),
    v.literal('bluebubbles'),
    v.literal('resend'),
)

// A model a connected key can use, as the engine found it
// The services whose keys can be entered in the dashboard (see convex/lib/sealed.ts)
export const sealedService = v.union(
    v.literal('openai'),
    v.literal('anthropic'),
    v.literal('google'),
    v.literal('xai'),
    v.literal('local'),
    v.literal('twilio'),
    v.literal('sendblue'),
    v.literal('bluebubbles'),
    v.literal('resend'),
    v.literal('orgo'),
)
export const keyModel = v.object({ provider: v.string(), id: v.string(), label: v.string() })

// A Twilio number: one for sale, or one already on the account
export const twilioNumber = v.object({
    sid: v.optional(v.string()),
    phoneNumber: v.string(),
    friendlyName: v.string(),
    locality: v.optional(v.string()),
    region: v.optional(v.string()),
})

// Work the dashboard asks the engine to do with credentials only the engine has
export const taskRequest = v.union(
    // Check keys and accounts again now (e.g. after getting access to a new model) instead of at the next 6-hourly check
    v.object({ kind: v.literal('recheck') }),
    v.object({ kind: v.literal('twilioSearch'), country: v.string(), areaCode: v.optional(v.string()) }),
    v.object({ kind: v.literal('twilioOwned') }),
    v.object({ kind: v.literal('twilioBuy'), phoneNumber: v.string(), agentId: v.optional(v.id('agents')) }),
    v.object({ kind: v.literal('twilioUse'), sid: v.string(), phoneNumber: v.string(), agentId: v.optional(v.id('agents')) }),
)

// What the engine sends back: numbers found, or the number now in use
export const taskResult = v.union(v.object({ numbers: v.array(twilioNumber) }), v.object({ phoneNumber: v.string(), sid: v.string() }))

const ws = { workspaceId: v.id('workspace') }

export default defineSchema({
    ...authTables,
    // One per signed-in user
    workspace: defineTable({
        userId: v.id('users'),
        name: v.string(),
        ownerName: v.string(),
        ...workspaceSettings,
        // The computer agents do computer use on unless they pick their own (Models page); set by workspace.setComputer
        computerId: v.optional(v.id('runners')),
        // Left over from before agents ran on your own machine; migrations:purgeLegacy clears these
        notifyDigest: v.optional(v.boolean()),
        lastDigestDay: v.optional(v.string()),
    }).index('by_user', ['userId']),
    // `computerId` overrides the workspace's computer for this agent; set by agents.setComputer, not the edit form
    agents: defineTable({ ...ws, ...agentFields, computerId: v.optional(v.id('runners')), updatedAt: v.number() }).index('by_workspace_and_updatedAt', ['workspaceId', 'updatedAt']),
    numbers: defineTable({
        ...ws,
        handle: v.string(),
        // Digits only for phones, lowercased for emails, so "+1 (415) 555-0101" and "14155550101" match
        key: v.string(),
        kind: v.union(v.literal('phone'), v.literal('email')),
        agentId: v.optional(v.id('agents')),
        channel,
        // The provider's id for the number (Twilio's PN… sid), so the engine can reconfigure it
        externalId: v.optional(v.string()),
    })
        .index('by_workspace_and_key', ['workspaceId', 'key'])
        .index('by_agent', ['agentId']),
    knowledge: defineTable({
        ...ws,
        title: v.string(),
        body: v.string(),
        agentId: v.optional(v.id('agents')),
        updatedAt: v.number(),
    })
        .index('by_workspace_and_updatedAt', ['workspaceId', 'updatedAt'])
        .index('by_workspace_and_agent', ['workspaceId', 'agentId']),
    // Work done per agent, model slot and day; feeds Analytics and the budget. One row per (agent, slot, model, day).
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
    // Anonymous daily counts per agent for Analytics; no names, numbers or message content
    activity: defineTable({
        ...ws,
        agentId: v.id('agents'),
        day: v.string(),
        conversations: v.number(),
        newContacts: v.number(),
        messagesIn: v.number(),
        messagesOut: v.number(),
        handoffs: v.number(),
    })
        .index('by_workspace_and_day', ['workspaceId', 'day'])
        .index('by_agent_and_day', ['agentId', 'day']),
    // The agents you run on your own machines. Convex only ever sees the token's hash, the engine's version, and
    // what it reports as set up: which services, which models its AI keys can use, and which lines it answers on.
    runners: defineTable({
        ...ws,
        name: v.string(),
        // SHA-256 of the token, hex. The token itself is made in your browser and never sent here.
        tokenHash: v.string(),
        lastSeenAt: v.optional(v.number()),
        version: v.optional(v.string()),
        // Set up on the engine; `error` when the provider refused it (e.g. a rejected key)
        services: v.optional(v.array(v.object({ service, label: v.optional(v.string()), error: v.optional(v.string()) }))),
        // The models each AI key can use, newest first per provider
        models: v.optional(v.array(keyModel)),
        // The ways it can text (see `channel`)
        channels: v.optional(v.array(channel)),
        // The addresses its texting channels answer on, to offer when adding a number
        lines: v.optional(v.array(v.object({ channel, handle: v.string(), externalId: v.optional(v.string()) }))),
        demo: v.optional(v.boolean()),
        // Where Twilio, Sendblue or BlueBubbles reach this engine, set in Connections (not secret)
        publicUrl: v.optional(v.string()),
        // The public address of the engine's own tunnel, when it runs one (Orgo computers do)
        tunnelUrl: v.optional(v.string()),
        // The operating system the engine runs on; own Linux computers can't do computer use (see lib/computers.ts)
        os: v.optional(v.union(v.literal('windows'), v.literal('mac'), v.literal('linux'), v.literal('other'))),
        // A computer OpenBots created on the account's Orgo, and how far its setup got
        orgo: v.optional(v.object({ computerId: v.string(), workspaceId: v.string() })),
        setup: v.optional(
            v.object({
                status: v.union(v.literal('creating'), v.literal('installing'), v.literal('ready'), v.literal('failed')),
                step: v.optional(v.string()),
                error: v.optional(v.string()),
            }),
        ),
    })
        .index('by_workspace', ['workspaceId'])
        .index('by_tokenHash', ['tokenHash']),
    // Requests the dashboard queues for the engine (see taskRequest); the engine writes back the result
    tasks: defineTable({
        ...ws,
        request: taskRequest,
        status: v.union(v.literal('pending'), v.literal('done'), v.literal('failed')),
        result: v.optional(taskResult),
        error: v.optional(v.string()),
    }).index('by_workspace_and_status', ['workspaceId', 'status']),
    // Keys saved in Connections, one per account and service, encrypted with the server's ENCRYPTION_KEY
    secrets: defineTable({
        ...ws,
        service: sealedService,
        sealed: v.string(),
        updatedAt: v.number(),
    }).index('by_workspace_and_service', ['workspaceId', 'service']),
})
