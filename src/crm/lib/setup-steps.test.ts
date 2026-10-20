import { describe, expect, it } from 'vitest'
import { setupSteps, thisSystem } from './setup-steps'

const URL = 'https://example-123.convex.cloud'
const ENGINE = 'https://www.getopenbots.com/engine/openbots-engine.mjs'

describe('starting the engine', () => {
    it('gives Windows PowerShell commands, reloading PATH so the new cloudflared is found', () => {
        const s = setupSteps('windows', URL, ENGINE, true)
        expect(s.tunnel.split('\n')[0]).toBe('winget install --id Cloudflare.cloudflared -e')
        expect(s.tunnel).toContain("$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine')")
        expect(s.start.split('\n')).toEqual([
            'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
            `curl.exe -fL -o openbots-engine.mjs ${ENGINE}`,
            `$env:OPENBOTS_CONVEX_URL = "${URL}"`,
            '$env:OPENBOTS_TUNNEL = "true"',
            'node openbots-engine.mjs',
        ])
    })

    it('gives Mac and Linux shell commands, with Linux pointing at its downloaded tunnel', () => {
        const mac = setupSteps('mac', URL, ENGINE, true)
        expect(mac.tunnel).toContain('command -v brew')
        expect(mac.tunnel).toContain('https://brew.sh')
        expect(mac.start).toContain(`OPENBOTS_CONVEX_URL=${URL} \\\nOPENBOTS_TUNNEL=true \\\nnode openbots-engine.mjs`)
        expect(mac.start).not.toContain('OPENBOTS_CLOUDFLARED')
        const linux = setupSteps('linux', URL, ENGINE, true)
        expect(linux.start).toContain('OPENBOTS_CLOUDFLARED=~/openbots-cloudflared \\')
        expect(linux.tunnel).toContain('chmod +x ~/openbots-cloudflared')
    })

    it('downloads cloudflared for the Linux machine’s own architecture', () => {
        const { tunnel } = setupSteps('linux', URL, ENGINE, true)
        expect(tunnel).toContain('aarch64|arm64) A=arm64')
        expect(tunnel).toContain('arm*) A=arm')
        expect(tunnel).toContain('cloudflared-linux-$A')
        expect(tunnel).not.toContain('cloudflared-linux-amd64')
    })

    it('leaves the tunnel out when no texting needs a public address', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) {
            const s = setupSteps(system, URL, ENGINE, false)
            expect(s.start).not.toMatch(/OPENBOTS_TUNNEL|OPENBOTS_CLOUDFLARED/)
        }
    })

    it('never puts the token on the command line, where shell history would keep it', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) {
            const s = setupSteps(system, URL, ENGINE, true)
            expect(`${s.tunnel}\n${s.start}`).not.toMatch(/OPENBOTS_TOKEN|obr_/)
        }
    })

    it('never mentions the npm package or Docker image that were never published', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) {
            const s = setupSteps(system, URL, ENGINE, true)
            expect(`${s.tunnel}\n${s.start}`).not.toMatch(/npx openbots-runner|ghcr\.io/)
        }
    })
})

describe("guessing the computer's system", () => {
    it('reads desktop browsers', () => {
        expect(thisSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('windows')
        expect(thisSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', 0)).toBe('mac')
        expect(thisSystem('Mozilla/5.0 (X11; Linux x86_64)', 0)).toBe('linux')
    })

    it("doesn't take an iPhone or iPad for a Mac", () => {
        expect(thisSystem('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 5)).not.toBe('mac')
        expect(thisSystem('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)', 5)).not.toBe('mac')
        // iPadOS asks for desktop sites as a Mac; its touch screen gives it away
        expect(thisSystem('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).not.toBe('mac')
        expect(thisSystem('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).not.toBe('linux')
    })
})
