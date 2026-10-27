// node still.cjs 1.2 5.5 ...  -> out/still_<t>.png
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto('http://localhost:8123/index.html');
  await p.waitForFunction(() => window.__ready, null, { timeout: 15000 });
  console.log('total', await p.evaluate(() => window.__total));
  for (const t of process.argv.slice(2)) {
    await p.evaluate((t) => window.seek(+t), t);
    await p.waitForTimeout(60);
    await p.screenshot({ path: `out/still_${t}.png` });
  }
  await b.close();
})();
