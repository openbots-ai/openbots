import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Id } from '../../convex/_generated/dataModel'
import { keyModels, resolveModels } from '../../convex/lib/models'
import type { SealedService } from '../../convex/lib/sealed'
import { dayKey } from '../../convex/lib/usage'
import { fromDashboard, loadSettings, withDashboard, type DashboardDoc, type Settings } from './config'
import { nodeTooOld, nodeVersionError } from './nodeVersion'
import { askForToken, findToken, hiddenPrompt, saveToken, tokenFile } from './token'
import { ensureCloudflared } from './cloudflared'
import { startTunnel } from './tunnel'
import { computerAllowed, driverFor, makeComputer, taskMemory, tellAboutRestart } from './computer'
import { Vault } from './crypto'
import { checkKeys } from './models'
import { Pipeline } from './pipeline'
import { check, ConnectError, sendEmail, sendText, type Credentials } from './providers'
import { Server } from './server'
import { buildServices, hookSecrets, type Services } from './services'
import { Scheduler } from './scheduler'
import { Store } from './store'
import { ConvexLink, type Status, type Task, type TaskResult } from './sync'
import type { Channel } from './transports/types'
import { sendOwnerCode } from './verify'

// Set at build time from runner/package.json
declare const __VERSION__: string
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'
const HEARTBEAT_MS = 60_000
// How often keys and accounts are re-checked, so newly available models show up in the dashboard
const CHECK_MS = 6 * 3_600_000

// Reported so the dashboard knows whether this computer can do computer use
const osName = () => (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : process.platform === 'linux' ? 'linux' : 'other')

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Connects with the token from OPENBOTS_TOKEN, the saved file or the terminal. At a terminal, a token that doesn't
// connect is asked for again, and one you paste is saved only once it connects: a wrong paste never sticks, and
// running the same command again just asks again. `--new-token` asks even when a saved token works.
async function connect(convexUrl: string, envToken: string | undefined, dataDir: string) {
    if (process.argv.includes('--new-token')) rmSync(tokenFile(dataDir), { force: true })
    const ask = hiddenPrompt()
    let { token, source } = await findToken({ envToken, dataDir, ask })
    for (;;) {
        const link = new ConvexLink(convexUrl, token)
        try {
            await link.connect((m) => console.error(m))
            if (source === 'typed') {
                saveToken(dataDir, token)
                console.log(`Token saved in ${tokenFile(dataDir)}, so you won't be asked again.`)
            }
            return link
        } catch (e) {
            await link.close().catch(() => {})
            if (source === 'env') throw e
            const refused = /invalid or was revoked/.test(message(e))
            if (!ask) throw new Error(`${message(e)}${refused ? ' Start the engine in a terminal with --new-token to paste the new one.' : ''}`, { cause: e })
            // Production hides most reasons as "Server Error", which says nothing useful here
            console.error(refused || !/Server Error/.test(message(e)) ? message(e) : "That token didn't connect.")
            token = await askForToken(ask, `Paste this computer's token from Connections again (it won't show as you paste): `)
            source = 'typed'
        }
    }
}

async function main() {
    // Checked before anything that needs a newer Node.js (node:sqlite) loads
    if (nodeTooOld()) throw new Error(nodeVersionError())
    let base = loadSettings()
    // The Public URL set on this machine; without one, the tunnel's address is used
    const envPublicUrl = base.publicUrl
    const store = new Store(join(base.dataDir, 'openbots.db'), Vault.open(base.dataDir))

    console.log(`OpenBots engine ${VERSION}: connecting to your workspace…`)
    const link = await connect(base.convexUrl, base.token, base.dataDir)

    // Each webhook channel has its own random secret in its path, made once, so only that account knows where to
    // post. OPENBOTS_ROTATE_WEBHOOKS=true makes new ones; the new addresses are logged once the channels start.
    const hooks = hookSecrets(store, base.rotateHooks)
    let announceHooks = hooks.fresh
    if (base.rotateHooks) console.log('Made new webhook secrets. Twilio numbers, Sendblue and BlueBubbles are pointed at the new addresses as they start; remove the old addresses from your Sendblue and BlueBubbles settings.')
    const server = new Server({ host: base.host, port: base.port })

    let settings = withDashboard(base, { secrets: {} })
    let services: Services = { transports: {}, twilio: undefined, problems: [] }
    // The Orgo key stays with the backend, so its service never appears here
    type EngineService = Exclude<SealedService, 'orgo'>
    let keyProblems: { service: EngineService; error: string }[] = []
    const os = osName()
    let status: Status = { version: VERSION, services: [], models: [], channels: [], lines: [], demo: base.brains.demo, os }

    // What's stopping computer use on this Mac (a permission), from the last heartbeat
    let computerProblem: string | null = null
    // Computer use on this machine's own screen, mouse and keyboard (Windows, Mac or Linux); undefined elsewhere
    const driver = driverFor(os, base.dataDir)
    // You texted YES ALL: computer use stops asking you, until you turn asking back on in Settings
    const saveYesAll = () => {
        if (link.config()?.workspace.yesAll !== true) void link.yesAll().catch((e) => console.error(`Couldn't save your YES ALL: ${message(e)}`))
    }
    const computer = makeComputer(os, {
        // `settings` is replaced when keys change in Connections, so this reads the current key
        anthropicKey: () => settings.brains.keys.anthropic,
        // The Computer use model of the agent that started the task, as set now (its own choice, or the workspace's)
        model: (agentId) => {
            const c = link.config()
            const agent = c?.agents.find((a) => a._id === agentId)
            const option = resolveModels(c?.workspace.models, agent?.models, agent?.model, keyModels(status.models)).computer.option
            // An option without a provider name isn't a Computer use model: fall back to the default
            return option.api ? { api: option.api, id: option.id } : { api: 'claude-sonnet-5-5', id: 'claude-sonnet-5.5-computer-use' }
        },
        budget: () => link.budget(dayKey(Date.now())),
        record: (agentId, model) => void link.record(agentId as Id<'agents'>, { usage: { slot: 'computer', model } }).catch((e) => console.error(`Couldn't record usage: ${message(e)}`)),
        log: (line) => console.log(line),
        // Turning Computer use off or pausing the agent in the dashboard stops a running task at its next step
        allowed: (agentId) => computerAllowed(link.config(), agentId),
        yesAll: () => link.config()?.workspace.yesAll === true,
        saveYesAll: () => saveYesAll(),
        persist: taskMemory(store),
        driver,
    })
    const pipeline = new Pipeline({ store, link, transports: {}, brains: settings.brains, models: () => status.models, computer, computerProblem: () => computerProblem, yesAll: () => saveYesAll() })

    // Runs reminders, watches and check-ins when they're due
    const scheduler = new Scheduler({
        store,
        now: Date.now,
        fire: (job) => pipeline.fireJob(job),
        // A send that fails is logged without the message
        tellOwner: async (job, body) => {
            try {
                await services.transports[job.channel]?.send({ from: job.number, to: job.to, body })
            } catch (e) {
                console.error(`Couldn't tell you about a job: ${message(e)}`)
            }
        },
        checkIns: (now) => pipeline.fireCheckIns(now),
        log: (line) => console.log(line),
    })

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
        services = buildServices(settings, { server, store, secrets: hooks.secrets })
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
        if (server.hasRoutes || tunnelStarted) await server.start()
        await repointTwilio()
        if (announceHooks) {
            for (const t of Object.values(services.transports)) {
                if (!('hookUrl' in t)) continue
                console.log(`${t.channel} webhook: ${String(t.hookUrl)}`)
                announceHooks = false
            }
        }
        status = { ...status, channels: Object.keys(services.transports) as Channel[] }
        const channels = Object.keys(services.transports)
        console.log(channels.length ? `Answering through ${channels.join(', ')}${server.hasRoutes ? ` (listening on ${base.host}:${base.port})` : ''}.` : 'No way to text is set up yet. Add one in Connections, or set it on this engine. Waiting…')
    }

    // Twilio numbers point at this engine's address; when that changes (a new tunnel address), point them again
    const repointTwilio = async () => {
        const twilio = services.twilio
        if (!twilio) return
        for (const n of link.config()?.numbers ?? []) {
            if (n.channel !== 'twilio' || !n.externalId) continue
            await twilio.use(n.externalId, n.handle).catch((e) => console.error(`Couldn't point ${n.handle} at this engine: ${message(e)}`))
        }
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
    // One line per service, so the report stays under Convex's cap; a problem beats an OK check for the same service
    const perService = (list: Status['services']) => {
        const seen = new Map<string, Status['services'][number]>()
        for (const s of list) if (!seen.has(s.service) || (s.error && !seen.get(s.service)!.error)) seen.set(s.service, s)
        return [...seen.values()]
    }
    // A Mac needs Screen Recording and Accessibility for computer use: checked at start and each heartbeat, and reported
    // until it has them. Only whether they're allowed is checked; nothing on the screen is read or logged.
    // Linux asks the desktop for remote control as soon as computer use is on, while someone is likely at the
    // computer; that waits for an answer, so the heartbeat doesn't.
    let asking = false
    let askedOnce = false
    const checkComputer = async () => {
        if ((os !== 'mac' && os !== 'linux') || !driver || link.config()?.computerUse !== true) return void (computerProblem = null)
        const report = (problem: string | null) => {
            if (problem && problem !== computerProblem) console.error(`Computer use: ${problem}`)
            computerProblem = problem
        }
        if (os === 'mac') return report(await driver.ready().catch((e) => `Couldn't check this Mac's permissions: ${message(e)}`))
        if (asking) return
        asking = true
        if (!askedOnce) console.log('Computer use: if your desktop asks to share the screen and input devices, choose Allow (it asks only once)')
        askedOnce = true
        void driver
            .ready()
            .catch((e) => message(e))
            .then((problem) => {
                asking = false
                report(problem)
            })
    }
    const beat = async () => {
        await checkComputer()
        const agents = link.config()?.agents ?? []
        // Only agents the dashboard still has, so a job left from a deleted agent can't get the heartbeat refused
        const jobs = store.jobCounts().filter((j) => agents.some((a) => a._id === j.agentId)) as { agentId: Id<'agents'>; reminders: number; watches: number }[]
        // Reminders and watches waiting for a channel that isn't running, reported on that channel's service
        const waiting: Status['services'] = []
        // A held job comes due again within 5 minutes, so that window covers the ones waiting
        for (const { agentId, channel } of store.dueChannels(Date.now() + 5 * 60_000)) {
            const agent = agents.find((a) => a._id === agentId)
            if (!agent || services.transports[channel] || (channel !== 'twilio' && channel !== 'sendblue' && channel !== 'bluebubbles')) continue
            waiting.push({ service: channel, error: `${agent.name} has reminders or watches waiting for ${channel}, which isn't running` })
        }
        const computing: Status['services'] = computerProblem ? [{ service: 'computer', error: computerProblem }] : []
        // Texts ignored since the last beat (people not on your list): counts and numbers only
        await pipeline.flushIgnored()
        return link.heartbeat({ ...status, services: perService([...status.services, ...waiting, ...computing]), jobs }).catch((e) => console.error(`Heartbeat failed: ${message(e)}`))
    }
    // A computer task the last run left unfinished: tell you in its chat once its channel is up. Runs at start and
    // after each dashboard change (a channel may start later); it texts at most once.
    const restartNotice = () =>
        tellAboutRestart(
            store,
            (_agentId, conversationId, body) => pipeline.textInChat(conversationId, body),
            (line) => console.error(line),
            (conversationId) => pipeline.chatReach(conversationId),
        ).catch((e) => console.error(`Couldn't check for a computer task the restart stopped: ${message(e)}`))
    // Each change from the dashboard is applied in turn. The channels restart only when their own settings change.
    const channelSettings = (s: Settings) => JSON.stringify([s.mac, s.relay, s.twilio, s.sendblue, s.bluebubbles, s.publicUrl])
    let applied = ''
    let chain = Promise.resolve()
    let resumed = false
    let lastDoc: DashboardDoc | undefined
    let stopTunnel = () => {}
    let tunnelStarted = false
    let tunnelFor: (next: Settings) => void = () => {}
    const ready = new Promise<void>((resolve) => {
        const handle = (doc: DashboardDoc) => {
                lastDoc = doc
                chain = chain
                    .then(async () => {
                        const opened = fromDashboard(doc)
                        keyProblems = opened.problems.filter((p): p is { service: EngineService; error: string } => p.service !== 'orgo')
                        const next = withDashboard(base, opened.values)
                        tunnelFor(next)
                        const wanted = channelSettings(next)
                        if (wanted !== applied) {
                            await apply(next)
                            applied = wanted
                        } else takeKeys(next)
                        await checkAll()
                        await beat()
                        await restartNotice()
                    })
                    .catch((e) => console.error(`Couldn't apply your dashboard keys: ${message(e)}`))
                    // Even if the first change failed, queued replies go out with whatever is running
                    .then(() => {
                        if (resumed) return
                        resumed = true
                        pipeline.resume()
                        scheduler.start()
                        resolve()
                    })
        }
        // Twilio and Sendblue post incoming texts to the engine, so with either and no public URL, the tunnel starts
        // and its address becomes the public URL. A new address is applied like any other change.
        tunnelFor = (next) => {
            if (tunnelStarted || !base.tunnel || next.publicUrl || !(next.twilio || next.sendblue)) return
            tunnelStarted = true
            const tunnel = base.tunnel
            console.log('Twilio and Sendblue need to reach this computer: starting a Cloudflare tunnel…')
            void (async () => {
                try {
                    const bin = tunnel.bin ?? (await ensureCloudflared(base.dataDir))
                    await server.start()
                    stopTunnel = startTunnel(bin, base.port, (url) => {
                        console.log(`Public address: ${url}`)
                        status = { ...status, tunnelUrl: url }
                        base = { ...base, publicUrl: envPublicUrl ?? url }
                        if (lastDoc) handle(lastDoc)
                    }, (line) => console.error(line))
                } catch (e) {
                    tunnelStarted = false
                    console.error(`Couldn't start the Cloudflare tunnel: ${message(e)}. It's tried again with the next change; or set a Public URL in Connections.`)
                }
            })()
        }
        link.onDashboard(
            handle,
            // Before the first read nothing is running yet, so stop instead of waiting forever
            (error) => {
                console.error(`Couldn't read your keys from the dashboard: ${error}`)
                if (!resumed) process.exit(1)
            },
        )
    })
    await ready
    // Again now that everything is up, in case the first change failed part way
    await restartNotice()
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
            // The code that verifies your phone, from whichever of your numbers can reach it
            if (request.kind === 'ownerCode') {
                const codeHash = await sendOwnerCode({ taskId: task._id, to: request.to, config: link.config(), transports: services.transports })
                console.log(`Texted a verification code to …${request.to.replace(/\s/g, '').slice(-4)}`)
                await link.finishTask(task._id, { result: { codeHash } }).catch((e) => console.error(`Couldn't report a task: ${message(e)}`))
                return
            }
            // A test text only needs your Twilio login, not a public address, so it works before webhooks are set up
            if (request.kind === 'twilioTestText') {
                if (!settings.twilio) throw new ConnectError("Twilio isn't set up on this engine")
                const to = request.to.trim().startsWith('+') ? request.to.trim() : `+${request.to.replace(/\D/g, '').length === 10 ? '1' : ''}${request.to.replace(/\D/g, '')}`
                await sendText('twilio', settings.twilio, { from: request.from, to, body: request.body.trim() })
                await link.finishTask(task._id, { result: { sentTo: to } }).catch((e) => console.error(`Couldn't report a task: ${message(e)}`))
                return
            }
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
        // A running task stops clicking; it stays remembered, so the next start texts you about it
        computer?.halt()
        timers.forEach(clearInterval)
        stopTunnel()
        scheduler.stop()
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
