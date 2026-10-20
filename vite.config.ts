import { execFile } from 'node:child_process'
import path from 'node:path'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'
import { defineConfig, type Plugin } from 'vite'

// The dashboard's start commands download /engine/openbots-engine.mjs, which `npm run build` makes. So that `npm run
// dev` serves it too, the dev server builds the engine when it starts (in the background; Connections says so until
// it's there).
const engineForDev = (): Plugin => ({
  name: 'openbots-engine-dev',
  apply: (_, env) => env.command === 'serve' && !process.env.VITEST,
  configureServer() {
    execFile(process.execPath, [path.resolve(__dirname, 'runner/build.mjs')], (error, _out, stderr) => {
      if (error) console.warn(`Couldn't build the engine for /engine/openbots-engine.mjs: ${stderr || error.message}`)
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    engineForDev(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@convex': path.resolve(__dirname, './convex'),
    },
  },
  // Agent worktrees under .claude/ carry their own copies of the tests
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
})
