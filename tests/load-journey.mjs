import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const output = process.argv[2];
if (!output) throw Error('Usage: node load-journey.mjs OUTPUT.json');
const base = 'http://127.0.0.1:8124';
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const journeys = {};
try {
  for (const kind of ['desktop', 'mobile']) {
    const options = kind === 'mobile'
      ? {viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2}
      : {viewport:{width:1366,height:900}};
    const page = await browser.newPage({...options, reducedMotion:'reduce'});
    const failures = [], requests = new Map(), stages = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('requestfailed', req => {
      if (req.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(req.url()+' '+req.failure()?.errorText);
    });
    page.on('response', res => {
      if (!res.url().startsWith(base+'/')) return;
      if (res.status() >= 400) failures.push(res.url()+' '+res.status());
      requests.set(res.url().slice(base.length), Number(res.headers()['content-length'] || 0));
    });
    const record = async () => {
      await page.waitForLoadState('networkidle');
      stages.push([...requests.keys()].filter(path => !stages.flat().includes(path)));
    };
    await page.goto(base+'/');
    await record();
    await page.goto(base+'/tours/#b-interior');
    const points = page.locator('[data-hotspot-list] li:not(.is-transition) button');
    await points.nth(3).waitFor();
    await record();
    for (const [index, name, image] of [[3,/Реанимационный набор/,'b-4.webp'],[4,/Акушерский набор/,'b-5.webp']]) {
      await points.nth(index).click();
      assert.match(await page.locator('[data-card-title]').textContent(), name);
      const pointImage = page.locator('[data-card-photos] img');
      await pointImage.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('[data-card-photos] img')?.naturalWidth > 0);
      const src = await pointImage.getAttribute('src');
      assert.ok(new URL(src,base).pathname.endsWith('/'+image));
      await page.locator('[data-card-equipment]').click();
      await page.locator('.tour-equipment-reading').waitFor();
      assert.equal(await page.locator('[data-equipment-image]').getAttribute('src'),src);
      await record();
      await page.locator('[data-equipment-close]').click();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-vehicle="c"]').click();
    await page.waitForURL(/#c-/);
    await page.evaluate(() => { location.hash='c-interior'; });
    await page.waitForResponse(res => res.ok() && /tour-tiles\/[^/]*c-interior/.test(res.url()));
    await page.waitForFunction(() => location.hash === '#c-interior' &&
      document.querySelector('[data-scene-name]')?.textContent.includes('медицинский салон'));
    await record();
    assert.ok([...requests.keys()].some(path=>path.includes('tour-tiles/') && path.includes('c-interior')));
    assert.deepEqual(failures,[]);
    journeys[kind]=stages;
    console.log(kind, stages.map(stage=>stage.length).join('+'), 'requests by stage');
    await page.close();
  }
  fs.writeFileSync(output,JSON.stringify(journeys,null,2)+'\n');
} finally { await browser.close(); }
