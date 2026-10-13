import { join } from 'node:path'
import { PROVIDER_KEYS } from './brain'
import { loadSettings } from './config'
import { Vault } from './crypto'
import { Pipeline } from './pipeline'
import { Store } from './store'
import { ConvexLink } from './sync'
import { MacTransport } from './transports/mac'
import { RelayTransport } from './transports/relay'
import type { Transport } from './transports/types'

// Set at build time from runner/package.json
declare const __VERSION__: string
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev'
const HEARTBEAT_MS = 60_000

async function main() {
    const settings = loadSettings()
    const store = new Store(join(settings.dataDir, 'openbots.db'), Vault.open(settings.dataDir))
    const link = new ConvexLink(settings.convexUrl, settings.token)

    console.log(`OpenBots agent ${VERSION}: connecting to your workspace…`)
    await link.connect((message) => console.error(message))

    const transport: Transport =
        settings.transport === 'mac'
            ? new MacTransport(store, () => link.config()?.numbers[0]?.handle ?? null)
            : new RelayTransport(settings.relay!)
    const pipeline = new Pipeline({ store, link, transport, brains: settings.brains })

    const providers = { ...Object.fromEntries(Object.keys(PROVIDER_KEYS).map((p) => [p, !!settings.brains.keys[p as keyof typeof PROVIDER_KEYS]])), local: !!settings.brains.local }
    const beat = () => link.heartbeat({ version: VERSION, transport: transport.name, providers, demo: settings.brains.demo }).catch((e) => console.error(`Heartbeat failed: ${e instanceof Error ? e.message : e}`))
    await beat()
    const heartbeat = setInterval(beat, HEARTBEAT_MS)

    pipeline.resume()
    await transport.start((text) => pipeline.receive(text))
    console.log(settings.transport === 'mac' ? 'Listening to Messages on this Mac.' : `Waiting for your relay on http://${settings.relay!.host}:${settings.relay!.port}/inbound`)

    const shutdown = async () => {
        clearInterval(heartbeat)
        pipeline.stop()
        await transport.stop()
        await link.close()
        store.close()
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
})
