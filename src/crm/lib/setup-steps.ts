// How to start the engine on each kind of computer: the commands shown once after adding one in Connections
export type System = 'windows' | 'mac' | 'linux'
export const SYSTEMS: { id: System; label: string }[] = [
    { id: 'windows', label: 'Windows' },
    { id: 'mac', label: 'Mac' },
    { id: 'linux', label: 'Linux' },
]

// The oldest Node.js the engine runs on (runner/package.json engines; the engine checks it when it starts)
export const MIN_NODE = '22.13'
export const NODE_URL = 'https://nodejs.org/en/download'

// The computer this browser is on is most likely the one being added. A phone or tablet isn't (iPhone and iPad
// browsers mention "Mac"), so those get Windows, the most common choice, until you pick.
export function thisSystem(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints ?? 0): System {
    if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'windows'
    if (/Windows/i.test(ua)) return 'windows'
    if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
    if (/Linux|X11|CrOS/i.test(ua)) return 'linux'
    return 'windows'
}

// The token is never in these commands, so shell history doesn't keep it: the engine asks for it on first start, with
// the input hidden, and saves it where only you can read it. Nothing else to install: when Twilio or Sendblue need to
// reach the engine, it fetches Cloudflare's tunnel itself (runner/src/cloudflared.ts).
export function setupSteps(system: System, convexUrl: string, engineUrl: string) {
    if (system === 'windows')
        return {
            shell: 'PowerShell',
            start: [
                'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
                `curl.exe -fL -o openbots-engine.mjs ${engineUrl}`,
                `$env:OPENBOTS_CONVEX_URL = "${convexUrl}"`,
                'node openbots-engine.mjs',
            ].join('\n'),
        }
    return {
        shell: 'Terminal',
        start: ['mkdir -p ~/openbots && cd ~/openbots', `curl -fL -o openbots-engine.mjs ${engineUrl}`, `OPENBOTS_CONVEX_URL=${convexUrl} \\`, 'node openbots-engine.mjs'].join('\n'),
    }
}
