import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http'

// One small web server on the agent for everything that posts to it: your relay, and the webhooks of your
// Twilio, Sendblue and BlueBubbles accounts. Each channel adds its own route.

export type Request = { path: string; headers: IncomingHttpHeaders; body: string }
export type Response = { status?: number; body: string; type?: string }
type Handler = (req: Request) => Promise<Response>

const MAX_BODY = 256 * 1024

export const json = (body: unknown, status = 200): Response => ({ status, body: JSON.stringify(body), type: 'application/json' })

export class Server {
    private routes = new Map<string, Handler>()
    private server?: HttpServer

    constructor(private options: { host: string; port: number }) {}

    route(path: string, handler: Handler) {
        this.routes.set(path, handler)
    }

    get hasRoutes() {
        return this.routes.size > 0
    }

    async start() {
        this.server = createServer(async (req, res) => {
            const send = ({ status = 200, body, type = 'text/plain' }: Response) => {
                res.writeHead(status, { 'Content-Type': type })
                res.end(body)
            }
            const path = (req.url ?? '/').split('?')[0]
            const handler = req.method === 'POST' ? this.routes.get(path) : undefined
            if (!handler) return send({ status: 404, body: 'Not found' })
            let body = ''
            for await (const chunk of req) {
                body += chunk
                if (body.length > MAX_BODY) return send({ status: 413, body: 'Too large' })
            }
            try {
                send(await handler({ path, headers: req.headers, body }))
            } catch (e) {
                // A text that can't be taken (an unknown number, say) is logged, not retried by the sender forever
                console.error(`Couldn't take a text: ${e instanceof Error ? e.message : String(e)}`)
                send(json({ error: e instanceof Error ? e.message : 'Could not take that text' }, 422))
            }
        })
        await new Promise<void>((resolve) => this.server!.listen(this.options.port, this.options.host, resolve))
    }

    async stop() {
        await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()))
    }
}
