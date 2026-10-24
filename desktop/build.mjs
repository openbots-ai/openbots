// Bundles the app (main process and preload) and copies in the window, the icons and the engine. The engine is the
// same single file the website serves, built from runner/ (npm run runner:build at the repo root).
import { build } from 'esbuild'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(here, 'dist')

// Which OpenBots this app connects to: OPENBOTS_CONVEX_URL when set (CI), else the dashboard's .env.local
const fromEnvLocal = () => {
    const file = join(root, '.env.local')
    return existsSync(file) ? readFileSync(file, 'utf8').match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim() : undefined
}
const convexUrl = process.env.OPENBOTS_CONVEX_URL || fromEnvLocal()
if (!convexUrl) throw new Error('Set OPENBOTS_CONVEX_URL to your Convex deployment (https://<name>.convex.cloud)')
const siteUrl = process.env.OPENBOTS_SITE_URL || 'https://getopenbots.com'

const engine = join(root, 'public', 'engine', 'openbots-engine.mjs')
if (!existsSync(engine)) throw new Error('Build the engine first: npm run runner:build (at the repo root)')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'engine'), { recursive: true })
await build({
    entryPoints: { main: join(here, 'src', 'main.ts'), preload: join(here, 'src', 'preload.ts') },
    outdir: out,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron'],
    define: { __CONVEX_URL__: JSON.stringify(convexUrl), __SITE_URL__: JSON.stringify(siteUrl) },
    logLevel: 'warning',
})
cpSync(join(here, 'src', 'renderer'), join(out, 'renderer'), { recursive: true })
copyFileSync(join(root, 'public', 'icon-192.png'), join(out, 'renderer', 'logo.png'))
copyFileSync(join(root, 'public', 'icon-192.png'), join(out, 'tray.png'))
copyFileSync(engine, join(out, 'engine', 'openbots-engine.mjs'))
console.log(`Built the OpenBots app for ${convexUrl} → desktop/dist`)
