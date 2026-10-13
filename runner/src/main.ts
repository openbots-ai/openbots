import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { loadSettings } from './config'
import { Vault } from './crypto'
import { checkKeys } from './models'
import { Pipeline } from './pipeline'
import { check, ConnectError, sendEmail, type Credentials } from './providers'
import { Server } from './server'
import { Store } from './store'
import { ConvexLink, type Status, type Task, type TaskResult } from './sync'
import { BlueBubblesTransport } from './transports/bluebubbles'
import { MacTransport } from './transports/mac'
import { RelayTransport } from './transports/relay'
import { SendblueTransport } from './transports/sendblue'
import { TwilioTransport } from './transports/twilio'
import type { Channel, Transport } from './transports/types'

// Set at build time from runner/package.json
declare const __VERSION__: string
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'
const HEARTBEAT_MS = 60_000
// How often keys and accounts are re-checked, so newly available models show up in the dashboard
const CHECK_MS = 6 * 3_600_000

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function main() {
    const settings = loadSettings()
    const store = new Store(join(settings.dataDir, 'openbots.db'), Vault.open(settings.dataDir))
    const link = new ConvexLink(settings.convexUrl, settings.token)

    console.log(`OpenBots agent ${VERSION}: connecting to your workspace…`)
    await link.connect((m) => console.error(m))

    // Webhook paths carry a random secret, made once, so only your accounts know where to post
    const secret = store.getMeta('hooks.secret') ?? randomBytes(18).toString('base64url')
    store.setMeta('hooks.secret', secret)
    const hook = (channel: Channel) => `${settings.publicUrl}/hooks/${channel}/${secret}`

    const server = new Server({ host: settings.host, port: settings.port })
    const transports: Partial<Record<Channel, Transport>> = {}
    if (settings.mac) transports.mac = new MacTransport(store)
    if (settings.relay) transports.relay = new RelayTransport(server, settings.relay)
    const twilio = settings.twilio ? new TwilioTransport(server, settings.twilio, hook('twilio')) : undefined
    if (twilio) transports.twilio = twilio
    if (settings.sendblue) transports.sendblue = new SendblueTransport(server, settings.sendblue, hook('sendblue'))
    if (settings.bluebubbles) transports.bluebubbles = new BlueBubblesTransport(server, settings.bluebubbles, hook('bluebubbles'))
    if (!Object.keys(transports).length) throw new Error('Set up at least one way to text: Messages on a Mac, a relay, Twilio, Sendblue or BlueBubbles (see runner/README.md)')

    const resend = settings.resend
    let status: Status = { version: VERSION, services: [], models: [], channels: Object.keys(transports) as Channel[], lines: [], demo: settings.brains.demo }
    const pipeline = new Pipeline({
        store,
        link,
        transports,
        brains: settings.brains,
        models: () => status.models,
        email: resend ? (to, subject, text) => sendEmail(resend, to, subject, text) : undefined,
    })

    // What's set up, checked with each provider: the models each AI key can use, and whether each account works
    const checkAll = async () => {
        const keys = await checkKeys(settings.brains)
        const accounts = (['twilio', 'sendblue', 'bluebubbles', 'resend'] as const).filter((s) => settings[s])
        const checked = await Promise.all(
            accounts.map(async (service) => {
                try {
                    const { label } = await check(service, settings[service] as Credentials[typeof service])
                    return { service, label }
                } catch (e) {
                    return { service, error: e instanceof ConnectError ? e.message : `Couldn't check: ${message(e)}` }
                }
            }),
        )
        const lines = (await Promise.all(Object.values(transports).map((t) => t.lines?.().catch(() => []) ?? []))).flat()
        status = {
            ...status,
            models: keys.models,
            lines,
            services: [...keys.results.map((r) => ({ service: r.provider, label: r.error ? undefined : `${r.count} models`, error: r.error })), ...checked],
        }
        for (const s of status.services) if (s.error) console.error(`${s.service}: ${s.error}`)
    }
    await checkAll()
    const beat = () => link.heartbeat(status).catch((e) => console.error(`Heartbeat failed: ${message(e)}`))
    await beat()
    const timers = [setInterval(beat, HEARTBEAT_MS), setInterval(() => void checkAll().then(beat), CHECK_MS)]

    // Requests from the dashboard: check keys again, or anything that needs your Twilio login
    const run = async (task: Task) => {
        const { request } = task
        let outcome: { result?: TaskResult; error?: string }
        if (request.kind === 'recheck') {
            await checkAll()
            await beat()
            await link.finishTask(task._id, {}).catch((e) => console.error(`Couldn't report a task: ${message(e)}`))
            return
        }
        try {
            if (!twilio) throw new ConnectError("Twilio isn't set up on this agent")
            const numbers = (list: { sid?: string; phoneNumber: string; friendlyName: string; locality?: string; region?: string }[]) => ({
                numbers: list.map(({ sid, phoneNumber, friendlyName, locality, region }) => ({ sid, phoneNumber, friendlyName, locality, region })),
            })
            if (request.kind === 'twilioSearch') outcome = { result: numbers(await twilio.search(request.country, request.areaCode)) }
            else if (request.kind === 'twilioOwned') outcome = { result: numbers(await twilio.owned()) }
            else if (request.kind === 'twilioBuy') outcome = { result: await twilio.buy(request.phoneNumber) }
            else outcome = { result: await twilio.use(request.sid, request.phoneNumber) }
        } catch (e) {
            outcome = { error: e instanceof ConnectError ? e.message : `Something went wrong: ${message(e)}` }
        }
        await link.finishTask(task._id, outcome).catch((e) => console.error(`Couldn't report a task: ${message(e)}`))
        if (request.kind === 'twilioBuy' || request.kind === 'twilioUse') void checkAll().then(beat)
    }
    link.onTasks((task) => void run(task))

    pipeline.resume()
    for (const t of Object.values(transports)) await t.start((text) => pipeline.receive(text))
    if (server.hasRoutes) await server.start()
    console.log(`Answering through ${Object.keys(transports).join(', ')}${server.hasRoutes ? ` (listening on ${settings.host}:${settings.port})` : ''}.`)

    const shutdown = async () => {
        timers.forEach(clearInterval)
        pipeline.stop()
        for (const t of Object.values(transports)) await t.stop()
        await server.stop()
        await link.close()
        store.close()
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((e) => {
    console.error(message(e))
    process.exit(1)
})
