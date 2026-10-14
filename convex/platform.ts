import { env, query } from './_generated/server'

// Whether this deployment has its own secrets (set by `npm run setup`). Says only which are missing, never their
// values, so the dashboard can explain the problem instead of failing at sign-in.
export const status = query({
    args: {},
    handler: async () => {
        const missing = !(env.JWT_PRIVATE_KEY && env.JWKS) ? ['sign-in keys'] : []
        return { ready: missing.length === 0, missing }
    },
})
