// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLOUDFLARED_VERSION, cloudflaredFile, ensureCloudflared } from './cloudflared'

const dirs: string[] = []
const dir = () => {
    const d = mkdtempSync(join(tmpdir(), 'openbots-cloudflared-'))
    dirs.push(d)
    return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe("Cloudflare's tunnel", () => {
    it('has a pinned build for the computers the engine runs on', () => {
        for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['win32', 'arm64'], ['linux', 'x64'], ['linux', 'arm64']])
            expect(cloudflaredFile(platform, arch)?.[1]).toMatch(/^[0-9a-f]{64}$/)
        expect(cloudflaredFile('linux', 'riscv64')).toBeUndefined()
    })

    it.skipIf(!cloudflaredFile())('refuses a download that doesn’t match its checksum, and saves nothing', async () => {
        const d = dir()
        await expect(ensureCloudflared(d, async () => Buffer.from('not cloudflared'))).rejects.toThrow(/checksum/)
        expect(existsSync(join(d, 'bin')) ? readdirSync(join(d, 'bin')) : []).toEqual([])
    })

    it.skipIf(!cloudflaredFile())('downloads only once', async () => {
        const d = dir()
        const bin = join(d, 'bin', `cloudflared-${CLOUDFLARED_VERSION}${process.platform === 'win32' ? '.exe' : ''}`)
        mkdirSync(join(d, 'bin'))
        writeFileSync(bin, '')
        const download = vi.fn()
        expect(await ensureCloudflared(d, download)).toBe(bin)
        expect(download).not.toHaveBeenCalled()
    })
})
