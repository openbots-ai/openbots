import { defineApp } from 'convex/server'
import { v } from 'convex/values'

// The server's own secrets, the same for every account. `npm run setup` generates and stores them on the
// deployment; nobody types them or keeps them in a file. Every user's AI keys and texting accounts are added in
// the dashboard (Connections) and stored encrypted with ENCRYPTION_KEY.
const app = defineApp({
    env: {
        // 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts the credentials users connect.
        ENCRYPTION_KEY: v.optional(v.string()),
        // Sign-in (Convex Auth): an RS256 key pair
        JWT_PRIVATE_KEY: v.optional(v.string()),
        JWKS: v.optional(v.string()),
    },
})

export default app
