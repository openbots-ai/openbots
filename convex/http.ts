import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { env, httpAction, type ActionCtx } from './_generated/server'
import { auth } from './auth'
import { webhookUrl } from './connections'
import { decrypt } from './lib/crypto'
import { twilioSignature, type Credentials } from './lib/providers'

const http = httpRouter()

auth.addHttpRoutes(http)

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: { 'Content-Type': 'text/xml' } })

type Inbound = { to?: string; from: string; body: string; name?: string; thread?: { key: string; title?: string } }

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

// Hands a parsed incoming text to the conversation pipeline. Errors (an unassigned number, say) are logged and
// swallowed: the provider would only retry the same message.
async function deliver(ctx: ActionCtx, conn: Doc<'connections'>, msg: Inbound) {
    try {
        await ctx.runMutation(internal.inbound.fromChannel, { connectionId: conn._id, ...msg })
    } catch (e) {
        console.error(`Incoming ${conn.provider} text not handled: ${e instanceof Error ? e.message : String(e)}`)
    }
}

// Twilio: form-encoded SMS webhook, signed with the account's auth token
async function twilio(ctx: ActionCtx, conn: Doc<'connections'>, req: Request) {
    const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>
    const { authToken } = await decrypt<Credentials['twilio']>(conn.secret)
    const expected = await twilioSignature(authToken, webhookUrl('twilio', conn.webhookToken), params)
    if (req.headers.get('X-Twilio-Signature') !== expected) return new Response('Bad signature', { status: 403 })
    if (params.From && params.To && params.Body) await deliver(ctx, conn, { from: params.From, to: params.To, body: params.Body })
    return twiml()
}

// Sendblue: JSON for every message on the account; skip the ones it sent itself
async function sendblue(ctx: ActionCtx, conn: Doc<'connections'>, req: Request) {
    const d = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!d || d.is_outbound === true) return json(200, { ok: true })
    const from = str(d.number) ?? str(d.from_number)
    const body = str(d.content)
    const groupId = str(d.group_id)
    if (from && body) await deliver(ctx, conn, { from, to: str(d.sendblue_number) ?? str(d.to_number), body, thread: groupId ? { key: groupId, title: str(d.group_display_name) } : undefined })
    return json(200, { ok: true })
}

// BlueBubbles: { type: "new-message", data: Message } from the person's Mac. Group chat guids contain ";+;".
async function bluebubbles(ctx: ActionCtx, conn: Doc<'connections'>, req: Request) {
    const d = (await req.json().catch(() => null)) as { type?: string; data?: Record<string, unknown> } | null
    const m = d?.data
    if (d?.type !== 'new-message' || !m || m.isFromMe === true) return json(200, { ok: true })
    const from = str((m.handle as { address?: unknown } | undefined)?.address)
    const body = str(m.text)
    const chat = ((m.chats as Record<string, unknown>[] | undefined) ?? [])[0]
    const chatGuid = str(chat?.guid)
    const isGroup = !!chatGuid && chatGuid.includes(';+;')
    if (from && body) await deliver(ctx, conn, { from, body, thread: isGroup ? { key: chatGuid!, title: str(chat?.displayName) } : undefined })
    return json(200, { ok: true })
}

// Every connected texting account posts to /hooks/<provider>/<token>; the token picks the connection
http.route({
    pathPrefix: '/hooks/',
    method: 'POST',
    handler: httpAction(async (ctx, req) => {
        const [, , provider, token] = new URL(req.url).pathname.split('/')
        const conn: Doc<'connections'> | null = token ? await ctx.runQuery(internal.connections.byToken, { token }) : null
        if (!conn || conn.provider !== provider) return json(404, { error: 'Unknown webhook' })
        if (provider === 'twilio') return twilio(ctx, conn, req)
        if (provider === 'sendblue') return sendblue(ctx, conn, req)
        if (provider === 'bluebubbles') return bluebubbles(ctx, conn, req)
        return json(404, { error: 'Unknown webhook' })
    }),
})

// Kept so the deployment's site URL answers something useful when opened in a browser
http.route({
    path: '/',
    method: 'GET',
    handler: httpAction(async () => json(200, { ok: true, service: 'openbots', site: env.CONVEX_SITE_URL })),
})

export default http
