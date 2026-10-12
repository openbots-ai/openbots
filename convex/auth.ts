import { convexAuth } from '@convex-dev/auth/server'
import { Password } from '@convex-dev/auth/providers/Password'

// Email and password sign-in: nothing to pay for and no email service needed
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    providers: [Password],
})
