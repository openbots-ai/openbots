import { describe, expect, it } from 'vitest'
import { setupSteps, thisSystem } from './setup-steps'

const URL = 'https://example-123.convex.cloud'
const ENGINE = 'https://www.getopenbots.com/engine/openbots-engine.mjs'

describe('starting the engine', () => {
    it('gives Windows PowerShell commands', () => {
        expect(setupSteps('windows', URL, ENGINE).start.split('\n')).toEqual([
            'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
            `curl.exe -fL -o openbots-engine.mjs ${ENGINE}`,
            `$env:OPENBOTS_CONVEX_URL = "${URL}"`,
            'node openbots-engine.mjs',
        ])
    })

    it('gives Mac and Linux shell commands', () => {
        for (const system of ['mac', 'linux'] as const)
            expect(setupSteps(system, URL, ENGINE).start).toBe(`mkdir -p ~/openbots && cd ~/openbots\ncurl -fL -o openbots-engine.mjs ${ENGINE}\nOPENBOTS_CONVEX_URL=${URL} \\\nnode openbots-engine.mjs`)
    })

    it('needs nothing else installed: the engine fetches the tunnel itself', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) expect(setupSteps(system, URL, ENGINE).start).not.toMatch(/cloudflared|OPENBOTS_TUNNEL|winget|brew/)
    })

    it('never puts the token on the command line, where shell history would keep it', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) expect(setupSteps(system, URL, ENGINE).start).not.toMatch(/OPENBOTS_TOKEN|obr_/)
    })

    it('never mentions the npm package or Docker image that were never published', () => {
        for (const system of ['windows', 'mac', 'linux'] as const) expect(setupSteps(system, URL, ENGINE).start).not.toMatch(/npx openbots-runner|ghcr\.io/)
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
