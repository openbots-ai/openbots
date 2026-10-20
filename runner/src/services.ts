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

// The ways this engine can text, from its current settings. A channel that can't start yet (no public URL for its
// webhooks) is reported instead, so the rest still run.
export function buildServices(settings: Settings, deps: { server: Server; store: Store; secret: string }) {
    const transports: Partial<Record<Channel, Transport>> = {}
    const problems: { service: Webhooked; error: string }[] = []
    // Webhook paths carry a random secret, so only your accounts know where to post
    const hook = (channel: Channel) => `${settings.publicUrl}/hooks/${channel}/${deps.secret}`
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
    if (settings.sendblue && reachable('sendblue')) transports.sendblue = new SendblueTransport(deps.server, settings.sendblue, hook('sendblue'))
    if (settings.bluebubbles && reachable('bluebubbles')) transports.bluebubbles = new BlueBubblesTransport(deps.server, settings.bluebubbles, hook('bluebubbles'))
    return { transports, twilio, problems }
}

export type Services = ReturnType<typeof buildServices>
