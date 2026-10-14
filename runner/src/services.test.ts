// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSettings, withDashboard } from './config'
import { Vault } from './crypto'
import { Server } from './server'
import { buildServices } from './services'
import { Store } from './store'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENBOTS_MAC: 'false' }
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

function deps() {
    const dir = mkdtempSync(join(tmpdir(), 'services-'))
    dirs.push(dir)
    return { server: new Server({ host: '127.0.0.1', port: 0 }), store: new Store(join(dir, 'db'), Vault.open(dir)), secret: 's3cret' }
}

describe('texting services', () => {
    it('builds nothing, without failing, when nothing is set up', () => {
        const built = buildServices(loadSettings(ENV), deps())
        expect(built.transports).toEqual({})
        expect(built.problems).toEqual([])
    })

    it('reports a webhook channel without a public URL instead of starting it', () => {
        const settings = withDashboard(loadSettings(ENV), { secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeUndefined()
        expect(built.problems).toEqual([{ service: 'twilio', error: expect.stringMatching(/public URL/) }])
    })

    it('starts it once the public URL is set', () => {
        const settings = withDashboard(loadSettings(ENV), { publicUrl: 'https://bots.example.com', secrets: { twilio: { accountSid: 'AC1', authToken: 't' } } })
        const built = buildServices(settings, deps())
        expect(built.transports.twilio).toBeDefined()
        expect(built.twilio).toBe(built.transports.twilio)
        expect(built.problems).toEqual([])
    })
})
