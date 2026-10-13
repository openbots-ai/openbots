import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

// Email and password sign-in: nothing to pay for and no email service needed. Each account gets its own workspace.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    providers: [Password],
})
