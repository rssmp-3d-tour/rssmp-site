// Continuous equipment cards: contents, class filters, images, focus and a11y.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.argv[2];
if (!base) throw new Error('Usage: node equipment.mjs BASE_URL');
const browser = await chromium.launch();
const sizes = [[320, 568], [390, 844], [768, 1024], [844, 390], [1366, 768]];
const originals = ['medprom-aivl', 'axion-apex', 'armed-7d', 'onetouch-verio-reflect'];
const noPhoto = new Set(['ecg-inventory', 'stationary-safe', 'vacuum-mattress']);
const casePhotos = { 'lifepak-1000': 'b-22.webp', 'cardiometer-mt': 'b-12-case.webp' };
const sections = ['Вспомнить за 10 секунд', 'Органы управления и комплект', 'Перед работой', 'Порядок действий', 'Что контролировать', 'Не пропустить', 'После применения'];
const stationTextBlocks = {
  'resuscitation-kit': 44, 'obstetric-kit': 18, 'infusion-thermocontainer': 9,
  'portable-oxygen-rik': 18, 'foot-suction': 17, 'aspirator-inventory': 7,
  'stationary-safe': 1, 'axion-ecg': 26, 'cardiometer-mt': 12,
  'vacuum-mattress': 20, 'lifepak-1000': 17
};
let checked = 0;
function check(ok, message) { if (!ok) throw new Error(message); checked++; }
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, bypassCSP: true, isMobile: width < 800, hasTouch: width < 800 });
    const page = await context.newPage();
    const errors = [], images = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/assets\/(tour-)?equipment\//.test(request.url())) images.push(request.url()); });
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : getContext.call(this, kind, ...rest); };
    });
    await page.goto(base + '/tours/');
    check(images.length === 0, `${width}px: equipment images loaded before opening`);
    await page.locator('[data-fallback-equipment]').click();
    const dialog = page.locator('[data-equipment-dialog]');
    check(await dialog.isVisible(), `${width}px: catalogue unavailable without WebGL`);
    check(await page.locator('[data-equipment-id]').count() === 20, `${width}px: expected 20 catalogue records`);
    for (const [filter, count] of [['b', 12], ['c', 4], ['pending', 6], ['all', 20]]) {
      await page.locator(`[data-equipment-filter="${filter}"]`).click();
      check(await page.locator('[data-equipment-id]').count() === count, `${width}px: incorrect ${filter} membership`);
      check(await page.locator('[data-equipment-filter][aria-pressed="true"]').count() === 1, `${width}px: filter state ambiguous`);
    }
    await page.addScriptTag({ content: axeSource });
    const catalogAxe = await page.evaluate(async () => (await axe.run(document.querySelector('[data-equipment-dialog]'))).violations.map(v => v.id));
    check(catalogAxe.length === 0, `${width}px: catalogue axe ${catalogAxe.join(', ')}`);
    const ids = await page.locator('[data-equipment-id]').evaluateAll(nodes => nodes.map(node => node.dataset.equipmentId));
    for (const id of ids) {
      await page.locator(`[data-equipment-id="${id}"]`).click();
      check(await page.locator('[data-equipment-reference]').isVisible(), `${width}px ${id}: card did not open`);
      check(!await page.locator('[data-equipment-catalog]').isVisible(), `${width}px ${id}: catalogue remains visible`);
      const headings = await page.locator('[data-equipment-sections] h3').allTextContents();
      if (Object.hasOwn(stationTextBlocks, id)) {
        const fullText = page.locator('.tour-equipment-reading h3, .tour-equipment-reading p, .tour-equipment-reading li');
        check(await fullText.count() === stationTextBlocks[id], `${width}px ${id}: incomplete station text`);
      }
      if (originals.includes(id)) {
        check(JSON.stringify(headings) === JSON.stringify(sections), `${width}px ${id}: missing continuous section`);
        check(await page.locator('[data-equipment-sections] li').count() >= 20, `${width}px ${id}: material lost`);
      }
      check(await page.locator('[data-equipment-reference] [role="tab"], [data-equipment-reference] [role="tabpanel"], [data-equipment-poster]').count() === 0, `${width}px ${id}: tabs or original poster remain`);
      const hasImage = !noPhoto.has(id);
      check(await page.locator('[data-equipment-visual]').isVisible() === hasImage, `${width}px ${id}: wrong image state`);
      if (hasImage) {
        await page.locator('[data-equipment-image]').evaluate(img => img.complete && img.naturalWidth ? true : new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', () => reject(new Error('Image failed to load')), { once: true });
        }));
        const imagePath = new URL(await page.locator('[data-equipment-image]').getAttribute('src'), base).pathname;
        check(/\/assets\/(equipment\/.+cutout|tour-equipment\/b-\d+)\.webp$/.test(imagePath), `${width}px ${id}: wrong asset`);
      } else check(!await page.locator('[data-equipment-image]').getAttribute('src'), `${width}px ${id}: stale image from another model`);
      const caseFigure = page.locator('[data-equipment-case]');
      const caseImage = caseFigure.locator('img');
      if (casePhotos[id]) {
        const casePath = new URL(await caseImage.getAttribute('src'), base).pathname;
        check(await caseFigure.isVisible() && casePath.endsWith(`/${casePhotos[id]}`), `${width}px ${id}: incorrect transport case photo`);
      } else {
        check(!await caseFigure.isVisible() && !await caseImage.getAttribute('src'), `${width}px ${id}: stale transport case photo`);
      }
      if (id === 'resuscitation-kit') {
        check(headings.length === 7 && (await page.locator('[data-equipment-sections] li').count()) === 36, `${width}px: incomplete resuscitation kit`);
      }
      if (id === 'obstetric-kit') {
        check(headings[0] === 'Наименование и Количество' && (await page.locator('[data-equipment-sections] li').count()) === 16, `${width}px: incomplete obstetric kit`);
      }
      const source = page.locator('[data-equipment-manual]');
      const sourceNote = page.locator('[data-equipment-source-note]');
      const needsSourceNote = ['axion-apex', 'axion-ecg', 'armed-7d', 'armed-linz-6-b', 'onetouch-verio-reflect', 'portable-oxygen-rik'].includes(id);
      check(await sourceNote.isVisible() === needsSourceNote, `${width}px ${id}: missing or stale document notice`);
      if (['axion-apex', 'ecg-inventory', 'portable-oxygen-rik', 'foot-suction', 'stationary-safe'].includes(id)) {
        check(!await source.isVisible() && !await source.getAttribute('href'), `${width}px ${id}: previous model's document remains linked`);
      }
      if (['armed-7d', 'armed-linz-6-b'].includes(id)) {
        check(await source.getAttribute('href') === 'https://www.armed.ru/service' && /Сервис ARMED/.test(await source.textContent()), `${width}px ${id}: service page presented as a manual`);
      }
      if (id === 'onetouch-verio-reflect') {
        check(await source.getAttribute('href') === 'https://svami.onetouch.ru/about/product/g_verio_reflect' && /страница модели/.test(await source.textContent()), `${width}px ${id}: obsolete PDF or misleading source label`);
      }
      check(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px ${id}: horizontal overflow`);
      const hash = await page.evaluate(() => location.hash);
      await page.keyboard.press('ArrowDown');
      check(await page.evaluate(() => location.hash) === hash, `${width}px ${id}: arrow changed the tour behind the card`);
      await page.locator('[data-equipment-back]').click();
      check(await page.locator(`[data-equipment-id="${id}"]`).evaluate(el => el === document.activeElement), `${width}px ${id}: focus not restored to catalogue row`);
    }
    await page.locator('[data-equipment-id="medprom-aivl"]').click();
    const cardAxe = await page.evaluate(async () => (await axe.run(document.querySelector('[data-equipment-dialog]'))).violations.map(v => v.id));
    check(cardAxe.length === 0, `${width}px: card axe ${cardAxe.join(', ')}`);
    await page.locator('[data-equipment-dialog]').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('[data-equipment-next]').click();
    check(await dialog.evaluate(el => el.scrollTop) === 0, `${width}px: next card starts at old scroll position`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    check(await page.locator('[data-fallback-equipment]').evaluate(el => el === document.activeElement), `${width}px: close did not restore focus`);
    check(!await page.evaluate(() => document.documentElement.classList.contains('equipment-open')), `${width}px: page scroll remains locked`);
    check(errors.length === 0, `${width}px: JS errors ${errors.join('; ')}`);
    console.log(`OK — equipment: ${width}×${height}, 20 records, filters, keyboard, images, axe`);
    await context.close();
  }
  console.log(`Equipment: ${checked}/${checked} checks passed`);
} finally { await browser.close(); }
