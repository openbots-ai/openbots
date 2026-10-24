import { SignIn as ClerkSignIn } from '@clerk/react'

// Clerk's own sign-in and sign-up. Signing up creates the account; the workspace is set up on the next screen.
export function SignIn() {
    return (
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
            {/* Back to this exact address after signing in, so a computer's pairing link (?pair=) still opens its approval */}
            <ClerkSignIn routing="hash" withSignUp fallbackRedirectUrl={window.location.href.split("#")[0]} signUpFallbackRedirectUrl={window.location.href.split("#")[0]} />
        </div>
    )
}
