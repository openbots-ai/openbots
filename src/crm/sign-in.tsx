import { useEffect, useState, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Onboarding } from './onboarding'
import { Btn, Field } from './ui'

// Shows the dashboard only to the workspace owner; everyone else gets sign-in, setup or a polite no
export function AuthGate({ children }: { children: ReactNode }) {
    return (
        <>
            <AuthLoading>{null}</AuthLoading>
            <Unauthenticated>
                <SignIn />
            </Unauthenticated>
            <Authenticated>
                <Access>{children}</Access>
            </Authenticated>
        </>
    )
}

function Access({ children }: { children: ReactNode }) {
    const access = useQuery(api.workspace.access)
    const claim = useMutation(api.workspace.claim)

    // A workspace from before sign-in existed goes to the first account that signs in.
    // If someone else got there first, access flips to 'denied' on its own.
    useEffect(() => {
        if (access === 'unclaimed') claim().catch(() => {})
    }, [access, claim])

    if (access === 'setup') return <Onboarding />
    if (access === 'denied') return <Denied />
    if (access === 'owner') return children
    return null
}

function Screen({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return (
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <span className="mb-2 flex items-center gap-2">
                        <img src="/favicon.svg" alt="" className="size-6" />
                        <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
                    </span>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </div>
    )
}

function Denied() {
    const { signOut } = useAuthActions()
    return (
        <Screen title="This workspace isn't yours" description="It belongs to another account. Sign in with the owner's email to open it.">
            <Btn variant="primary" className="w-full" onClick={() => void signOut()}>
                Use another account
            </Btn>
        </Screen>
    )
}

// Convex Auth's Password provider throws codes, not sentences
function friendly(e: unknown, flow: 'signIn' | 'signUp') {
    const msg = e instanceof Error ? e.message : String(e)
    if (/InvalidSecret|InvalidAccountId/.test(msg)) return flow === 'signIn' ? 'Wrong email or password' : 'Could not create that account'
    if (/already exists/.test(msg)) return 'That email already has an account. Sign in instead.'
    if (/Invalid password/.test(msg)) return 'Use at least 8 characters for your password'
    return 'Something went wrong. Try again.'
}

function SignIn() {
    const { signIn } = useAuthActions()
    const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const signingUp = flow === 'signUp'

    const submit = async () => {
        setBusy(true)
        setError('')
        try {
            await signIn('password', { email: email.trim(), password, flow })
        } catch (e) {
            setError(friendly(e, flow))
            setBusy(false)
        }
    }

    return (
        <Screen
            title={signingUp ? 'Create your account' : 'Sign in'}
            description={signingUp ? 'The first account to set up the workspace owns it.' : 'Sign in to manage your agents and conversations.'}
        >
            <form
                className="space-y-3.5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <Field label="Email">
                    <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Password" hint={error || (signingUp ? 'At least 8 characters' : undefined)} error={!!error}>
                    <Input type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Btn type="submit" variant="primary" className="w-full" disabled={!email.trim() || !password || busy}>
                    {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
                </Btn>
                <p className="text-center text-[13px] text-neutral-500">
                    {signingUp ? 'Already have an account?' : 'New here?'}{' '}
                    <button
                        type="button"
                        className="font-medium text-neutral-900 underline-offset-2 hover:underline"
                        onClick={() => {
                            setFlow(signingUp ? 'signIn' : 'signUp')
                            setError('')
                        }}
                    >
                        {signingUp ? 'Sign in' : 'Create an account'}
                    </button>
                </p>
            </form>
        </Screen>
    )
}
