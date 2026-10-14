import { useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Btn, Field } from './ui'

// Email and password. Signing up creates the account; the workspace is set up on the next screen.
export function SignIn() {
    const { signIn } = useAuthActions()
    const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const signingUp = flow === 'signUp'

    const submit = async () => {
        setError('')
        if (signingUp && password.length < 8) return setError('Use at least 8 characters for your password.')
        setBusy(true)
        try {
            await signIn('password', { email: email.trim(), password, flow })
        } catch {
            setError(signingUp ? 'Could not create the account. If you already have one, sign in instead.' : 'That email and password don’t match an account.')
        }
        setBusy(false)
    }

    return (
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <span className="mb-2 flex items-center gap-2">
                        <img src="/favicon.svg" alt="" className="size-6" />
                        <span className="text-[15px] font-semibold tracking-tight">OpenBots</span>
                    </span>
                    <CardTitle>{signingUp ? 'Create your account' : 'Sign in'}</CardTitle>
                    <CardDescription>{signingUp ? 'Your agents and settings are private to your account. Conversations stay on your own engine; keys are locked so only it can read them.' : 'Welcome back.'}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-3.5"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submit()
                        }}>
                        <Field label="Email">
                            <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                        </Field>
                        <Field label="Password" hint={signingUp ? 'At least 8 characters.' : undefined}>
                            <Input type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                        </Field>
                        {error && (
                            <p role="alert" className="text-destructive text-[13px]">
                                {error}
                            </p>
                        )}
                        <Btn type="submit" variant="primary" className="w-full" disabled={!email.trim() || !password || busy}>
                            {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
                        </Btn>
                    </form>
                    <p className="mt-4 text-center text-[13px] text-neutral-500">
                        {signingUp ? 'Already have an account?' : 'New to OpenBots?'}{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setFlow(signingUp ? 'signIn' : 'signUp')
                                setError('')
                            }}
                            className="cursor-pointer font-medium text-neutral-900 underline-offset-2 hover:underline">
                            {signingUp ? 'Sign in' : 'Create an account'}
                        </button>
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
