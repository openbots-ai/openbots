// Downloads Cloudflare's tunnel (cloudflared) for the installers being built on this machine, so the app can give
// the engine a public address for Twilio and Sendblue without anyone setting one up. A pinned release, checked
// against the SHA-256 GitHub publishes for each file: a different file fails the build.
//
//   node scripts/fetch-cloudflared.mjs            both architectures for this platform
//   node scripts/fetch-cloudflared.mjs linux x64  one
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '2026.10.0'
// electron-builder's ${os}-${arch} → the release file and its sha256. Windows on Arm runs the x64 build.
const FILES = {
    'mac-arm64': ['cloudflared-darwin-arm64.tgz', 'a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70'],
    'mac-x64': ['cloudflared-darwin-amd64.tgz', '903845b81828c8cb3c5d13d816a2de71c06a3da5785469df8eb0e1b736d92f9f'],
    'win-x64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
    'win-arm64': ['cloudflared-windows-amd64.exe', '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c'],
    'linux-x64': ['cloudflared-linux-amd64', 'd33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db'],
    'linux-arm64': ['cloudflared-linux-arm64', 'e6422b9d4f72d3194bc5a38676f13667c06666523217b842a877d72a80b5ac08'],
}

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'build', 'cloudflared')
const os = process.argv[2] ?? { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform]
const arches = process.argv[3] ? [process.argv[3]] : ['x64', 'arm64']

for (const arch of arches) {
    const key = `${os}-${arch}`
    const [file, sha256] = FILES[key] ?? []
    if (!file) throw new Error(`No cloudflared for ${key}`)
    const dir = join(out, key)
    const bin = join(dir, os === 'win' ? 'cloudflared.exe' : 'cloudflared')
    if (existsSync(bin) && readFileSync(join(dir, 'version'), 'utf8').trim() === VERSION) continue
    const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/${file}`)
    if (!res.ok) throw new Error(`Couldn't download ${file}: ${res.status}`)
    const data = Buffer.from(await res.arrayBuffer())
    const got = createHash('sha256').update(data).digest('hex')
    if (got !== sha256) throw new Error(`${file} doesn't match its published checksum (got ${got})`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    if (file.endsWith('.tgz')) {
        writeFileSync(join(dir, file), data)
        execFileSync('tar', ['-xzf', file], { cwd: dir })
        rmSync(join(dir, file))
    } else writeFileSync(bin, data)
    chmodSync(bin, 0o755)
    writeFileSync(join(dir, 'version'), VERSION)
    console.log(`cloudflared ${VERSION} for ${key} → ${bin}`)
}

// cloudflared is Apache-2.0: its license ships with the app
const license = join(out, 'LICENSE')
if (!existsSync(license)) {
    const res = await fetch(`https://raw.githubusercontent.com/cloudflare/cloudflared/${VERSION}/LICENSE`)
    if (!res.ok) throw new Error(`Couldn't download cloudflared's license: ${res.status}`)
    writeFileSync(license, await res.text())
}
