import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// Platform settings only: every user brings their own AI keys and texting accounts through the dashboard.
// Set these with `npx convex env set NAME value`.
const app = defineApp({
    env: {
        // 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts the credentials users connect.
        ENCRYPTION_KEY: v.optional(v.string()),
        // Sign-in (Convex Auth): see the README for generating these
        JWT_PRIVATE_KEY: v.optional(v.string()),
        JWKS: v.optional(v.string()),
        SITE_URL: v.optional(v.string()),
    },
})

export default app
