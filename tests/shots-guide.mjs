// Visual check of the guided tour and of the card framing (not part of run-all).
import { chromium } from 'playwright';
const [base, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h, mobile] of [[1366, 768, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/tours/');
  await p.waitForTimeout(2400);
  await p.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await p.locator('[data-hotspot-list] button').nth(1).click();
  await p.waitForTimeout(1400);
  await p.locator('[data-tour-viewer]').screenshot({ path: `${out}/card-${w}.png` });
  await p.keyboard.press('Escape');
  await p.click('[data-guide]');
  await p.waitForTimeout(3500);
  await p.locator('[data-tour-viewer]').screenshot({ path: `${out}/guide-${w}.png` });
  const st = await p.evaluate(() => [document.querySelector('[data-guide]').getAttribute('aria-pressed'), document.querySelector('[data-card-index]').textContent, document.querySelector('[data-card-title]').textContent, location.hash]);
  console.log(w, st.join(' | '), 'errors:', errors.join(' | ') || 'none');
  await ctx.close();
}
await b.close();
