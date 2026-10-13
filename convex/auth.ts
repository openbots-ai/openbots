import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

// Email + password sign-in for the dashboard. Anyone can make an account; only the workspace owner gets in (see lib/auth.ts).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    providers: [Password],
})
