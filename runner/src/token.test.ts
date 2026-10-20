// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeTooOld, nodeVersionError } from './nodeVersion'
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
    it('prefers OPENBOTS_TOKEN, then the saved file', async () => {
        const d = dir()
        saveToken(d, TOKEN)
        expect(await findToken({ envToken: 'obr_env', dataDir: d })).toEqual({ token: 'obr_env', source: 'env' })
        expect(await findToken({ dataDir: d })).toEqual({ token: TOKEN, source: 'file' })
    })

    it('asks once, hidden, until a real token is pasted, and saves it where only you can read it', async () => {
        const d = dir()
        const ask = vi.fn().mockResolvedValueOnce('oops').mockResolvedValueOnce(`  ${TOKEN}  `)
        expect(await findToken({ dataDir: d, ask })).toEqual({ token: TOKEN, source: 'typed' })
        expect(ask).toHaveBeenCalledTimes(2)
        expect(readFileSync(tokenFile(d), 'utf8').trim()).toBe(TOKEN)
        if (process.platform !== 'win32') expect(statSync(tokenFile(d)).mode & 0o777).toBe(0o600)
    })

    it('says how to give it a token when there is no terminal to ask at', async () => {
        await expect(findToken({ dataDir: dir() })).rejects.toThrow(/OPENBOTS_TOKEN/)
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
