import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// The server's own secrets. `npm run setup` generates them and stores them on the deployment; nobody types them.
// Message history never reaches Convex: it stays on each user's engine (runner/).
const app = defineApp({
    env: {
        // 32 random bytes, base64. Encrypts the keys people save in Connections. Never change it once set, or the
        // saved keys can't be read and everyone re-enters them.
        ENCRYPTION_KEY: v.optional(v.string()),
        // Convex Auth: the RS256 key pair that signs sign-in tokens
        JWT_PRIVATE_KEY: v.optional(v.string()),
        JWKS: v.optional(v.string()),
    },
})

export default app
