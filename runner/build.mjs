// Bundles the agent and the shared code it uses from convex/lib into runner/dist/main.mjs.
// Its two dependencies stay external and are installed from npm like any package.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

await build({
    entryPoints: [new URL('./src/main.ts', import.meta.url).pathname],
    outfile: new URL('./dist/main.mjs', import.meta.url).pathname,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: Object.keys(pkg.dependencies),
    define: { __VERSION__: JSON.stringify(pkg.version) },
    banner: { js: '#!/usr/bin/env node' },
    legalComments: 'none',
})
console.log(`Built openbots-runner ${pkg.version} → runner/dist/main.mjs`)
