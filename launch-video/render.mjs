// Renders index.html to an MP4 frame by frame: node render.mjs [out.mp4] [--4k] [--stills t1,t2,...]
// --4k draws every frame at twice the resolution (3840x2160) instead of upscaling, so text and UI stay sharp
// --polaroid uses the Polaroid look (index.html?polaroid)
// --workers N draws frames in N browsers at once (each on its own CPU core), then stitches them
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.dirname(new URL(import.meta.url).pathname)
const args = process.argv.slice(2)
const stillsArg = args.indexOf('--stills')
const cuesArg = args.indexOf('--cues')
const timelineArg = args.indexOf('--timeline')
const uhd = args.includes('--4k')
const query = '?render' + (args.includes('--polaroid') ? '&polaroid' : '')
const workersArg = args.indexOf('--workers')
const workers = workersArg >= 0 ? Number(args[workersArg + 1]) : 1
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: uhd ? 2 : 1 })
await page.goto(pathToFileURL(path.join(dir, 'index.html')).href + query)
await page.evaluate(() => document.fonts.ready)
const { fps, duration } = await page.evaluate(() => ({ fps: window.FPS, duration: window.DURATION }))

if (timelineArg >= 0) {
    // Scene starts and video length, for the audio scripts
    const fs = await import('node:fs')
    fs.writeFileSync(args[timelineArg + 1], JSON.stringify(await page.evaluate(() => ({ duration: window.DURATION, scenes: Object.fromEntries(SCENES.map(([id, a]) => [id, a])) }))))
    console.log('wrote', args[timelineArg + 1])
} else if (cuesArg >= 0) {
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
    const out = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--workers') ?? path.join(dir, uhd ? 'openbots-launch-4k.mp4' : 'openbots-launch.mp4')
    const total = Math.round(duration * fps)
    const encode = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', uhd ? '16' : '18', '-preset', 'medium', '-movflags', '+faststart', out]
    if (workers > 1) {
        // Each worker browser draws every Nth frame into a temp folder; then the frames are stitched in order
        const fs = await import('node:fs')
        const os = await import('node:os')
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'))
        let done = 0
        await Promise.all(Array.from({ length: workers }, async (_, w) => {
            const b = await chromium.launch()
            const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: uhd ? 2 : 1 })
            await pg.goto(pathToFileURL(path.join(dir, 'index.html')).href + query)
            await pg.evaluate(() => document.fonts.ready)
            for (let f = w; f < total; f += workers) {
                await pg.evaluate((n) => window.seek(n), f)
                await pg.screenshot({ path: path.join(tmp, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 })
                if (++done % 100 === 0) console.log(`frame ${done}/${total}`)
            }
            await b.close()
        }))
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(tmp, '%05d.jpg'), ...encode], { stdio: 'inherit' })
        await new Promise((r) => ff.on('close', r))
        fs.rmSync(tmp, { recursive: true, force: true })
    } else {
        const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...encode], { stdio: ['pipe', 'inherit', 'inherit'] })
        for (let f = 0; f < total; f++) {
            await page.evaluate((n) => window.seek(n), f)
            const buf = await page.screenshot({ type: 'jpeg', quality: 95 })
            if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
            if (f % 150 === 0) console.log(`frame ${f}/${total}`)
        }
        ff.stdin.end()
        await new Promise((r) => ff.on('close', r))
    }
    console.log('wrote', out)
}
await browser.close()
