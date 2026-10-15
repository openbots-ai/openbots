import { describe, expect, it } from 'vitest'
import { setupSteps } from './setup-steps'

const URL = 'https://posh-wildcat-504.convex.cloud'
const ENGINE = 'https://www.getopenbots.com/engine/openbots-engine.mjs'

describe('starting the engine', () => {
    it('gives Windows PowerShell commands with the token filled in', () => {
        const s = setupSteps('windows', 'obr_abc', URL, ENGINE)
        expect(s.tunnel).toBe('winget install --id Cloudflare.cloudflared')
        expect(s.start.split('\n')).toEqual([
            'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
            `curl.exe -L -o openbots-engine.mjs ${ENGINE}`,
            `$env:OPENBOTS_CONVEX_URL = "${URL}"`,
            '$env:OPENBOTS_TOKEN = "obr_abc"',
            '$env:OPENBOTS_TUNNEL = "true"',
            'node openbots-engine.mjs',
        ])
    })

    it('gives Mac and Linux shell commands, with Linux pointing at its downloaded tunnel', () => {
        const mac = setupSteps('mac', 'obr_abc', URL, ENGINE)
        expect(mac.tunnel).toBe('brew install cloudflared')
        expect(mac.start).toContain('OPENBOTS_TOKEN=obr_abc \\\nOPENBOTS_TUNNEL=true \\\nnode openbots-engine.mjs')
        expect(mac.start).not.toContain('OPENBOTS_CLOUDFLARED')
        const linux = setupSteps('linux', 'obr_abc', URL, ENGINE)
        expect(linux.start).toContain('OPENBOTS_CLOUDFLARED=~/openbots-cloudflared \\')
        expect(linux.tunnel).toContain('chmod +x ~/openbots-cloudflared')
    })

    it('never mentions the npm package or Docker image that were never published', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) {
            const s = setupSteps(system, 't', URL, ENGINE)
            expect(`${s.tunnel}\n${s.start}`).not.toMatch(/npx openbots-runner|ghcr\.io/)
        }
    })
})
