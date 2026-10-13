import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_KEYS, type Brains } from './brain'

// Everything the agent needs comes from environment variables (or a .env file you pass with node --env-file).
// Keys and history stay on this machine; see runner/README.md.
export type Settings = {
    convexUrl: string
    token: string
    dataDir: string
    transport: 'mac' | 'relay'
    relay?: { host: string; port: number; inboundSecret: string; relayUrl: string; relaySecret?: string }
    brains: Brains
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
    const missing: string[] = []
    const need = (name: string) => {
        const value = env[name]?.trim()
        if (!value) missing.push(name)
        return value ?? ''
    }
    const convexUrl = need('OPENBOTS_CONVEX_URL')
    const token = need('OPENBOTS_TOKEN')
    const transport = (env.OPENBOTS_TRANSPORT?.trim() || (platform() === 'darwin' ? 'mac' : 'relay')) as Settings['transport']
    if (transport !== 'mac' && transport !== 'relay') throw new Error('OPENBOTS_TRANSPORT must be "mac" or "relay"')

    const relay =
        transport === 'relay'
            ? {
                  host: env.OPENBOTS_RELAY_HOST?.trim() || '127.0.0.1',
                  port: Number(env.OPENBOTS_RELAY_PORT || 8787),
                  inboundSecret: need('OPENBOTS_INBOUND_SECRET'),
                  relayUrl: need('OPENBOTS_RELAY_URL'),
                  relaySecret: env.OPENBOTS_RELAY_SECRET?.trim() || undefined,
              }
            : undefined
    if (relay && relay.inboundSecret && relay.inboundSecret.length < 16) throw new Error('OPENBOTS_INBOUND_SECRET should be at least 16 characters')
    if (missing.length) throw new Error(`Set ${missing.join(', ')} (see runner/README.md)`)

    const keys = Object.fromEntries(Object.entries(PROVIDER_KEYS).flatMap(([provider, name]) => (env[name]?.trim() ? [[provider, env[name]!.trim()]] : [])))
    const localUrl = env.OPENBOTS_LOCAL_URL?.trim()
    const localModel = env.OPENBOTS_LOCAL_MODEL?.trim()
    return {
        convexUrl,
        token,
        dataDir: env.OPENBOTS_DATA_DIR?.trim() || join(homedir(), '.openbots'),
        transport,
        relay,
        brains: {
            keys,
            local: localUrl && localModel ? { url: localUrl, model: localModel, key: env.OPENBOTS_LOCAL_KEY?.trim() || undefined } : undefined,
            demo: env.OPENBOTS_DEMO === 'true',
        },
    }
}
