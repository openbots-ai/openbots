import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { isPublicPath } from './lib/visits'

// Sign-in is Clerk's and texting webhooks go to your engine. The only thing served here is the website's visit count.
const http = httpRouter()

// The public pages send { path, newVisitor } here as text/plain (navigator.sendBeacon), which needs no CORS preflight
http.route({
    path: '/visit',
    method: 'POST',
    handler: httpAction(async (ctx, req) => {
        const headers = { 'Access-Control-Allow-Origin': '*' }
        let body: unknown
        try {
            const text = await req.text()
            if (text.length > 500) return new Response('Too large', { status: 413, headers })
            body = JSON.parse(text)
        } catch {
            return new Response('Bad request', { status: 400, headers })
        }
        if (typeof body !== 'object' || body === null) return new Response('Bad request', { status: 400, headers })
        const { path, newVisitor } = body as Record<string, unknown>
        if (!isPublicPath(path) || typeof newVisitor !== 'boolean') return new Response('Bad request', { status: 400, headers })
        await ctx.runMutation(internal.siteVisits.record, { path, newVisitor })
        return new Response(null, { status: 204, headers })
    }),
})

export default http
