import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// Only sign-in lives here. AI keys, texting accounts and message history live on each user's agent (runner/),
// never on Convex. `npm run setup` generates these and stores them on the deployment; nobody types them.
const app = defineApp({
    env: {
        // Convex Auth: the RS256 key pair that signs sign-in tokens
        JWT_PRIVATE_KEY: v.optional(v.string()),
        JWKS: v.optional(v.string()),
    },
})

export default app
