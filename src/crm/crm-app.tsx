import { useEffect } from 'react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { Shell } from './shell'
import { AuthGate } from './sign-in'
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
                <AuthGate>
                    <Shell />
                </AuthGate>
                <Toaster position="bottom-right" />
            </TooltipProvider>
        </ConvexAuthProvider>
    )
}
