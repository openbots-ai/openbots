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

// The same engine with its dependencies inside, as one file the website serves at /engine/openbots-engine.mjs. Orgo
// computers download it during setup, so they need nothing but Node.js.
await build({
    entryPoints: [new URL('./src/main.ts', import.meta.url).pathname],
    outfile: new URL('../public/engine/openbots-engine.mjs', import.meta.url).pathname,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // Bundled CommonJS dependencies still call require(); give them one
    banner: { js: "#!/usr/bin/env node\nimport { createRequire as __openbotsRequire } from 'node:module'; const require = __openbotsRequire(import.meta.url);" },
    define: { __VERSION__: JSON.stringify(pkg.version) },
    legalComments: 'none',
})
console.log(`Built the standalone engine → public/engine/openbots-engine.mjs`)
