import { env, query } from './_generated/server'

// Whether this deployment has its own secrets (stored by `npm run setup`). Says only which are missing, never their
// values, so the dashboard can explain the problem instead of failing at sign-in.
export const status = query({
    args: {},
    handler: async () => {
        const missing = [!env.ENCRYPTION_KEY && 'ENCRYPTION_KEY', !env.CLERK_JWT_ISSUER_DOMAIN && 'CLERK_JWT_ISSUER_DOMAIN'].filter((m): m is string => !!m)
        return { ready: missing.length === 0, missing }
    },
})
