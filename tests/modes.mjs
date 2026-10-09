import { chromium } from 'playwright';
const base = process.argv[2];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const routes = ['/', '/about/', '/patients/', '/news/', '/tours/', '/gallery/', '/contacts/', '/privacy/', '/404.html'];
const run = async (label, ctxOpts, init) => {
  const ctx = await b.newContext(ctxOpts);
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const bad = [];
  for (const r of routes) {
    await p.goto(base + r); await p.waitForTimeout(r === '/tours/' ? 1500 : 300);
    const m = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (m[0] > m[1]) bad.push(`${r} ${m[0]}>${m[1]}`);
  }
  console.log(`${label}: ${bad.length ? bad.join(', ') : 'нет горизонтального скролла'}`);
  await ctx.close();
};
const prefs = () => localStorage.setItem('rssmp-display', JSON.stringify({ large: true, contrast: true, motion: true }));
await run('360px, увеличенный текст + контраст', { viewport: { width: 360, height: 800 }, isMobile: true }, prefs);
await run('1366px, увеличенный текст + контраст', { viewport: { width: 1366, height: 768 } }, prefs);
// 200% browser zoom on a 1280 px window ≈ 640 CSS px viewport at DPR 2
await run('масштаб 200% (1280 окно → 640 CSS px)', { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
await run('масштаб 200% + увеличенный текст', { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }, prefs);
await b.close();
