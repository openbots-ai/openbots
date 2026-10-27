// node render.cjs [workers] -> out/frames/f_00001.jpg ... (30 fps), then encode.sh muxes them
const { chromium } = require('playwright');
const fs = require('fs');
const FPS = 30, W = +process.argv[2] || 4;
(async () => {
  fs.mkdirSync('out/frames', { recursive: true });
  const b = await chromium.launch();
  const probe = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await probe.goto('http://localhost:8123/index.html');
  await probe.waitForFunction(() => window.__ready);
  const total = await probe.evaluate(() => window.__total);
  const frames = Math.ceil(total * FPS);
  console.log('frames', frames, 'duration', total);
  await probe.close();
  let next = 0;
  const worker = async (id) => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto('http://localhost:8123/index.html');
    await p.waitForFunction(() => window.__ready);
    // each worker walks its own contiguous chunk in order so stateful tweens stay correct
    const per = Math.ceil(frames / W), a = id * per, e = Math.min(frames, a + per);
    for (let i = a; i < e; i++) {
      await p.evaluate((t) => window.seek(t), i / FPS);
      await p.screenshot({ path: `out/frames/f_${String(i + 1).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
      if (i % 120 === 0) console.log('worker', id, i);
    }
    await p.close();
  };
  await Promise.all([...Array(W).keys()].map(worker));
  await b.close();
  console.log('done');
})();
