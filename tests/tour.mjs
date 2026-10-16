// 3D/360 tour checks. Usage: node tour.mjs http://localhost:8082 [out-dir]
// A synthetic orientation pattern is substituted for the panorama only inside
// the test browser (route interception); site files are not changed.
// The tour has two modes (build_pages.py, TOUR_PANORAMAS): «demo» — one
// demonstration tour while classes B and C share the same panoramas; «vehicles» —
// B/C selector when separate shots are configured, with the station yard as the
// first scene when both classes have a yard panorama.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const base = process.argv[2];
const out = process.argv[3];
if (out) fs.mkdirSync(out, { recursive: true });
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const browser = await chromium.launch({ args });
const results = [];
const check = (id, name, ok, detail = '') => results.push({ id, name, ok: Boolean(ok), detail });
const tourHtml = await (await fetch(base + '/tours/')).text();
const MODE = tourHtml.match(/data-tour-mode="(demo|vehicles)"/)?.[1] || 'demo';
const HAS_YARD = /data-view="yard"/.test(tourHtml);
const expected = MODE === 'demo' ? { 'demo-exterior': 4, 'demo-interior': 7 }
  : { ...(HAS_YARD ? { 'b-yard': 6 } : {}), 'b-exterior': HAS_YARD ? 7 : 6, 'b-interior': HAS_YARD ? 23 : 22,
      ...(HAS_YARD ? { 'c-yard': 6 } : {}), 'c-exterior': HAS_YARD ? 7 : 6, 'c-interior': HAS_YARD ? 22 : 21 };
const TOTAL = Object.values(expected).reduce((a, b) => a + b, 0);
const [EXT, INT] = ['exterior', 'interior'].map(view => `${MODE === 'demo' ? 'demo' : 'b'}-${view}`);
// The scene the tour opens with: the yard when the tour has it, otherwise the exterior.
const FIRST = Object.keys(expected)[0];
// The panorama file attributes use b-* names in the demo mode as well.
const fileScene = scene => scene.replace(/^demo-/, 'b-');
const fileOf = scene => tourHtml.match(new RegExp(`data-panorama-${fileScene(scene)}="/assets/([^"?]+)`))?.[1];
const extFile = fileOf(EXT), firstFile = fileOf(FIRST);
const firstStem = firstFile.replace(/\.[a-z]+$/, '');
// Previews (<name>-preview.jpg) exist when make_panorama_variants.py prepared the panoramas.
const HAS_PREVIEW = new RegExp(`data-preview-${fileScene(FIRST)}=`).test(tourHtml);
// Tiles for Photo Sphere Viewer (make_panorama_variants.py): the engine loads only visible parts.
const tilesOf = scene => { const m = tourHtml.match(new RegExp(`data-tiles-${fileScene(scene)}="([^"]+)"`)); return m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null; };
const FIRST_TILES = tilesOf(FIRST);
const HAS_TILES = Boolean(FIRST_TILES);
const TILE_RE = /\/assets\/tour-tiles\/[^/]+\/(\d+)\/(\d+)_(\d+)\.jpg/;
// Flights to a point take up to 1.1 s; wait a little longer before checking the frame.
const FLIGHT = 1300;
console.log(`Режим тура: ${MODE}${HAS_YARD ? ' (с двором станции)' : ''}; сцен: ${Object.keys(expected).length}; точек: ${TOTAL}; превью: ${HAS_PREVIEW ? 'есть' : 'нет'}; тайлы: ${HAS_TILES ? 'есть' : 'нет'}`);

function stats(buffer) {
  const png = PNG.sync.read(buffer);
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < png.data.length; i += 16) { const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; sum += l; sq += l * l; n++; }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(sq / n - mean * mean), png };
}
const pixel = (png, fx, fy) => { const x = Math.round(fx * (png.width - 1)), y = Math.round(fy * (png.height - 1)), i = (y * png.width + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
function orientationPattern() {
  // 2:1 equirectangular: top half red, bottom half blue, green = horizontal position.
  const png = new PNG({ width: 512, height: 256 });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    png.data[i] = y < 128 ? 220 : 20; png.data[i + 1] = Math.round(x / 511 * 255); png.data[i + 2] = y < 128 ? 20 : 220; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function open(url, { viewport = { width: 1366, height: 768 }, mobile = false, init, routes } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  if (init) await page.addInitScript(init);
  if (routes) for (const [pattern, handler] of routes) await page.route(pattern, handler);
  await page.goto(base + url);
  await page.waitForTimeout(2200);
  return page;
}
const canvasShot = page => page.locator('[data-tour-viewer] canvas').screenshot();
// WebGL picture only: hotspots, HUD and other DOM overlays are hidden for the capture.
async function glShot(page) {
  // CSSOM changes are allowed by the strict CSP (a <style> element would be blocked).
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-tour-viewer] > :not(canvas):not([data-tour-stage])')) { el.dataset.glVis = el.style.visibility; el.style.visibility = 'hidden'; } });
  const shot = await page.locator('[data-tour-viewer] canvas').screenshot();
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-tour-viewer] > :not(canvas):not([data-tour-stage])')) { el.style.visibility = el.dataset.glVis || ''; delete el.dataset.glVis; } });
  return shot;
}
const sceneState = page => page.evaluate(() => ({
  hash: location.hash, name: document.querySelector('[data-scene-name]').textContent,
  loading: document.querySelector('[data-tour-viewer]').classList.contains('is-loading'),
  fallback: !document.querySelector('[data-tour-fallback]').hidden,
  hotspots: document.querySelectorAll('.tour-hotspot').length,
  visibleHotspots: [...document.querySelectorAll('.tour-hotspot')].filter(b => !b.hidden).length,
  view: document.querySelector('[data-view][aria-selected="true"]')?.dataset.view,
  vehicle: document.querySelector('[data-vehicle][aria-selected="true"]')?.dataset.vehicle
}));
// Loading time varies with software rendering: wait for the scene itself (at most 6 s), then for the picture to settle.
const sceneReady = (page, hash) => page.waitForFunction(h => location.hash === h && !document.querySelector('[data-tour-viewer]').matches('.is-loading, .is-switching, .is-approaching') && document.querySelectorAll('.tour-hotspot').length > 0, hash, { timeout: 6000 })
  .catch(() => {}).then(() => page.waitForTimeout(500));
const openMore = async page => {
  if (await page.getAttribute('[data-more]', 'aria-expanded') !== 'true') await page.click('[data-more]');
};

// T1 initial render, not black, no errors
{
  const page = await open('/tours/');
  const s = stats(await canvasShot(page));
  const st = await sceneState(page);
  if (out) await page.screenshot({ path: `${out}/tour-1366.png` });
  check('T1', 'Панорама загружается, не чёрная, без ошибок JS', s.mean > 25 && s.sd > 10 && !st.loading && !st.fallback && page.errors.length === 0, `mean=${s.mean.toFixed(1)} sd=${s.sd.toFixed(1)} errors=${page.errors}`);
  await page.context().close();
}

// T2 orientation with synthetic pattern
{
  const pattern = orientationPattern();
  // A tile gets its own part of the pattern: level width, columns and rows come from the page.
  const tileOfPattern = url => {
    const [, level, col, row] = url.match(TILE_RE).map(Number);
    const { width, cols, rows } = FIRST_TILES.levels[level];
    const size = width / cols, png = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = col * size + x, gy = row * size + y, i = (y * size + x) * 4, top = gy < width / 4;
      png.data[i] = top ? 220 : 20; png.data[i + 1] = Math.round(gx / (width - 1) * 255); png.data[i + 2] = top ? 20 : 220; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png);
  };
  // The view is set to yaw 0 by the link: the starting direction of a scene is chosen for its content.
  const page = await open(`/tours/#${FIRST}@0,0`, { routes: [[/\/assets\/tour-/, r => r.fulfill({ body: TILE_RE.test(r.request().url()) ? tileOfPattern(r.request().url()) : pattern, contentType: 'image/png' })]] });
  // WebGL picture only: hotspot marks and scene tabs over the picture would distort the samples.
  const { png } = stats(await glShot(page));
  const top = pixel(png, 0.5, 0.2), bottom = pixel(png, 0.5, 0.8), left = pixel(png, 0.3, 0.5), right = pixel(png, 0.7, 0.5), center = pixel(png, 0.5, 0.45);
  const upright = top[0] > 3 * top[2] && bottom[2] > 3 * bottom[0]; // red above the horizon, blue below (bottom is darkened by the overlay gradient)
  const notMirrored = right[1] > left[1];
  const centered = Math.abs(center[1] - 128) < 20;
  check('T2', 'Ориентация: верх — верх, не зеркально, центр кадра = центр панорамы', upright && notMirrored && centered, `top=${top} bottom=${bottom} leftG=${left[1]} rightG=${right[1]} centerG=${center[1]}`);
  await page.context().close();
}

// T3 all four scenes via tabs, including interior→exterior switches
{
  const page = await open('/tours/');
  const seq = MODE === 'demo'
    ? [['[data-view="interior"]', INT], ['[data-view="exterior"]', EXT], ['[data-view="interior"]', INT], ['[data-view="exterior"]', EXT]]
    : HAS_YARD
    ? [['[data-view="interior"]', 'b-interior'], ['[data-vehicle="c"]', 'c-interior'], ['[data-view="yard"]', 'c-yard'], ['[data-view="exterior"]', 'c-exterior'], ['[data-vehicle="b"]', 'b-exterior'], ['[data-view="yard"]', 'b-yard'], ['[data-view="interior"]', 'b-interior'], ['[data-view="exterior"]', 'b-exterior']]
    : [['[data-view="interior"]', 'b-interior'], ['[data-vehicle="c"]', 'c-interior'], ['[data-view="exterior"]', 'c-exterior'], ['[data-vehicle="b"]', 'b-exterior'], ['[data-view="interior"]', 'b-interior'], ['[data-view="exterior"]', 'b-exterior']];
  const log = [];
  let ok = true;
  for (const [selector, scene] of seq) {
    const before = await canvasShot(page);
    await page.click(selector);
    await sceneReady(page, '#' + scene);
    const st = await sceneState(page);
    const after = await canvasShot(page);
    const s = stats(after);
    const good = st.hash === '#' + scene && st.hotspots === expected[scene] && !st.loading && !st.fallback && s.mean > 25 && st.view === scene.split('-')[1] && st.vehicle === (MODE === 'vehicles' ? scene[0] : undefined);
    log.push(`${scene}:${good ? 'ok' : 'BAD'}(hs=${st.hotspots},mean=${s.mean.toFixed(0)},changed=${!before.equals(after)})`);
    ok = ok && good;
  }
  // still responsive after all switches
  const a = await glShot(page);
  await page.locator('[data-tour-viewer]').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const responsive = !a.equals(await glShot(page));
  check('T3', `Все сцены (${Object.keys(expected).length}) переключаются вкладками; после переключений тур реагирует`, ok && responsive && page.errors.length === 0, `${log.join(' ')} responsive=${responsive} errors=${page.errors}`);
  await page.context().close();
}

// T3b slow network: switching from the salon to the exterior while the exterior panorama is still loading
{
  const page = await open('/tours/#' + INT, { routes: [[`**/assets/${extFile}*`, async r => { await new Promise(res => setTimeout(res, 900)); await r.continue(); }]] });
  await page.click('[data-view="exterior"]');
  await page.waitForTimeout(2200);
  const st = await sceneState(page);
  const a = await glShot(page);
  await page.locator('[data-tour-viewer]').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const responsive = !a.equals(await glShot(page));
  check('T3b', 'Медленная сеть: «Внутри → Снаружи» во время загрузки не роняет тур', page.errors.length === 0 && responsive && st.hotspots === expected[EXT] && st.visibleHotspots > 0, `errors=${page.errors} responsive=${responsive} hotspots=${st.hotspots} visible=${st.visibleHotspots}`);
  await page.context().close();
}

// T4 deep links
{
  const res = [];
  for (const scene of Object.keys(expected)) {
    const page = await open('/tours/#' + scene);
    const st = await sceneState(page);
    res.push(`${scene}:${st.hash === '#' + scene && st.hotspots === expected[scene] && page.errors.length === 0}`);
    await page.context().close();
  }
  // Links shared earlier open the same view in the current mode.
  const legacy = MODE === 'demo' ? [['b-interior', 'demo-interior'], ['c-exterior', 'demo-exterior'], ['c-interior', 'demo-interior']] : [['demo-interior', 'b-interior']];
  for (const [from, to] of legacy) {
    const page = await open('/tours/#' + from);
    const st = await sceneState(page);
    res.push(`#${from}→${st.hash}:${st.hash === '#' + to && page.errors.length === 0}`);
    await page.context().close();
  }
  check('T4', 'Прямые ссылки на сцены и старые ссылки (#b-…, #c-…)', res.every(r => r.endsWith('true')), res.join(' '));
}

// T5 invalid hashes do not break the viewer
{
  const res = [];
  for (const hash of ['constructor', '__proto__', 'toString', 'x-interior', '%3Cimg%3E']) {
    const page = await open('/tours/#' + hash);
    const st = await sceneState(page);
    res.push(`${hash}:${page.errors.length === 0 && !st.fallback && st.hotspots > 0 ? 'ok' : 'FAIL ' + page.errors[0]}`);
    await page.context().close();
  }
  check('T5', 'Некорректный #якорь (#constructor, #__proto__ …) не ломает тур', res.every(r => r.endsWith('ok')), res.join(' | '));
}

// T6 all hotspots: open each, check text, visibility and transitions
{
  const page = await open('/tours/');
  const hasList = await page.locator('[data-hotspot-list] button').count() > 0;
  let opened = 0, visibleWhenOpened = 0, total = 0, transitions = 0;
  const problems = [];
  const titlesByScene = {};
  if (hasList) {
    for (const scene of Object.keys(expected)) {
      titlesByScene[scene] = new Set();
      await page.evaluate(s => { location.hash = s; }, scene);
      await sceneReady(page, '#' + scene);
      const n = await page.locator('[data-hotspot-list] button').count();
      total += n;
      for (let i = 0; i < n; i++) {
        const btn = page.locator('[data-hotspot-list] button').nth(i);
        const label = await btn.textContent();
        const transition = await btn.evaluate(button => button.closest('li')?.classList.contains('is-transition'));
        if (transition) {
          transitions++;
          if (!/Перейти|Выйти|Подойти|Войти|Вернуться|Обойти/.test(label)) problems.push(`transition label: ${label}`);
          continue;
        }
        await btn.click();
        await page.waitForTimeout(FLIGHT);
        const card = await page.evaluate(() => ({ hidden: document.querySelector('[data-tour-card]').hidden, title: document.querySelector('[data-card-title]').textContent, text: document.querySelector('[data-card-text]').textContent }));
        titlesByScene[scene].add(card.title);
        const visible = await page.evaluate(t => [...document.querySelectorAll('.tour-hotspot')].some(b => !b.hidden && b.getAttribute('aria-label') === t), card.title);
        if (!card.hidden && card.text.length > 20 && label.startsWith(card.title)) opened++; else problems.push(label);
        if (visible) visibleWhenOpened++; else problems.push(`not visible: ${card.title}`);
        await page.keyboard.press('Escape');
      }
    }
  } else {
    // Old markup has no list: count the hotspots that exist per scene.
    for (const scene of Object.keys(expected)) { await page.evaluate(s => { location.hash = s; }, scene); }
  }
  check('T6a', `Все точки тура (${TOTAL}) доступны списком; информационные открывают текст`, hasList && total === TOTAL && opened === TOTAL - transitions && problems.length === 0, hasList ? `total=${total} info=${opened} transitions=${transitions} ${problems.join('; ')}` : 'списка точек нет — точки вне кадра недоступны с клавиатуры и для screen reader');
  check('T6b', 'При выборе информационной точки камера поворачивается к ней (точка видна в кадре)', hasList && visibleWhenOpened === TOTAL - transitions, `visible=${visibleWhenOpened}/${TOTAL - transitions}`);
  if (MODE === 'vehicles') {
    const required = {
      ...(HAS_YARD ? {
        'b-yard': ['Автомобиль класса B', 'Ступень бокового входа', 'Кабина водителя'],
        'c-yard': ['Реанимобиль класса C', 'Ступень бокового входа', 'Кабина водителя']
      } : {}),
      'b-exterior': ['Задняя дверь медицинского салона', 'Баллон с редуктором'],
      'b-interior': ['Медицинская укладка на верхней полке', 'Дополнительная медицинская укладка', 'Медицинская укладка у рабочего места', 'Бордовая сумка', 'Чёрная сумка', 'Укладка на нижней полке', 'Жёсткий ящик у боковой двери', 'Сумка в нижнем отсеке', 'Аппарат в нижнем отсеке', 'Сейф', 'Кресло для переноски пациента', 'Панель управления отопителем', 'Аварийный люк', 'Аварийный молоток', 'Электрические розетки', 'Огнетушитель'],
      'c-exterior': ['Задняя дверь медицинского салона', 'Кислородный баллон'],
      'c-interior': ['Медицинская укладка на верхней полке', 'Кейс с маркировкой LUCAS', 'Укладка на нижней полке', 'Дополнительная медицинская сумка', 'Жёсткий ящик у боковой двери', 'Сейф', 'Кресло для переноски пациента', 'Панель управления отопителем', 'Аварийный люк', 'Аварийный молоток', 'Электрические розетки', 'Огнетушитель']
    };
    const missing = Object.entries(required).flatMap(([scene, titles]) => titles
      .filter(title => !titlesByScene[scene]?.has(title))
      .map(title => `${scene}: ${title}`));
    check('T6e', 'Учебные точки дверей, ступеней, кабин, сумок и оборудования салона присутствуют', missing.length === 0, missing.join('; '));
  }
  // Transitions are navigation controls without a description card. With a mouse the action shows on hover,
  // so one click moves to the scene; on touch screens see T6f.
  await page.goto(base + '/tours/#' + EXT);
  await page.waitForTimeout(1500);
  const enter = page.locator('.tour-hotspot.is-transition', { hasText: /Войти в салон|Перейти в салон/ });
  let transition = 'no visible entry hotspot';
  if (await enter.count() && await enter.isVisible()) {
    // The walk to the door, the dip and the loading take ~1.5 s with software rendering; wait for the scene itself.
    const sceneIs = hash => page.waitForFunction(h => location.hash === h && !document.querySelector('[data-tour-viewer]').classList.contains('is-switching'), hash, { timeout: 6000 }).catch(() => {});
    await enter.click();
    await sceneIs('#' + INT);
    const st1 = await sceneState(page);
    const cardAfterEnter = await page.locator('[data-tour-card]').isHidden();
    const exit = page.locator('[data-hotspot-list] button', { hasText: /Выйти через задние двери|Выйти наружу/ });
    if (await exit.count()) { await exit.click(); await sceneIs('#' + EXT); }
    const st2 = await sceneState(page);
    const cardAfterExit = await page.locator('[data-tour-card]').isHidden();
    transition = `${st1.hash}->${st2.hash} cards hidden=${cardAfterEnter},${cardAfterExit} errors=${page.errors.length}`;
    check('T6c', 'Переходы «Войти в салон» / «Выйти через задние двери»: мышью — одно нажатие, без карточки', st1.hash === '#' + INT && st2.hash === '#' + EXT && cardAfterEnter && cardAfterExit && page.errors.length === 0, transition);
  } else check('T6c', 'Переходы «Войти в салон» / «Выйти через задние двери»: мышью — одно нажатие, без карточки', false, transition);
  // T6f touch screens: the transition shows only its sign; the first tap shows the action,
  // the second tap moves to the scene. A tap elsewhere hides the action again.
  {
    const phone = await open('/tours/#' + EXT, { viewport: { width: 390, height: 844 }, mobile: true });
    await sceneReady(phone, '#' + EXT);
    const door = phone.locator('.tour-hotspot.is-transition').first();
    let detail = 'no visible transition sign';
    let ok = false;
    if (await door.count() && await door.isVisible()) {
      const labelShown = () => door.evaluate(b => getComputedStyle(b.querySelector('small')).visibility === 'visible');
      const before = await labelShown();
      await door.tap();
      await phone.waitForTimeout(400);
      const afterFirst = { hash: await phone.evaluate(() => location.hash), shown: await labelShown(), card: await phone.locator('[data-tour-card]').isHidden() };
      await phone.locator('[data-tour-viewer]').tap({ position: { x: 20, y: 300 } });
      await phone.waitForTimeout(300);
      const hiddenAgain = !(await labelShown());
      await door.tap();
      await phone.waitForTimeout(300);
      await door.tap();
      await sceneReady(phone, '#' + INT).catch(() => {});
      const hash = await phone.evaluate(() => location.hash);
      ok = !before && afterFirst.hash === '#' + EXT && afterFirst.shown && afterFirst.card && hiddenAgain && hash === '#' + INT && await phone.locator('[data-tour-card]').isHidden() && phone.errors.length === 0;
      detail = `label before=${before} first tap=${JSON.stringify(afterFirst)} hidden after tap elsewhere=${hiddenAgain} second tap -> ${hash} errors=${phone.errors}`;
    }
    check('T6f', 'Сенсорный экран: у перехода только значок; первое касание показывает подпись, второе — переходит', ok, detail);
    await phone.context().close();
  }
  // T6g «Назад» in the top row: one step out — from the cabin to the outside view, from there to the yard.
  {
    const phone = await open('/tours/#' + INT, { viewport: { width: 390, height: 844 }, mobile: true });
    await sceneReady(phone, '#' + INT);
    const back = phone.locator('[data-back]');
    const steps = [];
    const label = async () => (await back.isVisible()) ? `${await back.textContent()}|${await back.getAttribute('aria-label')}` : 'hidden';
    steps.push(`${await phone.evaluate(() => location.hash)}:${await label()}`);
    if (await back.isVisible()) { await back.tap(); await sceneReady(phone, '#' + EXT).catch(() => {}); }
    steps.push(`${await phone.evaluate(() => location.hash)}:${await label()}`);
    if (HAS_YARD && await back.isVisible()) { await back.tap(); await sceneReady(phone, '#b-yard').catch(() => {}); }
    steps.push(`${await phone.evaluate(() => location.hash)}:${await label()}`);
    const toExt = MODE === 'demo' ? 'Наружу|Выйти наружу' : 'Задние двери|Выйти к задним дверям';
    const expectedSteps = HAS_YARD
      ? [`#${INT}:${toExt}`, `#${EXT}:Во двор|Вернуться во двор станции`, '#b-yard:hidden']
      : [`#${INT}:${toExt}`, `#${EXT}:hidden`, `#${EXT}:hidden`];
    const inside = await phone.evaluate(() => { const r = document.querySelector('[data-tour-viewer]').getBoundingClientRect(), s = document.querySelector('.tour-scenes-toggle').getBoundingClientRect(); return s.left >= r.left && s.right <= r.right; });
    check('T6g', 'Кнопка «Назад»: из салона к задним дверям, от задних дверей во двор, во дворе её нет', steps.join(' ') === expectedSteps.join(' ') && inside && phone.errors.length === 0, `${steps.join(' → ')} errors=${phone.errors}`);
    await phone.context().close();
  }
  // T6h every door leads where it physically goes: yard — side door into the cabin, rear corner to the
  // rear doors; rear doors — into the cabin, around the right side to the yard; cabin — side door to the
  // yard, rear doors outside. «Назад» from the cabin returns through the door the visitor came in.
  if (HAS_YARD) {
    const phone = await open('/tours/#b-yard', { viewport: { width: 390, height: 844 }, mobile: true });
    await sceneReady(phone, '#b-yard');
    const actions = {};
    for (const scene of ['b-yard', 'b-exterior', 'b-interior']) {
      await phone.evaluate(s => { location.hash = s; }, scene);
      await sceneReady(phone, '#' + scene);
      actions[scene] = await phone.evaluate(() => [...document.querySelectorAll('[data-hotspot-list] li.is-transition button')].map(b => b.textContent).sort().join(','));
    }
    const expectedActions = { 'b-yard': 'Войти в салон,Обойти к задним дверям', 'b-exterior': 'Вернуться во двор,Войти в салон', 'b-interior': 'Выйти через боковую дверь,Выйти через задние двери' };
    await phone.evaluate(() => { location.hash = 'b-yard'; });
    await sceneReady(phone, '#b-yard');
    await phone.locator('[data-hotspot-list] button', { hasText: 'Войти в салон' }).click();
    await sceneReady(phone, '#b-interior').catch(() => {});
    const backLabel = await phone.locator('[data-back]').textContent();
    await phone.locator('[data-back]').tap();
    await sceneReady(phone, '#b-yard').catch(() => {});
    const afterBack = await phone.evaluate(() => location.hash);
    await phone.locator('[data-hotspot-list] button', { hasText: 'Выйти через боковую дверь' }).count();
    const ok = JSON.stringify(actions) === JSON.stringify(expectedActions) && backLabel === 'Во двор' && afterBack === '#b-yard' && phone.errors.length === 0;
    check('T6h', 'Двери ведут логично: боковая дверь — двор ⇄ салон, задние двери — задние двери ⇄ салон; «Назад» — через ту дверь, где вошли', ok, `${JSON.stringify(actions)} back from cabin entered by the side door: «${backLabel}» → ${afterBack} errors=${phone.errors}`);
    await phone.context().close();
  }
  // speak button
  const speak = await page.evaluate(() => { const b = document.querySelector('[data-card-speak]'); return b && !b.hidden; });
  check('T6d', 'Кнопка «Озвучить» доступна при наличии Speech Synthesis', speak, '');
  await page.context().close();
}

// T7 keyboard, direct wheel handling, mouse drag, auto rotation
{
  const page = await open('/tours/');
  const vp = page.locator('[data-tour-viewer]');
  const menuClosed = await page.locator('[data-more-menu]').isHidden();
  await openMore(page);
  const menuOpened = await page.getAttribute('[data-more]', 'aria-expanded') === 'true' && await page.locator('[data-more-menu]').isVisible();
  await page.keyboard.press('Escape');
  const menuEscaped = await page.getAttribute('[data-more]', 'aria-expanded') === 'false' && await page.locator('[data-more-menu]').isHidden();
  await vp.hover();
  let a = await canvasShot(page);
  await vp.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  let b = await canvasShot(page);
  const keys = !a.equals(b);
  await page.keyboard.press('+'); await page.keyboard.press('+');
  await page.waitForTimeout(250);
  const plus = !b.equals(await canvasShot(page));
  const box = await vp.boundingBox();
  a = await canvasShot(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  b = await canvasShot(page);
  const wheel = !a.equals(b);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const drag = !b.equals(await canvasShot(page));
  await openMore(page);
  await page.click('[data-auto]');
  const s1 = await canvasShot(page); await page.waitForTimeout(900); const s2 = await canvasShot(page);
  const auto = !s1.equals(s2) && await page.getAttribute('[data-auto]', 'aria-pressed') === 'true';
  check('T7', 'Меню «Ещё», клавиши, +/−, колесо, мышь и автообзор', menuClosed && menuOpened && menuEscaped && keys && plus && wheel && drag && auto && page.errors.length === 0, `menu=${menuClosed},${menuOpened},${menuEscaped} keys=${keys} plus=${plus} wheel=${wheel} drag=${drag} auto=${auto}`);
  await page.context().close();
}

// T8 ARIA tabs with arrow keys
{
  const page = await open('/tours/');
  await page.locator('[data-view="exterior"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const view = await sceneState(page);
  const focusOk = await page.evaluate(() => document.activeElement?.dataset.view === 'interior');
  let veh = { hash: 'нет выбора класса (демо-режим)' }, vehicleOk = true;
  if (MODE === 'vehicles') {
    await page.locator('[data-vehicle="b"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
    veh = await sceneState(page);
    vehicleOk = veh.hash === '#c-interior';
  }
  const attrs = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(t => !t.closest('[hidden]')).map(t => `${t.dataset.view || t.dataset.vehicle}:${t.getAttribute('aria-controls')}:${t.tabIndex}`).join(','));
  const vehicleAttrs = MODE === 'vehicles' ? /c:tour-viewport:0/.test(attrs) && /b:tour-viewport:-1/.test(attrs) : !/(^|,)[bc]:/.test(attrs);
  check('T8', 'Вкладки: стрелки переключают, aria-controls, roving tabindex', view.hash === '#' + INT && focusOk && vehicleOk && /interior:tour-viewport:0/.test(attrs) && /exterior:tour-viewport:-1/.test(attrs) && vehicleAttrs, `view=${view.hash} vehicle=${veh.hash} ${attrs}`);
  await page.context().close();
}

// T9 fullscreen: native and iPhone-like fallback
{
  const page = await open('/tours/');
  await page.click('[data-fullscreen]');
  await page.waitForTimeout(400);
  const native = await page.evaluate(() => document.fullscreenElement === document.querySelector('[data-tour-viewer]'));
  const label = await page.getAttribute('[data-fullscreen]', 'aria-label');
  await page.context().close();
  const ios = await open('/tours/', { viewport: { width: 390, height: 844 }, mobile: true, init: () => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; } });
  await ios.click('[data-fullscreen]');
  await ios.waitForTimeout(400);
  const rect = await ios.evaluate(() => { const r = document.querySelector('[data-tour-viewer]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), document.documentElement.classList.contains('tour-locked')]; });
  await ios.keyboard.press('Escape');
  const exited = await ios.evaluate(() => !document.querySelector('[data-tour-viewer]').classList.contains('is-pseudo-fullscreen'));
  check('T9', 'Полноэкранный режим; на iPhone (без Fullscreen API) — развёртывание на весь экран', native && /Выйти/.test(label) && rect[0] === 390 && rect[1] === 844 && rect[2] && exited, `native=${native} label=${label} pseudo=${rect} exit=${exited}`);
  await ios.context().close();
}

// T10 presence effect («Эффект присутствия»): sound starts/stops, rapid toggles, hidden tab
{
  const init = () => {
    window.__audio = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native { constructor(...a) { super(...a); window.__audio.push(this); } };
  };
  const page = await open('/tours/', { init });
  const audioState = () => page.evaluate(() => window.__audio.map(c => c.state).join(','));
  await openMore(page);
  await page.click('[data-presence]');
  await page.waitForTimeout(500);
  const on = await page.evaluate(() => [document.querySelector('[data-presence]').getAttribute('aria-pressed'), document.querySelector('[data-tour-viewer]').classList.contains('presence-on')]);
  const s1 = await audioState();
  await page.click('[data-presence]');
  await page.waitForTimeout(700);
  const s2 = await audioState();
  for (let i = 0; i < 7; i++) await page.click('[data-presence]');
  await page.waitForTimeout(900);
  const rapid = await page.evaluate(() => [document.querySelector('[data-presence]').getAttribute('aria-pressed'), document.querySelector('[data-tour-viewer]').classList.contains('presence-on'), window.__audio.map(c => c.state).join(',')]);
  // now presence is on (odd number of clicks) → hide the tab
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  const hiddenState = await audioState();
  const contexts = await page.evaluate(() => window.__audio.length);
  check('T10a', 'Эффект присутствия: включение (aria-pressed, свет) и запуск звука', on[0] === 'true' && on[1] && s1 === 'running', `pressed=${on} audio=${s1}`);
  check('T10b', 'Эффект присутствия: выключение останавливает звук', s2 === 'suspended', `audio=${s2}`);
  check('T10c', 'Эффект присутствия: 7 быстрых нажатий — состояние согласовано, один AudioContext', rapid[0] === 'true' && rapid[1] && rapid[2] === 'running' && contexts === 1, `${rapid} contexts=${contexts}`);
  check('T10d', 'Эффект присутствия: звук останавливается при уходе вкладки в фон', hiddenState === 'suspended' && page.errors.length === 0, `audio=${hiddenState} errors=${page.errors}`);
  await page.context().close();
}

// T11 gyroscope button only where sensors can exist
{
  const desktop = await open('/tours/');
  const dHidden = await desktop.evaluate(() => document.querySelector('[data-gyro]').hidden);
  await desktop.context().close();
  const phone = await open('/tours/', { viewport: { width: 390, height: 844 }, mobile: true });
  const pHidden = await phone.evaluate(() => document.querySelector('[data-gyro]').hidden);
  // Sensor that never sends data → honest message and button returns to off
  await openMore(phone);
  await phone.click('[data-gyro]');
  await phone.waitForTimeout(1900);
  const msg = await phone.evaluate(() => [document.querySelector('[data-gyro]').getAttribute('aria-pressed'), document.querySelector('[data-vr-status]').textContent]);
  await phone.context().close();
  // Sensor data on a fresh page: portrait upright, then landscape upright (beta 0, gamma -90)
  const phone2 = await open('/tours/', { viewport: { width: 390, height: 844 }, mobile: true });
  await openMore(phone2);
  await phone2.click('[data-gyro]');
  const res = await phone2.evaluate(async () => {
    const fire = (alpha, beta, gamma) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha, beta, gamma }));
    const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const visible = () => [...document.querySelectorAll('.tour-hotspot')].filter(b => !b.hidden).length;
    fire(0, 90, 0); await frames();
    const portrait = visible();
    // The same heading held upright in landscape: with beta 0 and gamma -90 the compass angle is alpha 90.
    fire(90, 0, -90); await frames();
    const landscape = visible();
    return [document.querySelector('[data-gyro]').getAttribute('aria-pressed'), portrait, landscape];
  });
  check('T11a', 'Кнопка «Гироскоп» скрыта на ПК без датчиков, показана на телефоне', dHidden && !pHidden, `desktop hidden=${dHidden} phone hidden=${pHidden}`);
  check('T11b', 'Гироскоп без данных датчика: честное сообщение, кнопка выключается', msg[0] === 'false' && msg[1].length > 10, `${msg}`);
  check('T11c', 'Гироскоп: портрет и ландшафт держат взгляд у горизонта (точки видны)', res[0] === 'true' && res[1] > 0 && res[2] > 0 && phone2.errors.length === 0, `pressed=${res[0]} visible portrait=${res[1]} landscape=${res[2]} errors=${phone2.errors}`);
  await phone2.context().close();
}

// T12 touch: one finger rotates the panorama directly
{
  const page = await open('/tours/', { viewport: { width: 390, height: 844 }, mobile: true });
  const cdp = await page.context().newCDPSession(page);
  await page.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await page.locator('[data-tour-viewer] canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const beforeScroll = await page.evaluate(() => scrollY);
  const before = await canvasShot(page);
  await touch('touchStart', [[cx, cy + 100]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx, cy + 100 - i * 24]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const afterScroll = await page.evaluate(() => scrollY);
  const after = await canvasShot(page);
  check('T12a', 'Касание: один палец вращает панораму', !before.equals(after) && Math.abs(afterScroll - beforeScroll) < 10 && page.errors.length === 0, `canvasChanged=${!before.equals(after)} scroll ${beforeScroll}->${afterScroll} errors=${page.errors}`);
  if (out) await page.screenshot({ path: `${out}/tour-390.png` });
  await page.context().close();
}

// T12b two-finger pinch zooms (distance between two hotspots on screen grows)
{
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, hasTouch: true });
  const tp = await context.newPage();
  tp.errors = []; tp.on('pageerror', e => tp.errors.push(e.message));
  await tp.goto(base + '/tours/#' + (MODE === 'demo' ? 'demo-interior' : 'c-interior'));
  await tp.waitForTimeout(2200);
  await tp.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await tp.waitForTimeout(200);
  const pos = () => tp.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tour-hotspot')].filter(b => !b.hidden).map(b => [b.getAttribute('aria-label'), (b.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)$/) || []).slice(1).map(Number)])));
  const pair = MODE === 'demo' ? ['Монитор пациента', 'Система носилок'] : ['Монитор-дефибриллятор', 'Аппарат искусственной вентиляции лёгких'];
  const gap = p => { const a = p[pair[0]], b = p[pair[1]]; return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN; };
  // Let the tour finish loading first: without tiles the full-quality panorama replaces
  // the preview a few seconds after opening, and with software WebGL that blocks the page.
  // Key presses made meanwhile would start their camera move after the pinch and cancel it.
  await tp.waitForLoadState('networkidle');
  for (let quiet = 0, i = 0; quiet < 3 && i < 50; i++) {
    const started = Date.now();
    await tp.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    quiet = Date.now() - started < 100 ? quiet + 1 : 0;
  }
  // Turn the view so that both points are well inside the frame before zooming.
  await tp.locator('[data-tour-viewer]').focus();
  for (let i = 0; i < (MODE === 'demo' ? 5 : 0); i++) await tp.keyboard.press(MODE === 'demo' ? 'ArrowLeft' : 'ArrowRight');
  // A key press is a 500 ms camera move: wait for it to end and for the view to stop,
  // otherwise the pinch starts mid-animation and the engine applies only part of it.
  await tp.waitForTimeout(600);
  let before = gap(await pos());
  for (let i = 0; i < 30; i++) {
    await tp.waitForTimeout(100);
    const now = gap(await pos());
    if (Math.abs(now - before) < 0.5) break;
    before = now;
  }
  const cdp = await context.newCDPSession(tp);
  const box = await tp.locator('[data-tour-viewer] canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  // Below the points on the horizon and above the scene tabs, which lie over the picture.
  const py = cy + box.height * 0.18;
  const onCanvas = await tp.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [cx, py]);
  await touch('touchStart', [[cx - 60, py], [cx + 60, py]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 60 - i * 2, py], [cx + 60 + i * 2, py]]);
  await touch('touchEnd', []);
  await tp.waitForTimeout(300);
  const after = gap(await pos());
  check('T12b', 'Касание: масштаб двумя пальцами (pinch)', onCanvas === 'CANVAS' && after / before > 1.1 && tp.errors.length === 0, `touch on ${onCanvas}; gap ${before.toFixed(0)}px -> ${after.toFixed(0)}px`);
  await context.close();
}

// T13 WebGL unavailable
{
  const page = await open('/tours/', { init: () => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : orig.call(this, type, ...rest); }; } });
  const fb = await page.evaluate(() => [document.querySelector('[data-tour-fallback]').hidden, document.querySelector('[data-tour-fallback] strong').textContent, document.querySelectorAll('[data-hotspot-list] details').length, document.querySelector('[data-hotspot-list] details p')?.textContent.length || 0]);
  const errors = page.errors.filter(e => !/WebGL/i.test(e));
  check('T13', 'Без WebGL — понятное сообщение и доступный список оборудования', !fb[0] && /3D/.test(fb[1]) && fb[2] === expected[FIRST] && fb[3] > 20 && errors.length === 0, `${fb} errors=${errors}`);
  await page.context().close();
}

// T14 panorama load error, then retry
{
  let fail = true;
  // The preview, the full file and the tiles of the first scene fail.
  const failing = new RegExp(`/assets/(tour-tiles/)?${firstStem}`);
  const page = await open('/tours/', { routes: [[failing, r => fail ? r.abort() : r.continue()]] });
  const fb = await page.evaluate(() => [document.querySelector('[data-tour-fallback]').hidden, document.querySelector('[data-tour-fallback] strong').textContent, document.querySelector('[data-tour-retry]') ? !document.querySelector('[data-tour-retry]').hidden : false, document.querySelector('[data-tour-viewer]').classList.contains('is-loading')]);
  let retried = 'нет кнопки';
  if (fb[2]) { fail = false; await page.click('[data-tour-retry]'); await page.waitForTimeout(1500); const st = await sceneState(page); retried = `fallback=${st.fallback} hotspots=${st.hotspots}`; }
  check('T14', 'Ошибка загрузки панорамы: понятное сообщение и повтор загрузки', !fb[0] && /загрузить панораму/.test(fb[1]) && !fb[3] && retried === `fallback=false hotspots=${expected[FIRST]}`, `${fb} retry: ${retried}`);
  await page.context().close();
}

// T15 WebGL context loss and restore
{
  const page = await open('/tours/');
  const lost = await page.evaluate(async () => {
    const canvas = document.querySelector('[data-tour-viewer] canvas');
    window.__lose = (canvas.getContext('webgl2') || canvas.getContext('webgl')).getExtension('WEBGL_lose_context');
    window.__lose.loseContext();
    await new Promise(r => setTimeout(r, 300));
    return [document.querySelector('[data-tour-fallback]').hidden, document.querySelector('[data-tour-fallback] strong').textContent];
  });
  const nav = page.waitForEvent('framenavigated', { timeout: 4000 }).then(() => true).catch(() => false);
  await page.evaluate(() => window.__lose.restoreContext());
  const reloaded = await nav;
  check('T15', 'Потеря контекста WebGL: сообщение; восстановление: перезагрузка тура', !lost[0] && /остановлена/.test(lost[1]) && reloaded, `${lost} reloaded=${reloaded}`);
  await page.context().close();
}

// T16 legacy markup (old /tours/ HTML with data-effects and data-sound)
{
  const page = await open('/tours/', { routes: [['**/tours/', async route => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace('data-presence', 'data-effects').replace('<button type="button" data-auto', '<button type="button" data-sound aria-pressed="false">Звук</button><button type="button" data-auto')
      .replace(/<section class="tour-points"[\s\S]*?<\/section>/, '').replace('<p class="sr-only" data-tour-announce aria-live="polite"></p>', '').replace('<button type="button" data-tour-retry hidden>Повторить загрузку</button>', '');
    await route.fulfill({ response: res, body: html });
  }]] });
  await openMore(page);
  await page.click('[data-sound]');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => [document.querySelector('[data-effects]').getAttribute('aria-pressed'), document.querySelector('[data-sound]').getAttribute('aria-pressed')]);
  await page.click('[data-view="interior"]');
  await sceneReady(page, '#' + INT);
  await page.click('[data-view="exterior"]');
  await sceneReady(page, '#' + EXT);
  const scene = await sceneState(page);
  check('T16', 'Старая разметка (data-effects, data-sound, без новых блоков) не ломает тур', st[0] === 'true' && st[1] === 'true' && scene.hotspots === expected[FIRST] && page.errors.length === 0, `pressed=${st} hotspots=${scene.hotspots} errors=${page.errors}`);
  await page.context().close();
}

// T17 VR exit: rendering resumes on the page canvas (WebXR emulated in the test)
{
  const init = () => {
    const listeners = {};
    let raf = null;
    const session = {
      renderState: {},
      updateRenderState(s) { Object.assign(this.renderState, s); },
      requestReferenceSpace: async () => ({}),
      requestAnimationFrame(cb) { raf = cb; return 1; },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      end: async () => { (listeners.end || []).forEach(fn => fn()); }
    };
    window.__xrSession = session;
    window.__xrStep = () => raf && raf(performance.now(), { session, getViewerPose: () => null });
    Object.defineProperty(Navigator.prototype, 'xr', { get: () => ({ isSessionSupported: async () => true, requestSession: async () => session }) });
    window.XRWebGLLayer = class {
      constructor(s, gl) { const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D), prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING); const fb = gl.createFramebuffer(); const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindTexture(gl.TEXTURE_2D, prevTex); gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb); this.framebuffer = fb; } // like a real layer, leaves the app's GL bindings unchanged
      getViewport() { return { x: 0, y: 0, width: 16, height: 16 }; }
    };
    WebGLRenderingContext.prototype.makeXRCompatible = async function () {};
  };
  const page = await open('/tours/', { init });
  const vrVisible = await page.evaluate(() => !document.querySelector('[data-vr]').hidden);
  if (vrVisible) {
    await page.click('[data-vr]');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__xrStep());
    await page.evaluate(() => window.__xrSession.end());
    await page.waitForTimeout(400);
  }
  const a = await glShot(page);
  await page.locator('[data-tour-viewer]').focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const resumed = !a.equals(await glShot(page));
  check('T17', 'После выхода из VR панорама снова рисуется на странице (эмуляция WebXR)', vrVisible && resumed && page.errors.length === 0, `vrButton=${vrVisible} resumed=${resumed} errors=${page.errors}`);
  await page.context().close();
}

// T18 hotspot labels are text, not HTML
{
  const page = await open('/tours/');
  const html = await page.evaluate(() => document.querySelector('.tour-hotspot b')?.innerHTML);
  const scene = await page.evaluate(() => document.querySelector('[data-scene-name]').textContent);
  check('T18', 'Подписи точек выводятся как текст', html && !/[<>]/.test(html), `${html} / ${scene}`);
  await page.context().close();
}

// T19 mobile layout: no horizontal scroll, controls reachable
{
  const res = [];
  for (const [w, h] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390], [1024, 768]]) {
    const compact = w <= 800 || h <= 520;
    const page = await open('/tours/', { viewport: { width: w, height: h }, mobile: compact });
    const tabsInitiallyHidden = await page.locator('.tour-scene-tabs').isHidden();
    if (compact) await page.click('[data-scenes-toggle]');
    const m = await page.evaluate(() => {
      const root = document.querySelector('[data-tour-viewer]').getBoundingClientRect();
      const inside = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.left >= root.left - 1 && r.right <= root.right + 1 && r.top >= root.top - 1 && r.bottom <= root.bottom + 1; };
      const tabs = document.querySelector('.tour-scene-tabs').getBoundingClientRect(), hint = document.querySelector('.tour-drag-hint').getBoundingClientRect();
      const overlap = hint.width > 0 && !(hint.right < tabs.left || hint.left > tabs.right || hint.bottom < tabs.top || hint.top > tabs.bottom);
      return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tabs: inside('.tour-scene-tabs'), scenes: inside('.tour-scenes-toggle'), controls: inside('.tour-controls'), hud: inside('.tour-hud-actions'), overlap };
    });
    const scenesOk = compact ? tabsInitiallyHidden && m.scenes && await page.getAttribute('[data-scenes-toggle]', 'aria-expanded') === 'true' : !tabsInitiallyHidden;
    res.push(`${w}:${!m.overflow && m.tabs && m.controls && m.hud && !m.overlap && scenesOk ? 'ok' : JSON.stringify({ ...m, tabsInitiallyHidden, scenesOk })}`);
    await page.context().close();
  }
  check('T19', 'Тур на 320–1024 px и в альбомной ориентации: без горизонтального скролла; сцены раскрываются кнопкой', res.every(r => r.endsWith('ok')), res.join(' '));
}

// T19b compact scene picker updates the scene and closes after selection
{
  const page = await open('/tours/', { viewport: { width: 390, height: 844 }, mobile: true });
  await page.click('[data-scenes-toggle]');
  await page.click('[data-view="interior"]');
  await sceneReady(page, '#' + INT);
  const state = await page.evaluate(() => [
    document.querySelector('[data-scenes-toggle]').getAttribute('aria-expanded'),
    document.querySelector('[data-scenes-current]').textContent,
    getComputedStyle(document.querySelector('.tour-scene-tabs')).display
  ]);
  check('T19b', 'Компактный выбор сцен: переход выполняется, меню закрывается, подпись обновляется', state[0] === 'false' && state[1] === 'Салон' && state[2] === 'none' && page.errors.length === 0, `${state} errors=${page.errors}`);
  await page.context().close();
}

// T20 honest presentation of the mode and the presence effect label
{
  const requested = [];
  const page = await open('/tours/');
  // A panorama and its preview count as one picture.
  page.on('request', r => {
    const url = r.url().split('?')[0], tiles = url.match(/\/tour-tiles\/(.+)-[0-9a-f]{10}\//);
    if (tiles) requested.push(tiles[1]);
    else if (/\/assets\/tour-/.test(url)) requested.push(url.split('/').pop().replace(/-preview(?=\.)/, '').replace(/\.[a-z]+$/, ''));
  });
  const text = await page.evaluate(() => document.body.innerText);
  const presenceLabel = (await page.locator('[data-presence]').textContent()).trim();
  const home = await (await fetch(base + '/')).text();
  const search = await (await fetch(base + '/search-index.json')).text();
  const common = /^◎?Эффект присутствия$/.test(presenceLabel) && !/5D/.test(text) && !/5D/.test(home) && !/5D/.test(search);
  if (MODE === 'demo') {
    const labels = [];
    for (const scene of Object.keys(expected)) {
      await page.evaluate(s => { location.hash = s; }, scene);
      await page.waitForTimeout(1200);
      labels.push(...await page.locator('[data-hotspot-list] button').allTextContents());
      for (let i = 0; i < await page.locator('[data-hotspot-list] button').count(); i++) {
        await page.locator('[data-hotspot-list] button').nth(i).click();
        labels.push(await page.locator('[data-card-title]').textContent(), await page.locator('[data-card-text]').textContent(), await page.locator('[data-scene-name]').textContent());
        await page.keyboard.press('Escape');
      }
    }
    const vehicleTabs = await page.locator('[data-vehicle]:visible').count();
    const claimsClass = labels.some(t => /класса [BC]\b|Реанимобиль/.test(t));
    const intro = await page.locator('.tour-intro').innerText();
    const files = [...new Set(requested)];
    const ok = common && vehicleTabs === 0 && !claimsClass && !/Класс B|Класс C/.test(intro) && /Демонстрационн/.test(text) && /не съёмка/.test(text) && !/Классы B и C/.test(home) && files.length <= 2;
    check('T20', 'Демо-режим: один демонстрационный тур без выбора B/C; точки и заголовки без классов; «Эффект присутствия» вместо «5D»', ok, `tabs=${vehicleTabs} claimsClass=${claimsClass} files=${files} presence="${presenceLabel}" 5D=${/5D/.test(text + home + search)}`);
  } else {
    // The synthetic test copy (make-vehicles-variant.mjs) paints each scene in its own colour:
    // the picture must match the chosen class and view. Real shots are checked by scene and files.
    const synthetic = /-test\.png/.test(tourHtml);
    const palette = { 'b-exterior': [70, 130, 180], 'b-interior': [200, 170, 90], 'c-exterior': [90, 160, 110], 'c-interior': [170, 90, 140] };
    const nearest = ([r, g, b]) => Object.entries(palette).map(([name, [pr, pg, pb]]) => {
      const t = r + g + b || 1, u = pr + pg + pb;
      return [Math.hypot(r / t - pr / u, g / t - pg / u, b / t - pb / u), name];
    }).sort((x, y) => x[0] - y[0])[0][1];
    const shown = [];
    let thumbs = '';
    for (const [selector, scene] of [['[data-vehicle="c"]', `c-${FIRST.split('-')[1]}`], ['[data-view="interior"]', 'c-interior'], ['[data-vehicle="b"]', 'b-interior'], ['[data-view="exterior"]', 'b-exterior']]) {
      await page.click(selector);
      await page.waitForTimeout(1500);
      let picture = (await sceneState(page)).hash.slice(1);
      if (synthetic) {
        const { png } = stats(await glShot(page));
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < png.data.length; i += 4) { r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
        picture = nearest([r / n, g / n, b / n]);
      }
      shown.push(`${scene}:${picture}`);
      if (scene === 'c-interior') thumbs = await page.evaluate(() => [...document.querySelectorAll('[data-scene-thumb]')].map(i => i.getAttribute('src').split('/').pop().split('?')[0]).join(','));
    }
    const vehicleTabs = await page.locator('[data-vehicle]:visible').count();
    const files = [...new Set(requested)];
    const ok = common && vehicleTabs === 2 && shown.every(item => item.split(':')[0] === item.split(':')[1]) && /tour-c-exterior/.test(thumbs) && /tour-c-interior/.test(thumbs) && (!HAS_YARD || /tour-c-yard/.test(thumbs))
      && /Классы B и C/.test(home) && !/емонстрационн|не съёмка/i.test(text) && !files.some(f => /demo/.test(f));
    check('T20', 'Выбор B/C: у каждого класса свои панорамы и миниатюры, без демонстрационных снимков; «Эффект присутствия» вместо «5D»', ok, `tabs=${vehicleTabs} shown=${shown} thumbs(C)=${thumbs} files=${files} presence="${presenceLabel}"`);
  }
  await page.context().close();
}

// T14b the detailed picture fails: the preview stays on screen
if (HAS_TILES) {
  const page = await open('/tours/', { routes: [[TILE_RE, r => r.abort()]] });
  const st = await sceneState(page);
  const s = stats(await glShot(page));
  const errors = page.errors.filter(e => !/Failed to load resource/.test(e));
  check('T14b', 'Тайлы не загрузились: остаётся превью, тур работает', !st.fallback && !st.loading && st.hotspots === expected[FIRST] && s.mean > 25 && errors.length === 0, `fallback=${st.fallback} hotspots=${st.hotspots} mean=${s.mean.toFixed(0)} errors=${errors}`);
  await page.context().close();
} else if (HAS_PREVIEW) {
  const page = await open('/tours/', { routes: [[`**/assets/${firstFile}*`, r => r.abort()]] });
  const st = await sceneState(page);
  const note = await page.evaluate(() => document.querySelector('[data-vr-status]').textContent);
  const s = stats(await glShot(page));
  // The aborted request itself is logged by the browser; other errors are not expected.
  const errors = page.errors.filter(e => !/Failed to load resource/.test(e));
  check('T14b', 'Полный файл не загрузился: остаётся превью, тур работает, есть пояснение', !st.fallback && !st.loading && st.hotspots === expected[FIRST] && s.mean > 25 && /сниженном качестве/.test(note) && errors.length === 0, `fallback=${st.fallback} hotspots=${st.hotspots} mean=${s.mean.toFixed(0)} note="${note}" errors=${errors}`);
  await page.context().close();
} else check('T14b', 'Полный файл не загрузился: остаётся превью (превью не подготовлены — проверка не применяется)', true, 'n/a');

// T21 progressive loading: preview at once, full quality later
if (HAS_TILES) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(TILE_RE, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
  await page.goto(base + '/tours/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const early = await page.evaluate(() => [document.querySelector('[data-tour-viewer]').classList.contains('is-loading'), document.querySelectorAll('.tour-hotspot').length]);
  const before = await glShot(page);
  await page.waitForTimeout(2600);
  const sharper = !before.equals(await glShot(page));
  check('T21', 'Превью показывается сразу (точки активны), видимые тайлы подгружаются следом', !early[0] && early[1] === expected[FIRST] && sharper && errors.length === 0, `loading=${early[0]} hotspots=${early[1]} picture changed after tiles=${sharper} errors=${errors}`);
  await context.close();
} else if (HAS_PREVIEW) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`**/assets/${firstFile}*`, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
  // The panorama download delays the window «load» event, so do not wait for it.
  await page.goto(base + '/tours/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const early = await page.evaluate(() => { const v = document.querySelector('[data-tour-viewer]'); return [v.classList.contains('is-loading'), v.classList.contains('is-sharpening'), document.querySelectorAll('.tour-hotspot').length]; });
  // Decoding time varies on software-rendered CI. Wait for the real completion
  // state instead of assuming that the delayed request and decode fit in 2.6 s.
  await page.waitForFunction(() => !document.querySelector('[data-tour-viewer]').classList.contains('is-sharpening'), null, { timeout: 8000 }).catch(() => {});
  const late = await page.evaluate(() => document.querySelector('[data-tour-viewer]').classList.contains('is-sharpening'));
  check('T21', 'Превью показывается сразу (точки активны), полное качество подгружается следом', !early[0] && early[1] && early[2] === expected[FIRST] && !late && errors.length === 0, `loading=${early[0]} sharpening=${early[1]} hotspots=${early[2]} → sharpening later=${late} errors=${errors}`);
  await context.close();
} else check('T21', 'Превью и полное качество (превью не подготовлены — проверка не применяется)', true, 'n/a');

// T22 engine: Photo Sphere Viewer from the site itself (no CDN), WebGL 2; with tiles only the visible ones load
{
  const tileRequests = new Set();
  const neighbourTileRequests = new Set();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [], hosts = new Set();
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host);
    const m = r.url().match(TILE_RE);
    if (m && r.url().includes(FIRST_TILES?.base || '#')) tileRequests.add(`${m[1]}/${m[2]}_${m[3]}`);
    else if (m) neighbourTileRequests.add(r.url());
  });
  await page.goto(base + '/tours/');
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => [window.RssmpPSV?.VERSION, Boolean(document.querySelector('[data-tour-viewer] canvas').getContext('webgl2'))]);
  // Real shots have several levels of detail (2048, 4096, 8192 px): count the tiles of all of them.
  const all = (FIRST_TILES?.levels || []).reduce((sum, level) => sum + level.cols * level.rows, 0);
  const tilesOk = !HAS_TILES || (tileRequests.size > 0 && tileRequests.size < all && neighbourTileRequests.size === 0);
  check('T22', 'Движок Photo Sphere Viewer 5.15.1 с сайта (без CDN), WebGL 2; грузятся только видимые тайлы текущей сцены', info[0] === '5.15.1' && info[1] && hosts.size === 1 && tilesOk && errors.length === 0, `version=${info[0]} webgl2=${info[1]} hosts=${[...hosts]} tiles=${HAS_TILES ? `${tileRequests.size}/${all}, соседние=${neighbourTileRequests.size}` : 'нет'} errors=${errors}`);
  await context.close();
}

// T23 guided tour: starts, shows points in order, «next» advances, any drag stops it
{
  const page = await open('/tours/');
  await page.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await openMore(page);
  await page.click('[data-guide]');
  await page.waitForTimeout(FLIGHT + 300);
  const first = await page.evaluate(() => [document.querySelector('[data-guide]').getAttribute('aria-pressed'), document.querySelector('[data-tour-card]').hidden, document.querySelector('[data-card-index]').textContent]);
  await page.click('[data-card-next]');
  await page.waitForTimeout(FLIGHT + 300);
  const second = await page.evaluate(() => [document.querySelector('[data-guide]').getAttribute('aria-pressed'), document.querySelector('[data-card-index]').textContent]);
  const box = await page.locator('[data-tour-viewer] canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7, { steps: 4 });
  await page.mouse.up();
  const stopped = await page.getAttribute('[data-guide]', 'aria-pressed');
  const ok = first[0] === 'true' && !first[1] && /^Точка 1 из \d+$/.test(first[2]) && second[0] === 'true' && /^Точка 2 из/.test(second[1]) && stopped === 'false' && page.errors.length === 0;
  check('T23', 'Экскурсия: точки по порядку, «Далее» продолжает, перетаскивание останавливает', ok, `start=${first} next=${second} afterDrag=${stopped} errors=${page.errors}`);
  await page.context().close();
}

// T24 guided tour walks through the door into the next scene
{
  const page = await open('/tours/', { init: () => { const native = window.setTimeout; window.setTimeout = (fn, ms, ...a) => native(fn, ms > 2000 ? 60 : ms, ...a); } });
  await page.locator('[data-tour-viewer]').scrollIntoViewIfNeeded();
  await openMore(page);
  await page.click('[data-guide]');
  let hash = '';
  for (let i = 0; i < 40 && hash !== '#' + INT; i++) { await page.waitForTimeout(500); hash = await page.evaluate(() => location.hash); }
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => [document.querySelector('[data-guide]').getAttribute('aria-pressed'), document.querySelector('[data-scene-name]').textContent]);
  check('T24', 'Экскурсия переходит через «дверь» в салон и продолжается там', hash === '#' + INT && st[0] === 'true' && page.errors.length === 0, `hash=${hash} guide=${st[0]} scene=${st[1]} errors=${page.errors}`);
  await page.context().close();
}

// T25 «share»: link to the current view opens the same view
{
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/tours/#' + INT);
  await page.waitForTimeout(2400);
  await page.locator('[data-tour-viewer]').focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('+');
  await page.waitForTimeout(900);
  await page.click('[data-share]');
  await page.waitForTimeout(300);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const note = await page.evaluate(() => document.querySelector('[data-vr-status]').textContent);
  const a = stats(await glShot(page)).png;
  const other = await context.newPage();
  await other.goto(link);
  await other.waitForTimeout(2600);
  const b = stats(await glShot(other)).png;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) diff += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
  diff /= a.data.length / 4 * 3;
  const ok = new RegExp(`/tours/#${INT}@-?\\d+,-?\\d+,\\d+$`).test(link) && /скопирована/.test(note) && diff < 12 && errors.length === 0;
  check('T25', '«Поделиться»: ссылка на текущий вид открывает тот же вид', ok, `link=${link.replace(base, '')} note="${note}" diff=${diff.toFixed(1)} errors=${errors}`);
  await context.close();
}

// T26 numbers in the introduction match the tour data; zoom buttons work
{
  const page = await open('/tours/');
  const nums = await page.evaluate(() => [document.querySelector('[data-stat="scenes"]').textContent, document.querySelector('[data-stat="points"]').textContent]);
  const a = await glShot(page);
  await page.click('[data-zoom="in"]');
  await page.waitForTimeout(500);
  const zoomed = !a.equals(await glShot(page));
  const markers = await page.evaluate(() => [...document.querySelectorAll('.tour-hotspot:not(.is-transition) > span')].map(s => s.textContent).join(','));
  const infoCount = expected[FIRST] - 1;
  const numbered = markers === Array.from({ length: infoCount }, (_, i) => i + 1).join(',');
  check('T26', 'Цифры во вводной части совпадают с туром; кнопки масштаба; точки пронумерованы', nums[0] === String(Object.keys(expected).length) && nums[1] === String(TOTAL) && zoomed && numbered && page.errors.length === 0, `stats=${nums} zoom=${zoomed} markers=${markers}`);
  await page.context().close();
}

// T27 reduced motion: no scripted flights, the camera jumps to the chosen point
{
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/tours/#' + INT);
  await page.waitForTimeout(1500);
  const list = page.locator('[data-hotspot-list] button');
  await list.nth(3).click();
  await page.waitForTimeout(120);
  const title = await page.locator('[data-card-title]').textContent();
  const visible = await page.evaluate(t => [...document.querySelectorAll('.tour-hotspot')].some(b => !b.hidden && b.getAttribute('aria-label') === t), title);
  check('T27', 'Уменьшение движения: без анимации камеры, точка сразу в кадре', visible, `title=${title} visible=${visible}`);
  await context.close();
}

await browser.close();
let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(5)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;

