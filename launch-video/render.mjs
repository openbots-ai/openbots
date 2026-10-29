// Renders index.html to an MP4 frame by frame: node render.mjs [out.mp4] [--stills t1,t2,...]
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.dirname(new URL(import.meta.url).pathname)
const args = process.argv.slice(2)
const stillsArg = args.indexOf('--stills')
const cuesArg = args.indexOf('--cues')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + '?render')
await page.evaluate(() => document.fonts.ready)
const { fps, duration } = await page.evaluate(() => ({ fps: window.FPS, duration: window.DURATION }))

if (cuesArg >= 0) {
    // Sound-effect cue list for sfx.py
    const fs = await import('node:fs')
    fs.writeFileSync(args[cuesArg + 1], JSON.stringify(await page.evaluate(() => window.CUES)))
    console.log('wrote', args[cuesArg + 1])
} else if (stillsArg >= 0) {
    for (const t of args[stillsArg + 1].split(',').map(Number)) {
        await page.evaluate((f) => window.seek(f), Math.round(t * fps))
        await page.screenshot({ path: path.join(dir, `still-${t}.jpg`), quality: 80 })
    }
} else {
    const out = args[0] ?? path.join(dir, 'openbots-launch.mp4')
    const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
    const total = Math.round(duration * fps)
    for (let f = 0; f < total; f++) {
        await page.evaluate((n) => window.seek(n), f)
        const buf = await page.screenshot({ type: 'jpeg', quality: 95 })
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
        if (f % 150 === 0) console.log(`frame ${f}/${total}`)
    }
    ff.stdin.end()
    await new Promise((r) => ff.on('close', r))
    console.log('wrote', out)
}
await browser.close()
