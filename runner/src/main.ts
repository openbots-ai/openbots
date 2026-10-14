import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fingerprint, type SealedService } from '../../convex/lib/sealed'
import { loadSettings, openDashboard, withDashboard, type Settings } from './config'
import { Vault } from './crypto'
import { loadEngineKeys } from './identity'
import { checkKeys } from './models'
import { Pipeline } from './pipeline'
import { check, ConnectError, sendEmail, type Credentials } from './providers'
import { Server } from './server'
import { buildServices, type Services } from './services'
import { Store } from './store'
import { ConvexLink, type Status, type Task, type TaskResult } from './sync'
import type { Channel } from './transports/types'

// Set at build time from runner/package.json
declare const __VERSION__: string
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'
const HEARTBEAT_MS = 60_000
// How often keys and accounts are re-checked, so newly available models show up in the dashboard
const CHECK_MS = 6 * 3_600_000

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function main() {
    const base = loadSettings()
    const store = new Store(join(base.dataDir, 'openbots.db'), Vault.open(base.dataDir))
    const engineKeys = await loadEngineKeys(base.dataDir)
    const link = new ConvexLink(base.convexUrl, base.token)

    console.log(`OpenBots engine ${VERSION}: connecting to your workspace…`)
    console.log(`Engine key ${await fingerprint(engineKeys.publicKey)} (Connections shows the same for this engine)`)
    await link.connect((m) => console.error(m))

    // Webhook paths carry a random secret, made once, so only your accounts know where to post
    const secret = store.getMeta('hooks.secret') ?? randomBytes(18).toString('base64url')
    store.setMeta('hooks.secret', secret)
    const server = new Server({ host: base.host, port: base.port })

    let settings = withDashboard(base, { secrets: {} })
    let services: Services = { transports: {}, problems: [] }
    let keyProblems: { service: SealedService; error: string }[] = []
    let status: Status = { version: VERSION, services: [], models: [], channels: [], lines: [], demo: base.brains.demo, publicKey: engineKeys.publicKey }
    const pipeline = new Pipeline({ store, link, transports: {}, brains: settings.brains, models: () => status.models })

    // New AI keys and email take effect straight away, without touching the channels
    const takeKeys = (next: Settings) => {
        settings = next
        const resend = settings.resend
        pipeline.update({ brains: settings.brains, email: resend ? (to, subject, text) => sendEmail(resend, to, subject, text) : undefined })
    }

    // Stops the channels, rebuilds them from the new settings and starts them again. A channel that won't stop or
    // start is logged and reported for its service, and the rest keep running.
    const apply = async (next: Settings) => {
        for (const t of Object.values(services.transports)) await t.stop().catch((e) => console.error(`Couldn't stop ${t.channel}: ${message(e)}`))
        server.clearRoutes()
        takeKeys(next)
        services = buildServices(settings, { server, store, secret })
        pipeline.update({ transports: services.transports })
        for (const t of Object.values(services.transports)) {
            try {
                await t.start((text) => pipeline.receive(text))
            } catch (e) {
                const error = `Couldn't start: ${message(e)}`
                console.error(`${t.channel}: ${error}`)
                if (t.channel !== 'mac' && t.channel !== 'relay') services.problems.push({ service: t.channel, error })
                delete services.transports[t.channel]
                await t.stop().catch(() => {})
            }
        }
        if (server.hasRoutes) await server.start()
        status = { ...status, channels: Object.keys(services.transports) as Channel[] }
        const channels = Object.keys(services.transports)
        console.log(channels.length ? `Answering through ${channels.join(', ')}${server.hasRoutes ? ` (listening on ${base.host}:${base.port})` : ''}.` : 'No way to text is set up yet. Add one in Connections, or set it on this engine. Waiting…')
    }

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
        const lines = (await Promise.all(Object.values(services.transports).map((t) => t.lines?.().catch(() => []) ?? []))).flat()
        status = {
            ...status,
            models: keys.models,
            lines,
            services: [
                ...keys.results.map((r) => ({ service: r.provider, label: r.error ? undefined : `${r.count} models`, error: r.error })),
                ...checked,
                ...services.problems,
                ...keyProblems,
            ],
        }
        for (const s of status.services) if (s.error) console.error(`${s.service}: ${s.error}`)
    }
    const beat = () => link.heartbeat(status).catch((e) => console.error(`Heartbeat failed: ${message(e)}`))
    // Each change from the dashboard is applied in turn. The channels restart only when their own settings change.
    const channelSettings = (s: Settings) => JSON.stringify([s.mac, s.relay, s.twilio, s.sendblue, s.bluebubbles, s.publicUrl])
    let applied = ''
    let chain = Promise.resolve()
    let resumed = false
    const ready = new Promise<void>((resolve) => {
        link.onDashboard((doc) => {
            chain = chain
                .then(async () => {
                    const opened = await openDashboard(engineKeys.privateKey, doc)
                    keyProblems = opened.problems
                    const next = withDashboard(base, opened.values)
                    const wanted = channelSettings(next)
                    if (wanted !== applied) {
                        await apply(next)
                        applied = wanted
                    } else takeKeys(next)
                    await checkAll()
                    await beat()
                })
                .catch((e) => console.error(`Couldn't apply your dashboard keys: ${message(e)}`))
                // Even if the first change failed, queued replies go out with whatever is running
                .then(() => {
                    if (resumed) return
                    resumed = true
                    pipeline.resume()
                    resolve()
                })
        })
    })
    await ready
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
            const twilio = services.twilio
            if (!twilio) throw new ConnectError("Twilio isn't set up on this engine")
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

    const shutdown = async () => {
        timers.forEach(clearInterval)
        pipeline.stop()
        for (const t of Object.values(services.transports)) await t.stop().catch(() => {})
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
