const { chromium } = require('playwright');
const opts = [
  ['1','Pulse','Electric-piano chords over a punchy kick','120 BPM|A minor|steady groove'],
  ['2','Sunrise','Fingerpicked guitar and marimba, bright and sunny','124 BPM|C major|optimistic'],
  ['3','Piano','Piano arpeggios and soft drums, calm and confident','110 BPM|F major|keynote feel'],
  ['4','Drive','Pumping sub bass and a four-on-the-floor kick','128 BPM|D minor|modern and energetic'],
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
