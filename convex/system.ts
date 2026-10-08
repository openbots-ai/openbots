import { query } from './_generated/server'
import { env } from './_generated/server'
import { demoMode, PROVIDER_KEYS } from './lib/llm'

// Which integrations are set up on this deployment, for Settings → Integrations. Never returns secret values.
export const status = query({
    args: {},
    handler: async () => ({
        inboundUrl: `${env.CONVEX_SITE_URL}/inbound`,
        inboundSecret: !!env.INBOUND_SECRET,
        outbound: !!env.OUTBOUND_WEBHOOK_URL,
        email: !!(env.RESEND_API_KEY && env.NOTIFY_FROM_EMAIL),
        demo: demoMode(),
        providers: Object.fromEntries(Object.entries(PROVIDER_KEYS).map(([provider, key]) => [provider, { key, set: !!env[key] }])) as Record<string, { key: string; set: boolean }>,
    }),
})
