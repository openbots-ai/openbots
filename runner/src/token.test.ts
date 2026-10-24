// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeTooOld, nodeVersionError } from './nodeVersion'
import { pair, type PairLink } from './pair'
import { findToken, saveToken, tokenFile } from './token'

const TOKEN = 'obr_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
const dirs: string[] = []
const dir = () => {
    const d = mkdtempSync(join(tmpdir(), 'openbots-token-'))
    dirs.push(d)
    return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('the engine token', () => {
    it('prefers OPENBOTS_TOKEN, then the saved file, without pairing', async () => {
        const d = dir()
        saveToken(d, TOKEN)
        const pairNow = vi.fn()
        expect(await findToken({ envToken: 'obr_env', dataDir: d, pair: pairNow })).toEqual({ token: 'obr_env', source: 'env' })
        expect(await findToken({ dataDir: d, pair: pairNow })).toEqual({ token: TOKEN, source: 'file' })
        expect(pairNow).not.toHaveBeenCalled()
    })

    it('pairs when it has none, and saves the token where only you can read it', async () => {
        const d = dir()
        expect(await findToken({ dataDir: d, pair: async () => TOKEN })).toEqual({ token: TOKEN, source: 'paired' })
        expect(readFileSync(tokenFile(d), 'utf8').trim()).toBe(TOKEN)
        if (process.platform !== 'win32') expect(statSync(tokenFile(d)).mode & 0o777).toBe(0o600)
    })
})

describe('pairing', () => {
    it('sends only a hash, shows a link with the code, and makes a new code when one expires', async () => {
        const started: { tokenHash: string; name: string; os: string }[] = []
        const approvals = [false, true]
        const link: PairLink = {
            start: async (tokenHash, name, os) => {
                started.push({ tokenHash, name, os })
                return { code: started.length === 1 ? 'AAAA-BBBB' : 'CCCC-DDDD', expiresAt: 0 }
            },
            approved: async () => approvals.shift()!,
            close: async () => {},
        }
        const shown: string[] = []
        const token = await pair({ link, siteUrl: 'https://example.com/', name: 'Spare PC', os: 'windows', show: (p) => shown.push(p.url) })
        expect(token).toMatch(/^obr_/)
        expect(shown).toEqual(['https://example.com/dashboard?pair=AAAA-BBBB', 'https://example.com/dashboard?pair=CCCC-DDDD'])
        expect(started.map((s) => s.tokenHash)).toEqual([expect.stringMatching(/^[0-9a-f]{64}$/), expect.stringMatching(/^[0-9a-f]{64}$/)])
        // Each code gets its own token, and the token itself is never sent
        expect(started[0].tokenHash).not.toBe(started[1].tokenHash)
        expect(JSON.stringify(started)).not.toContain(token)
    })
})

describe('the Node.js version', () => {
    it('needs 22.13 or newer', () => {
        expect(nodeTooOld('20.18.0')).toBe(true)
        expect(nodeTooOld('22.12.0')).toBe(true)
        expect(nodeTooOld('v22.13.0')).toBe(false)
        expect(nodeTooOld('24.1.0')).toBe(false)
        expect(nodeVersionError('v20.18.0')).toMatch(/22\.13 or newer.*v20\.18\.0.*nodejs\.org/)
    })
})
