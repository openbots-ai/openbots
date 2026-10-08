import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// Everything is optional: the dashboard works without any of it and Settings → Integrations shows what's missing.
// Set them with `npx convex env set NAME value` (or in the Convex dashboard).
const app = defineApp({
    env: {
        // Model providers. An agent replies only when the provider behind its Brain model has a key.
        ANTHROPIC_API_KEY: v.optional(v.string()),
        OPENAI_API_KEY: v.optional(v.string()),
        GEMINI_API_KEY: v.optional(v.string()),
        XAI_API_KEY: v.optional(v.string()),
        // Shared secret your iMessage relay sends as `Authorization: Bearer …` to POST /inbound
        INBOUND_SECRET: v.optional(v.string()),
        // Where agent replies are POSTed for delivery, and the bearer token sent with them
        OUTBOUND_WEBHOOK_URL: v.optional(v.string()),
        OUTBOUND_SECRET: v.optional(v.string()),
        // Emails notifications and the daily digest through Resend, from this address
        RESEND_API_KEY: v.optional(v.string()),
        NOTIFY_FROM_EMAIL: v.optional(v.string()),
        // "true" lets agents without a provider key answer with sample replies, so demos work with no keys
        DEMO_MODE: v.optional(v.string()),
    },
})

export default app
