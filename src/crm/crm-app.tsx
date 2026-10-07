import { useEffect } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { Shell } from './shell'
import { ToastProvider } from './toast'

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
                <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-[14px] text-neutral-600">
                    <h1 className="text-base font-semibold text-neutral-900">Connect Convex</h1>
                    <p className="mt-2">
                        <code className="rounded bg-neutral-100 px-1">VITE_CONVEX_URL</code> isn't set. Run <code className="rounded bg-neutral-100 px-1">npx convex dev</code> locally (it writes
                        .env.local), or add the variable in Vercel and redeploy.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <ConvexProvider client={client}>
            <ToastProvider>
                <Shell />
            </ToastProvider>
        </ConvexProvider>
    )
}
