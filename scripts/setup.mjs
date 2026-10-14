// Sets up a Convex deployment for OpenBots: generates the server's own secrets and stores them on the deployment,
// so nothing secret is ever written to a file or typed by hand. Users' own keys are saved in Connections (encrypted with
// ENCRYPTION_KEY) or set on their engine (runner/).
//
//   npm run setup            the dev deployment from `npx convex dev`
//   npm run setup -- --prod  the production deployment
//
// Safe to run again: it only fills in what's missing, and never replaces ENCRYPTION_KEY (the keys people saved in
// Connections are encrypted with it and could no longer be read).

import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'

const target = process.argv.slice(2)

// `env list` / `env set …`: the deployment flags (e.g. --prod) go right after the subcommand, before the values,
// since everything after `--` is read as a value
function convex([command, sub, ...rest], { quiet = false } = {}) {
    const res = spawnSync('npx', ['convex', command, sub, ...target, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (res.status !== 0) {
        if (!quiet) process.stderr.write(res.stderr || res.stdout)
        return null
    }
    return res.stdout
}

const listed = convex(['env', 'list'])
if (listed === null) {
    console.error('\nCould not read the deployment. Run `npx convex dev` once first (it logs in and creates one).')
    process.exit(1)
}
const existing = new Set(listed.split('\n').map((line) => line.split('=')[0].trim()).filter(Boolean))

const set = (name, value) => {
    if (convex(['env', 'set', name, '--', value]) === null) {
        console.error(`\nCould not set ${name}.`)
        process.exit(1)
    }
    console.log(`  ✓ ${name} generated and stored`)
}

console.log('Setting up OpenBots on this deployment…')

if (existing.has('ENCRYPTION_KEY')) console.log('  · ENCRYPTION_KEY already set, kept')
else set('ENCRYPTION_KEY', randomBytes(32).toString('base64'))

// Sign-in keys (Convex Auth): an RS256 pair. They belong together, so a half-set pair is replaced whole,
// which signs everyone out once.
if (existing.has('JWT_PRIVATE_KEY') && existing.has('JWKS')) console.log('  · Sign-in keys already set, kept')
else {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trimEnd().replace(/\n/g, ' ')
    const jwk = publicKey.export({ format: 'jwk' })
    set('JWT_PRIVATE_KEY', pem)
    set('JWKS', JSON.stringify({ keys: [{ use: 'sig', alg: 'RS256', ...jwk }] }))
}

console.log('\nDone. AI keys, texting accounts and email are saved by each person in Connections.')
