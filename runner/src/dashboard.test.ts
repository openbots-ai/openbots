// @vitest-environment node
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { newEngineKeys, seal, sealContext } from '../../convex/lib/sealed'
import { loadSettings, openDashboard, resolveMac, withDashboard } from './config'
import { loadEngineKeys } from './identity'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENAI_API_KEY: 'sk-env', OPENBOTS_MAC: 'false' }
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('keys from the dashboard', () => {
    it('beat environment variables, and removing them falls back', () => {
        const base = loadSettings(ENV)
        const merged = withDashboard(base, { publicUrl: 'https://bots.example.com/', secrets: { openai: { apiKey: 'sk-dash' }, twilio: { accountSid: 'AC1', authToken: 't' } } })
        expect(merged.brains.keys.openai).toBe('sk-dash')
        expect(merged.twilio).toEqual({ accountSid: 'AC1', authToken: 't' })
        expect(merged.publicUrl).toBe('https://bots.example.com')
        expect(withDashboard(base, { secrets: {} }).brains.keys.openai).toBe('sk-env')
    })

    it('starts with no texting channel and no public URL instead of refusing', () => {
        const base = loadSettings({ ...ENV, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' })
        expect(base.publicUrl).toBeUndefined()
        expect(base.twilio).toBeDefined()
    })

    it('keeps Messages on for a Mac until another way to text can actually start', () => {
        const twilio = { accountSid: 'AC1', authToken: 't' }
        expect(resolveMac({ twilio }, 'darwin')).toBe(true) // no public URL: Twilio can't start
        expect(resolveMac({ twilio, publicUrl: 'https://bots.example.com' }, 'darwin')).toBe(false)
        expect(resolveMac({ relay: { inboundSecret: 'x'.repeat(16), relayUrl: 'https://relay' } }, 'darwin')).toBe(false)
        expect(resolveMac({ macSetting: true, twilio, publicUrl: 'https://bots.example.com' }, 'darwin')).toBe(true)
        expect(resolveMac({}, 'linux')).toBe(false)
    })

    it('opens what was locked for this engine and reports what it can’t', async () => {
        const keys = await newEngineKeys()
        const doc = {
            workspaceId: 'ws1',
            runnerId: 'r1',
            secrets: [
                { service: 'anthropic' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r1', 'anthropic'), { apiKey: 'sk-ant' }) },
                // Locked for another engine
                { service: 'openai' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r2', 'openai'), { apiKey: 'sk-1' }) },
                // Missing a field
                { service: 'resend' as const, sealed: await seal(keys.publicKey, sealContext('ws1', 'r1', 'resend'), { apiKey: 're_1' }) },
            ],
        }
        const { values, problems } = await openDashboard(keys.privateKey, doc)
        expect(values.secrets).toEqual({ anthropic: { apiKey: 'sk-ant' } })
        expect(problems).toEqual([
            { service: 'openai', error: expect.stringMatching(/enter it again/) },
            { service: 'resend', error: expect.stringMatching(/From address is missing/) },
        ])
    })

    it('makes its key pair once and keeps it private', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'engine-'))
        dirs.push(dir)
        const first = await loadEngineKeys(dir)
        expect(await loadEngineKeys(dir)).toEqual(first)
        expect(statSync(join(dir, 'engine-key.json')).mode & 0o777).toBe(0o600)
    })
})
