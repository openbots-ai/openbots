import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// The server's own settings. `npm run setup` stores them on the deployment, so none go in a file.
// Message history never reaches Convex: it stays on each user's engine (runner/).
const app = defineApp({
    env: {
        // 32 random bytes, base64. Encrypts the keys people save in Connections. Never change it once set, or the
        // saved keys can't be read and everyone re-enters them.
        ENCRYPTION_KEY: v.optional(v.string()),
        // Clerk's Frontend API URL (Clerk dashboard → Configure → API keys), e.g. https://your-app.clerk.accounts.dev
        CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    },
})

export default app
