import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Cloudflare's tunnel (cloudflared), fetched the first time the engine needs a public address, so nobody installs it
// by hand. A pinned release, checked against the SHA-256 GitHub publishes for each file: a different file is refused.

export const CLOUDFLARED_VERSION = '2026.10.0'
// platform-arch → the release file and its sha256. Windows on Arm runs the x64 build.
const FILES: Record<string, [string, string]> = {
    'darwin-arm64': ['cloudflared-darwin-arm64.tgz', 'a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70'],
    'darwin-x64': ['cloudflared-darwin-amd64.tgz', '903845b81828c8cb3c5d13d816a2de71c06a3da5785469df8eb0e1b736d92f9f'],
    'win32-x64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
    'win32-arm64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
    'linux-x64': ['cloudflared-linux-amd64', 'd33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db'],
    'linux-arm64': ['cloudflared-linux-arm64', 'e6422b9d4f72d3194bc5a38676f13667c06666523217b842a877d72a80b5ac08'],
}

export const cloudflaredFile = (platform: string = process.platform, arch: string = process.arch) => FILES[`${platform}-${arch}`]

// The path to a verified cloudflared in <dataDir>/bin, downloading it first if needed. On a system Cloudflare has
// no pinned build for here, `cloudflared` on the PATH.
export async function ensureCloudflared(dataDir: string, download: (url: string) => Promise<Buffer> = fetchFile) {
    const entry = cloudflaredFile()
    if (!entry) return 'cloudflared'
    const [file, sha256] = entry
    const dir = join(dataDir, 'bin')
    const bin = join(dir, `cloudflared-${CLOUDFLARED_VERSION}${process.platform === 'win32' ? '.exe' : ''}`)
    if (existsSync(bin)) return bin
    const data = await download(`https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${file}`)
    const got = createHash('sha256').update(data).digest('hex')
    if (got !== sha256) throw new Error(`The downloaded ${file} doesn't match its published checksum, so it wasn't used`)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    // Written next to its final name and moved there once complete, so a cut-off download is never run
    const part = `${bin}.part`
    if (file.endsWith('.tgz')) {
        const tmp = join(dir, `extract-${process.pid}`)
        rmSync(tmp, { recursive: true, force: true })
        mkdirSync(tmp)
        writeFileSync(join(tmp, file), data)
        execFileSync('tar', ['-xzf', file], { cwd: tmp })
        renameSync(join(tmp, 'cloudflared'), part)
        rmSync(tmp, { recursive: true, force: true })
    } else writeFileSync(part, data)
    chmodSync(part, 0o755)
    renameSync(part, bin)
    return bin
}

async function fetchFile(url: string) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Couldn't download Cloudflare's tunnel: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
}
