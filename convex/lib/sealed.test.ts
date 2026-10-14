// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkFields, decryptSecret, encryptSecret, secretContext } from './sealed'

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const OTHER = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))

describe('account keys', () => {
    it('decrypts what was encrypted for this workspace and service, and hides the key', async () => {
        const context = secretContext('ws1', 'twilio')
        const sealed = await encryptSecret(KEY, context, { accountSid: 'AC-unique-1234', authToken: 'token-unique-5678' })
        expect(sealed.startsWith('k1:')).toBe(true)
        expect(sealed).not.toContain('AC-unique-1234')
        expect(sealed).not.toContain('token-unique-5678')
        expect(await decryptSecret(KEY, context, sealed)).toEqual({ accountSid: 'AC-unique-1234', authToken: 'token-unique-5678' })
    })

    it("won't decrypt a value moved to another workspace or service, or with another server key", async () => {
        const sealed = await encryptSecret(KEY, secretContext('ws1', 'openai'), { apiKey: 'sk-1' })
        await expect(decryptSecret(KEY, secretContext('ws2', 'openai'), sealed)).rejects.toThrow()
        await expect(decryptSecret(KEY, secretContext('ws1', 'anthropic'), sealed)).rejects.toThrow()
        await expect(decryptSecret(OTHER, secretContext('ws1', 'openai'), sealed)).rejects.toThrow()
        await expect(decryptSecret(KEY, secretContext('ws1', 'openai'), 'garbage')).rejects.toThrow(/Unreadable/)
    })

    it('refuses a server key of the wrong size', async () => {
        await expect(encryptSecret(btoa('short'), 'x', {})).rejects.toThrow(/32 bytes/)
    })

    it('checks and trims the fields each service needs', () => {
        expect(checkFields('sendblue', { keyId: ' id ', secret: 's' })).toEqual({ keyId: 'id', secret: 's' })
        expect(checkFields('local', { url: 'http://localhost:11434/v1', key: '' })).toEqual({ url: 'http://localhost:11434/v1' })
        expect(() => checkFields('twilio', { accountSid: 'AC1' })).toThrow(/Auth token is missing/)
        expect(() => checkFields('openai', null)).toThrow(/Unreadable/)
    })
})
