// How to start the engine on each kind of computer: the commands Connections shows for adding one
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

const CLOUDFLARED_RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest'

// `tunnel`: the engine gets a public address from Cloudflare's quick tunnel (OPENBOTS_TUNNEL=true). Only Twilio and
// Sendblue need one, when the engine has no public URL of its own; Messages on a Mac and BlueBubbles don't.
// No token in these commands: the engine pairs on first start (it shows a code to approve in the dashboard) and keeps
// its own token where only you can read it. `siteUrl` is where that approval link points, when it isn't getopenbots.com.
export function setupSteps(system: System, convexUrl: string, engineUrl: string, tunnel: boolean, siteUrl?: string) {
    if (system === 'windows')
        return {
            shell: 'PowerShell',
            // winget puts cloudflared on the PATH for new windows; reloading it lets this one find it too
            tunnel: [
                'winget install --id Cloudflare.cloudflared -e',
                "$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')",
            ].join('\n'),
            start: [
                'mkdir -Force $HOME\\openbots | Out-Null; cd $HOME\\openbots',
                `curl.exe -fL -o openbots-engine.mjs ${engineUrl}`,
                `$env:OPENBOTS_CONVEX_URL = "${convexUrl}"`,
                ...(siteUrl ? [`$env:OPENBOTS_SITE_URL = "${siteUrl}"`] : []),
                ...(tunnel ? ['$env:OPENBOTS_TUNNEL = "true"'] : []),
                'node openbots-engine.mjs',
            ].join('\n'),
        }
    return {
        shell: 'Terminal',
        tunnel:
            system === 'mac'
                ? `if command -v brew >/dev/null; then brew install cloudflared; else echo "Homebrew isn't installed. Get it from https://brew.sh and run this again, or download cloudflared from ${CLOUDFLARED_RELEASES}"; fi`
                : [
                      // Cloudflare builds cloudflared for these Linux architectures
                      'case "$(uname -m)" in x86_64|amd64) A=amd64;; aarch64|arm64) A=arm64;; arm*) A=arm;; i?86) A=386;; *) A=;; esac',
                      `if [ -n "$A" ]; then curl -fL -o ~/openbots-cloudflared ${CLOUDFLARED_RELEASES}/download/cloudflared-linux-$A && chmod +x ~/openbots-cloudflared; else echo "There's no cloudflared download for $(uname -m). See ${CLOUDFLARED_RELEASES}"; fi`,
                  ].join('\n'),
        start: [
            'mkdir -p ~/openbots && cd ~/openbots',
            `curl -fL -o openbots-engine.mjs ${engineUrl}`,
            `OPENBOTS_CONVEX_URL=${convexUrl} \\`,
            ...(siteUrl ? [`OPENBOTS_SITE_URL=${siteUrl} \\`] : []),
            ...(tunnel && system === 'linux' ? ['OPENBOTS_CLOUDFLARED=~/openbots-cloudflared \\'] : []),
            ...(tunnel ? ['OPENBOTS_TUNNEL=true \\'] : []),
            'node openbots-engine.mjs',
        ].join('\n'),
    }
}

// The OpenBots app's installers, from the latest GitHub release of `repo` ("owner/name"). The names are fixed by
// desktop/electron-builder.yml, so these links always point at the newest version.
export function downloads(system: System, repo: string): { label: string; url: string }[] {
    const file = (name: string) => `https://github.com/${repo}/releases/latest/download/${name}`
    if (system === 'mac')
        return [
            { label: 'Download for Mac (Apple silicon)', url: file('OpenBots-mac-arm64.dmg') },
            { label: 'Intel Mac', url: file('OpenBots-mac-x64.dmg') },
        ]
    if (system === 'windows')
        return [
            { label: 'Download for Windows', url: file('OpenBots-win-x64.exe') },
            { label: 'Windows on Arm', url: file('OpenBots-win-arm64.exe') },
        ]
    return [
        { label: 'Download for Linux (AppImage)', url: file('OpenBots-linux-x86_64.AppImage') },
        { label: '.deb', url: file('OpenBots-linux-amd64.deb') },
        { label: 'Arm', url: file('OpenBots-linux-arm64.AppImage') },
    ]
}
