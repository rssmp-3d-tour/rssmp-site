// Visual check screenshots of /tours/ (not part of run-all).
import { chromium } from 'playwright';
const [base, out] = process.argv.slice(2);
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const b = await chromium.launch({ args });
for (const [w, h, mobile] of [[1366, 768, false], [1920, 1080, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '/tours/');
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${out}/page-${w}.png`, fullPage: true });
  await p.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await p.locator('[data-hotspot-list] button').nth(1).click();
  await p.waitForTimeout(1500);
  await p.locator('[data-tour-viewer]').screenshot({ path: `${out}/card-${w}.png` });
  await p.keyboard.press('Escape');
  await p.click('[data-view="interior"]');
  await p.waitForTimeout(1600);
  await p.locator('[data-tour-viewer]').hover();
  await p.locator('[data-tour-viewer]').screenshot({ path: `${out}/interior-${w}.png` });
  console.log(w, 'errors:', errors.join(' | ') || 'none');
  await ctx.close();
}
await b.close();
