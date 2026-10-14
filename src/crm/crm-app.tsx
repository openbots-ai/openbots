import { useEffect, type ReactNode } from 'react'
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { Shell } from './shell'
import { SignIn } from './sign-in'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const client = url ? new ConvexReactClient(url) : null

export default function CrmApp() {
    // Belt and braces with the X-Robots-Tag header in vercel.json
    useEffect(() => {
        const meta = document.createElement('meta')
        meta.name = 'robots'
        meta.content = 'noindex, nofollow'
        document.head.append(meta)
        document.title = 'OpenBots CRM'
        return () => meta.remove()
    }, [])

    if (!client) {
        return (
            <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
                <Card className="max-w-md">
                    <CardHeader>
                        <CardTitle>Connect Convex</CardTitle>
                        <CardDescription>The CRM needs a Convex deployment to talk to.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-[14px] text-neutral-600">
                        <code className="rounded bg-neutral-100 px-1">VITE_CONVEX_URL</code> isn't set. Run <code className="rounded bg-neutral-100 px-1">npx convex dev</code> locally (it writes
                        .env.local), or add the variable in Vercel and redeploy.
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <ConvexAuthProvider client={client}>
            <TooltipProvider>
                <Ready>
                    <AuthLoading>
                        <div className="min-h-dvh bg-[#f5f5f7]" />
                    </AuthLoading>
                    <Unauthenticated>
                        <SignIn />
                    </Unauthenticated>
                    <Authenticated>
                        <Shell />
                    </Authenticated>
                </Ready>
                <Toaster position="bottom-right" />
            </TooltipProvider>
        </ConvexAuthProvider>
    )
}

// Holds the app back until the server has its own secrets, so a fresh deployment explains itself instead of
// failing at sign-in
function Ready({ children }: { children: ReactNode }) {
    const status = useQuery(api.platform.status)
    if (!status) return <div className="min-h-dvh bg-[#f5f5f7]" />
    if (status.ready) return children
    return (
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7] p-6">
            <Card className="max-w-md">
                <CardHeader>
                    <CardTitle>Finish setting up this server</CardTitle>
                    <CardDescription>It's missing {status.missing.join(' and ')}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-[14px] text-neutral-600">
                    <p>
                        Whoever hosts OpenBots runs <code className="rounded bg-neutral-100 px-1">npm run setup</code> once (add{' '}
                        <code className="rounded bg-neutral-100 px-1">-- --prod</code> for production). It generates the server's secrets and stores them on the
                        Convex deployment, then this page signs you in.
                    </p>
                    <p>Your own AI keys and texting accounts aren't set here: you add them under Connections, where they're locked so only your engine can read them.</p>
                </CardContent>
            </Card>
        </div>
    )
}
