// A small client for Orgo (docs.orgo.ai), the always-on cloud computers an account can run its engine on. Every call
// uses the account's own Orgo API key; Orgo bills that account for the computer.

export const ORGO_API = 'https://www.orgo.ai/api'

// A problem the user can fix (a rejected key, a plan limit), shown as-is in Connections. `status` is Orgo's HTTP
// status; 503 means the computer isn't reachable yet, which Orgo says is safe to retry.
export class OrgoError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

type Fetch = typeof fetch

const REASONS: Record<number, string> = {
    401: 'Orgo rejected this API key. Check it in Connections.',
    402: 'Your Orgo trial has ended. Choose a plan on orgo.ai, then try again.',
    403: 'Your Orgo plan doesn’t allow this computer. Check your plan’s limits on orgo.ai.',
    404: 'Orgo couldn’t find that computer. It may have been deleted on orgo.ai.',
}

export async function orgo<T>(apiKey: string, method: string, path: string, body?: unknown, fetchImpl: Fetch = fetch): Promise<T> {
    const res = await fetchImpl(`${ORGO_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new OrgoError(REASONS[res.status] ?? `Orgo answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, res.status)
    }
    return (res.status === 204 ? null : await res.json()) as T
}

type Workspace = { id: string; name: string }
type Computer = { id: string; status?: string }
export type BashResult = { output: string; exit_code: number }

// The Orgo workspace OpenBots keeps its computers in, made on first use
export async function openBotsWorkspace(apiKey: string, fetchImpl?: Fetch) {
    const listed = await orgo<Workspace[] | { workspaces?: Workspace[]; data?: Workspace[] }>(apiKey, 'GET', '/workspaces', undefined, fetchImpl)
    const all = Array.isArray(listed) ? listed : (listed.workspaces ?? listed.data ?? [])
    return all.find((w) => w.name === 'OpenBots') ?? (await orgo<Workspace>(apiKey, 'POST', '/workspaces', { name: 'OpenBots' }, fetchImpl))
}

export const createComputer = (apiKey: string, workspaceId: string, name: string, fetchImpl?: Fetch) =>
    orgo<Computer>(apiKey, 'POST', '/computers', { workspace_id: workspaceId, name, os: 'linux', ram: 8, cpu: 2 }, fetchImpl)

// Runs one command and waits for it (Orgo allows up to 300 seconds)
export const bash = (apiKey: string, computerId: string, command: string, timeout: number, fetchImpl?: Fetch) =>
    orgo<BashResult>(apiKey, 'POST', `/computers/${computerId}/bash`, { command, timeout }, fetchImpl)

export const startComputer = (apiKey: string, computerId: string, fetchImpl?: Fetch) => orgo(apiKey, 'POST', `/computers/${computerId}/start`, undefined, fetchImpl)
export const stopComputer = (apiKey: string, computerId: string, fetchImpl?: Fetch) => orgo(apiKey, 'POST', `/computers/${computerId}/stop`, undefined, fetchImpl)
export const deleteComputer = (apiKey: string, computerId: string, fetchImpl?: Fetch) => orgo(apiKey, 'DELETE', `/computers/${computerId}`, undefined, fetchImpl)

const NODE_VERSION = 'v24.11.0'
const DIR = '/opt/openbots'
// Shell-quoted for single-quoted strings
const q = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

export type Step = { name: string; command: string; timeout: number }

// What a new Orgo computer runs to become an engine. Every step is safe to run again, so Retry setup reruns them all.
// `sudo` is used only when the commands don't already run as root.
export function installSteps({ convexUrl, token, engineUrl }: { convexUrl: string; token: string; engineUrl: string }): Step[] {
    const root = `S=; [ "$(id -u)" = 0 ] || S=sudo; $S mkdir -p ${DIR} && $S chown "$(id -u):$(id -g)" ${DIR}`
    const env = [
        `OPENBOTS_CONVEX_URL=${convexUrl}`,
        `OPENBOTS_TOKEN=${token}`,
        'OPENBOTS_TUNNEL=true',
        `OPENBOTS_CLOUDFLARED=${DIR}/cloudflared`,
        'OPENBOTS_MAC=false',
        `OPENBOTS_DATA_DIR=${DIR}/data`,
    ].join('\n')
    return [
        {
            name: 'Saving the engine’s settings',
            command: `set -e; ${root}; umask 077; printf '%s\\n' ${q(env)} > ${DIR}/env`,
            timeout: 30,
        },
        {
            name: 'Installing Node.js',
            command: `set -e; ${root}; cd ${DIR}; [ -x node/bin/node ] && node/bin/node -v | grep -q '^${NODE_VERSION}$' && exit 0
case "$(uname -m)" in aarch64|arm64) A=arm64;; *) A=x64;; esac
curl -fsSL https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-$A.tar.gz | tar -xz
rm -rf node && mv node-${NODE_VERSION}-linux-$A node && node/bin/node -v`,
            timeout: 240,
        },
        {
            name: 'Installing the tunnel',
            command: `set -e; ${root}; cd ${DIR}
case "$(uname -m)" in aarch64|arm64) A=arm64;; *) A=amd64;; esac
curl -fsSL -o cloudflared.new https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$A
chmod +x cloudflared.new && mv cloudflared.new cloudflared && ./cloudflared --version`,
            timeout: 180,
        },
        {
            name: 'Installing the engine',
            command: `set -e; ${root}; cd ${DIR}; curl -fsSL -o engine.new.mjs ${q(engineUrl)} && mv engine.new.mjs engine.mjs && head -c 64 engine.mjs | grep -q node`,
            timeout: 120,
        },
        {
            name: 'Starting the engine',
            command: `set -e; ${root}; cd ${DIR}
cat > start.sh <<'EOF'
#!/bin/sh
set -a; . ${DIR}/env; set +a
exec ${DIR}/node/bin/node ${DIR}/engine.mjs
EOF
chmod +x start.sh
if [ -d /run/systemd/system ]; then
  $S tee /etc/systemd/system/openbots.service >/dev/null <<'EOF'
[Unit]
Description=OpenBots engine
After=network-online.target
[Service]
ExecStart=${DIR}/start.sh
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  $S systemctl daemon-reload && $S systemctl enable openbots >/dev/null 2>&1 && $S systemctl restart openbots
else
  cat > keep.sh <<'EOF'
#!/bin/sh
while true; do ${DIR}/start.sh >> ${DIR}/engine.log 2>&1; sleep 5; done
EOF
  chmod +x keep.sh
  [ -f keep.pid ] && kill "$(cat keep.pid)" 2>/dev/null || true
  pkill -f ${DIR}/engine.mjs 2>/dev/null || true
  nohup setsid ./keep.sh >/dev/null 2>&1 & echo $! > keep.pid
  if command -v crontab >/dev/null; then (crontab -l 2>/dev/null | grep -v keep.sh; echo "@reboot ${DIR}/keep.sh") | crontab -; fi
fi
sleep 8; pgrep -f ${DIR}/engine.mjs >/dev/null`,
            timeout: 60,
        },
    ]
}
