// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fromDashboard, loadSettings, resolveMac, withDashboard } from './config'

const ENV = { OPENBOTS_CONVEX_URL: 'https://x.convex.cloud', OPENBOTS_TOKEN: 'obr_x', OPENAI_API_KEY: 'sk-env', OPENBOTS_MAC: 'false' }

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

    it('takes the keys saved in Connections and passes on what the backend or a missing field reports', () => {
        const { values, problems } = fromDashboard({
            secrets: [
                { service: 'anthropic', fields: { apiKey: 'sk-ant' } },
                { service: 'resend', fields: { apiKey: 're_1' } },
            ],
            problems: [{ service: 'openai', error: 'The key saved in Connections can’t be read; save it again' }],
        })
        expect(values.secrets).toEqual({ anthropic: { apiKey: 'sk-ant' } })
        expect(problems).toEqual([
            { service: 'openai', error: expect.stringMatching(/save it again/) },
            { service: 'resend', error: expect.stringMatching(/From address is missing/) },
        ])
    })
})
