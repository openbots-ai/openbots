// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSettings, withDashboard } from './config'
import { Vault } from './crypto'
import { Server } from './server'
import { buildServices, hookSecrets } from './services'
import { Store } from './store'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENBOTS_MAC: 'false' }
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

function deps() {
    const dir = mkdtempSync(join(tmpdir(), 'services-'))
    dirs.push(dir)
    const store = new Store(join(dir, 'db'), Vault.open(dir))
    return { server: new Server({ host: '127.0.0.1', port: 0 }), store, secrets: hookSecrets(store).secrets }
}

describe('texting services', () => {
    it('builds nothing, without failing, when nothing is set up', () => {
        const built = buildServices(loadSettings(ENV), deps())
        expect(built.transports).toEqual({})
        expect(built.problems).toEqual([])
    })

    it('waits for the tunnel when a webhook channel has no public URL yet, instead of starting it', () => {
        const settings = withDashboard(loadSettings(ENV), { secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeUndefined()
        expect(built.problems).toEqual([{ service: 'twilio', error: expect.stringMatching(/Cloudflare/) }])
        // With the tunnel turned off, it asks for a public URL
        const off = buildServices(withDashboard(loadSettings({ ...ENV, OPENBOTS_TUNNEL: 'false' }), { secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } }), deps())
        expect(off.problems).toEqual([{ service: 'twilio', error: expect.stringMatching(/public URL/) }])
    })

    it('starts it once the public URL is set', () => {
        const settings = withDashboard(loadSettings(ENV), { publicUrl: 'https://bots.example.com', secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeDefined()
        expect(built.twilio).toBe(built.transports.twilio)
        expect(built.problems).toEqual([])
    })

    it('gives each webhook channel its own secret, keeps them, and makes new ones when asked', () => {
        const dir = mkdtempSync(join(tmpdir(), 'services-'))
        dirs.push(dir)
        const store = new Store(join(dir, 'db'), Vault.open(dir))
        store.setMeta('hooks.secret', 'shared')
        const first = hookSecrets(store)
        expect(first.fresh).toBe(true)
        const { twilio, sendblue, bluebubbles, sendblueSigning } = first.secrets
        expect(new Set([twilio, sendblue, bluebubbles, sendblueSigning, 'shared']).size).toBe(5)
        // The secret every channel used to share is gone, and the new ones aren't stored readable
        expect(store.getMeta('hooks.secret')).toBeUndefined()
        expect(store.getMeta('hooks.twilio')).not.toBe(twilio)
        expect(hookSecrets(store)).toEqual({ secrets: first.secrets, fresh: false })
        const rotated = hookSecrets(store, true)
        expect(rotated.fresh).toBe(true)
        for (const k of ['twilio', 'sendblue', 'bluebubbles', 'sendblueSigning'] as const) expect(rotated.secrets[k]).not.toBe(first.secrets[k])
        expect(hookSecrets(store).secrets).toEqual(rotated.secrets)
    })

    it('puts each channel’s own secret in its webhook path', () => {
        const d = deps()
        const settings = withDashboard(loadSettings(ENV), { publicUrl: 'https://bots.example.com', secrets: { twilio: { accountSid: 'AC1', authToken: 't' }, bluebubbles: { serverUrl: 'http://mac.local:1234', password: 'p' } } })
        const built = buildServices(settings, d)
        expect(built.twilio?.hookUrl).toBe(`https://bots.example.com/hooks/twilio/${d.secrets.twilio}`)
        expect((built.transports.bluebubbles as unknown as { hookUrl: string }).hookUrl).toBe(`https://bots.example.com/hooks/bluebubbles/${d.secrets.bluebubbles}`)
    })
})
