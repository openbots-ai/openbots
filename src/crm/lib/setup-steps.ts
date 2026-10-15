// How to start the engine on each kind of computer: the commands shown once after adding one in Connections
export type System = 'windows' | 'mac' | 'linux'
export const SYSTEMS: { id: System; label: string }[] = [
    { id: 'windows', label: 'Windows' },
    { id: 'mac', label: 'Mac' },
    { id: 'linux', label: 'Linux' },
]
// The computer this browser is on is most likely the one being added
export const thisSystem = (): System => (/Windows/i.test(navigator.userAgent) ? 'windows' : /Mac/i.test(navigator.userAgent) ? 'mac' : 'linux')

export function setupSteps(system: System, token: string, convexUrl: string, engineUrl: string) {
    if (system === 'windows')
        return {
            shell: 'PowerShell',
            tunnel: 'winget install --id Cloudflare.cloudflared',
            start: [
                'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
                `curl.exe -L -o openbots-engine.mjs ${engineUrl}`,
                `$env:OPENBOTS_CONVEX_URL = "${convexUrl}"`,
                `$env:OPENBOTS_TOKEN = "${token}"`,
                '$env:OPENBOTS_TUNNEL = "true"',
                'node openbots-engine.mjs',
            ].join('\n'),
        }
    return {
        shell: 'Terminal',
        tunnel: system === 'mac' ? 'brew install cloudflared' : 'curl -L -o ~/openbots-cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/openbots-cloudflared',
        start: [
            'mkdir -p ~/openbots && cd ~/openbots',
            `curl -L -o openbots-engine.mjs ${engineUrl}`,
            `OPENBOTS_CONVEX_URL=${convexUrl} \\`,
            `OPENBOTS_TOKEN=${token} \\`,
            ...(system === 'linux' ? ['OPENBOTS_CLOUDFLARED=~/openbots-cloudflared \\'] : []),
            'OPENBOTS_TUNNEL=true \\',
            'node openbots-engine.mjs',
        ].join('\n'),
    }
}
