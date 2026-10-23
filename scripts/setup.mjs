// Sets up a Convex deployment for OpenBots: generates the server's own secrets, asks for the Clerk Frontend API URL
// and stores them on the deployment,
// so nothing secret is ever written to a file or typed by hand. Users' own keys are saved in Connections (encrypted with
// ENCRYPTION_KEY) or set on their engine (runner/).
//
//   npm run setup            the dev deployment from `npx convex dev`
//   npm run setup -- --prod  the production deployment
//
// Safe to run again: it only fills in what's missing, and never replaces ENCRYPTION_KEY (the keys people saved in
// Connections are encrypted with it and could no longer be read).

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'

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

// Sign-in (Clerk): the Frontend API URL, so Convex trusts Clerk's tokens. It isn't secret, but it's asked for
// rather than generated.
if (existing.has('CLERK_JWT_ISSUER_DOMAIN')) console.log('  · CLERK_JWT_ISSUER_DOMAIN already set, kept')
else {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const domain = (await rl.question('  Clerk Frontend API URL (Clerk dashboard → Configure → API keys): ')).trim().replace(/\/+$/, '')
    rl.close()
    if (!/^https:\/\/\S+$/.test(domain)) {
        console.error('\nThat should look like https://your-app.clerk.accounts.dev. Run setup again when you have it.')
        process.exit(1)
    }
    if (convex(['env', 'set', 'CLERK_JWT_ISSUER_DOMAIN', '--', domain]) === null) {
        console.error('\nCould not set CLERK_JWT_ISSUER_DOMAIN.')
        process.exit(1)
    }
    console.log('  ✓ CLERK_JWT_ISSUER_DOMAIN stored')
}

console.log('\nDone. AI keys, texting accounts and email are saved by each person in Connections.')
