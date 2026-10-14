// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkFields, fingerprint, newEngineKeys, seal, sealContext, unseal } from './sealed'

describe('sealed keys', () => {
    it('opens what was locked for this engine and service', async () => {
        const keys = await newEngineKeys()
        const context = sealContext('ws1', 'r1', 'twilio')
        const sealed = await seal(keys.publicKey, context, { accountSid: 'AC1', authToken: 'tok' })
        expect(sealed.startsWith('s1:')).toBe(true)
        expect(sealed).not.toContain('tok')
        expect(await unseal(keys.privateKey, context, sealed)).toEqual({ accountSid: 'AC1', authToken: 'tok' })
    })

    it("won't open a value moved to another engine, service or workspace, or with another key", async () => {
        const keys = await newEngineKeys()
        const other = await newEngineKeys()
        const sealed = await seal(keys.publicKey, sealContext('ws1', 'r1', 'openai'), { apiKey: 'sk-1' })
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r2', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r1', 'anthropic'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws2', 'r1', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(other.privateKey, sealContext('ws1', 'r1', 'openai'), sealed)).rejects.toThrow()
        await expect(unseal(keys.privateKey, sealContext('ws1', 'r1', 'openai'), 'garbage')).rejects.toThrow(/Unreadable/)
    })

    it('gives the same short fingerprint for the same key', async () => {
        const keys = await newEngineKeys()
        const print = await fingerprint(keys.publicKey)
        expect(print).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/)
        expect(await fingerprint(keys.publicKey)).toBe(print)
    })

    it('checks and trims the fields each service needs', () => {
        expect(checkFields('bluebubbles', { serverUrl: ' http://mac:1234 ', password: 'pw' })).toEqual({ serverUrl: 'http://mac:1234', password: 'pw' })
        expect(checkFields('local', { url: 'http://localhost:11434/v1', key: '' })).toEqual({ url: 'http://localhost:11434/v1' })
        expect(() => checkFields('twilio', { accountSid: 'AC1' })).toThrow(/Auth token is missing/)
        expect(() => checkFields('openai', null)).toThrow(/Unreadable/)
    })
})
