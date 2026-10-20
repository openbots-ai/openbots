import { randomBytes } from 'node:crypto'
import type { Settings } from './config'
import type { Server } from './server'
import type { Store } from './store'
import { BlueBubblesTransport } from './transports/bluebubbles'
import { MacTransport } from './transports/mac'
import { RelayTransport } from './transports/relay'
import { SendblueTransport } from './transports/sendblue'
import { TwilioTransport } from './transports/twilio'
import type { Channel, Transport } from './transports/types'

type Webhooked = 'twilio' | 'sendblue' | 'bluebubbles'
const WEBHOOKED: Webhooked[] = ['twilio', 'sendblue', 'bluebubbles']

// Each webhook channel's own path secret, so one leaked URL lets nobody post to the others, plus the secret Sendblue
// sends back in its sb-signing-secret header. Made once and kept sealed; `rotate` makes new ones (the engine then
// points Twilio numbers and registers the Sendblue and BlueBubbles webhooks at the new URLs as it starts).
export type HookSecrets = Record<Webhooked, string> & { sendblueSigning: string }
export function hookSecrets(store: Store, rotate = false): { secrets: HookSecrets; fresh: boolean } {
    let fresh = false
    const secret = (name: string) => {
        const key = `hooks.${name}`
        const kept = rotate ? undefined : store.getSealedMeta(key)
        if (kept) return kept
        fresh = true
        const made = randomBytes(18).toString('base64url')
        store.setSealedMeta(key, made)
        return made
    }
    const secrets = { ...(Object.fromEntries(WEBHOOKED.map((c) => [c, secret(c)])) as Record<Webhooked, string>), sendblueSigning: secret('sendblue.signing') }
    // The one secret every channel used to share
    store.deleteMeta('hooks.secret')
    return { secrets, fresh }
}

// The ways this engine can text, from its current settings. A channel that can't start yet (no public URL for its
// webhooks) is reported instead, so the rest still run.
export function buildServices(settings: Settings, deps: { server: Server; store: Store; secrets: HookSecrets }) {
    const transports: Partial<Record<Channel, Transport>> = {}
    const problems: { service: Webhooked; error: string }[] = []
    // Webhook paths carry the channel's own random secret, so only that account knows where to post
    const hook = (channel: Webhooked) => `${settings.publicUrl}/hooks/${channel}/${deps.secrets[channel]}`
    const reachable = (service: Webhooked) => {
        if (settings.publicUrl) return true
        problems.push({
            service,
            error: service === 'bluebubbles' ? 'Set this engine’s Public URL in Connections to an address your Mac can reach (a private one works)' : 'Set this engine’s public URL in Connections, so your account can reach it',
        })
        return false
    }

    if (settings.mac) transports.mac = new MacTransport(deps.store)
    if (settings.relay) transports.relay = new RelayTransport(deps.server, settings.relay)
    let twilio: TwilioTransport | undefined
    if (settings.twilio && reachable('twilio')) transports.twilio = twilio = new TwilioTransport(deps.server, settings.twilio, hook('twilio'))
    if (settings.sendblue && reachable('sendblue')) transports.sendblue = new SendblueTransport(deps.server, settings.sendblue, hook('sendblue'), deps.secrets.sendblueSigning)
    if (settings.bluebubbles && reachable('bluebubbles')) transports.bluebubbles = new BlueBubblesTransport(deps.server, settings.bluebubbles, hook('bluebubbles'))
    return { transports, twilio, problems }
}

export type Services = ReturnType<typeof buildServices>
