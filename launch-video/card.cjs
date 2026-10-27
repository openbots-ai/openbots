const { chromium } = require('playwright');
const opts = [
  ['5','Trap A','Dark and heavy: hard 808s, snapping clap, rolling hats, felted piano','140 BPM|D minor|hard, half-time'],
  ['6','Trap B','Bouncier: 808s, snare on 2 and 4, pluck and marimba top line','144 BPM|E minor|bounce'],
];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [n, name, desc, meta] of opts) {
    await p.goto(`http://localhost:8123/music-card.html?n=${n}&name=${name}&desc=${encodeURIComponent(desc)}&meta=${encodeURIComponent(meta)}`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: `out/card${n}.png` });
  }
  await b.close();
})();
