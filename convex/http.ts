import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'

const http = httpRouter()

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Your iMessage relay posts every incoming text here:
//   POST {CONVEX_SITE_URL}/inbound  Authorization: Bearer $INBOUND_SECRET
//   { "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional display name>" }
// It answers { ok, conversationId, markRead }: send a read receipt when markRead is true.
// Replies come back on OUTBOUND_WEBHOOK_URL as { type: "message", from, to, body, ... }, and
// { type: "typing", from, to } just before a reply when the typing indicator is on.
http.route({
    path: '/inbound',
    method: 'POST',
    handler: httpAction(async (ctx, req) => {
        if (!env.INBOUND_SECRET) return json(503, { error: 'INBOUND_SECRET is not set on this deployment' })
        if (req.headers.get('Authorization') !== `Bearer ${env.INBOUND_SECRET}`) return json(401, { error: 'Unauthorized' })

        const data: unknown = await req.json().catch(() => null)
        const field = (k: string) => (data && typeof data === 'object' && typeof (data as Record<string, unknown>)[k] === 'string' ? ((data as Record<string, string>)[k] as string) : undefined)
        const to = field('to')
        const from = field('from')
        const body = field('body')
        if (!to || !from || !body) return json(400, { error: 'Send JSON with string fields to, from and body' })

        try {
            const { conversationId, markRead } = await ctx.runMutation(internal.inbound.receive, { to, from, body, name: field('name') })
            return json(200, { ok: true, conversationId, markRead })
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            return json(422, { error: message.match(/Uncaught Error: (.*?)(?:\n|$)/)?.[1] ?? message })
        }
    }),
})

export default http
