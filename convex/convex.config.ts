import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// Only sign-in lives here. AI keys, texting accounts and message history live on each user's agent (runner/),
// never on Convex. Set these with `npx convex env set "NAME=value"` (or in the Convex dashboard).
const app = defineApp({
    env: {
        // Convex Auth: the key pair that signs sign-in tokens, and the dashboard's URL (e.g. http://localhost:5173)
        JWT_PRIVATE_KEY: v.optional(v.string()),
        JWKS: v.optional(v.string()),
        SITE_URL: v.optional(v.string()),
    },
})

export default app
