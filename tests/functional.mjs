// Functional checks of shared UI: menu, search, settings, dialogs, gallery,
// news filters, copying, 404 and redirects. Usage: node functional.mjs http://localhost:8082
import { chromium } from 'playwright';

const base = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: Boolean(ok), detail }); };
const browser = await chromium.launch();

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ru-RU', ...options });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => { page.errors.push(`unexpected dialog: ${d.message()}`); d.dismiss(); });
  return page;
}

// F1 mobile menu
{
  const page = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(base + '/about/');
  const menu = page.locator('.menu');
  await menu.click();
  const opened = await page.evaluate(() => [document.querySelector('#nav').classList.contains('open'), getComputedStyle(document.querySelector('#nav')).display, document.querySelector('.menu').getAttribute('aria-expanded'), document.querySelector('.menu').textContent]);
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => [document.querySelector('#nav').classList.contains('open'), document.activeElement === document.querySelector('.menu'), document.querySelector('.menu').getAttribute('aria-expanded')]);
  const links = await page.locator('#nav a').count();
  const activeHome = await (async () => { await page.goto(base + '/'); return page.evaluate(() => document.querySelector('#nav a[aria-current="page"]')?.getAttribute('href') || null); })();
  check('F1', 'Мобильное меню: открытие, Escape, возврат фокуса', opened[0] && opened[1] !== 'none' && opened[2] === 'true' && opened[3] === 'Закрыть' && !closed[0] && closed[1] && closed[2] === 'false', `open=${opened} closed=${closed}`);
  check('F1b', 'Меню: 7 пунктов, «Главная» отмечена на главной', links === 7 && activeHome === '/', `links=${links} current=${activeHome}`);
  check('F1c', 'Нет ошибок JS (меню)', page.errors.length === 0, page.errors.join('; '));
}

// F2 search
{
  const page = await newPage();
  await page.goto(base + '/');
  await page.click('[data-open-search]');
  await page.waitForFunction(() => document.querySelectorAll('#search-results .search-result').length > 0);
  const all = await page.locator('#search-results .search-result').count();
  const focused = await page.evaluate(() => document.activeElement?.id);
  await page.fill('#site-search', 'контакты');
  const contacts = await page.locator('#search-results .search-result strong').allTextContents();
  await page.fill('#site-search', 'Лермонтова');
  const ye = await page.locator('#search-results .search-result').count();
  await page.fill('#site-search', 'приёмная');
  const yo = await page.locator('#search-results .search-result').count();
  await page.fill('#site-search', 'приемная');
  const yoAlt = await page.locator('#search-results .search-result').count();
  await page.fill('#site-search', 'зззкккфывап');
  const none = await page.locator('.search-status').textContent();
  await page.fill('#site-search', '<img src=x onerror=alert(1)>');
  await page.waitForTimeout(200);
  const injected = await page.evaluate(() => document.querySelectorAll('#search-results img').length);
  await page.fill('#site-search', 'о станции');
  const snippet = await page.locator('#search-results .search-result p').first().textContent();
  await page.fill('#site-search', 'контакты');
  await page.press('#site-search', 'Enter');
  await page.waitForTimeout(500);
  const afterEnter = page.url();
  await page.goto(base + '/');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  const ctrlK = await page.evaluate(() => document.querySelector('#search-dialog').open);
  await page.keyboard.press('Escape');
  const escClosed = await page.evaluate(() => !document.querySelector('#search-dialog').open);
  check('F2a', 'Поиск: открытие, фокус в поле, пустой запрос показывает все 8 разделов', all === 8 && focused === 'site-search', `all=${all} focus=${focused}`);
  check('F2b', 'Поиск: кириллица, ё/е', contacts.includes('Контакты') && ye >= 1 && yo >= 1 && yo === yoAlt, `contacts=${contacts} ye=${ye} yo=${yo}/${yoAlt}`);
  check('F2d', 'Поиск: сообщение «Ничего не найдено»', /Ничего не найдено/.test(none), none);
  check('F2e', 'Поиск: XSS-строка не превращается в разметку', injected === 0 && page.errors.length === 0, `img=${injected} errors=${page.errors}`);
  check('F2f', 'Поиск: Enter открывает первый результат', afterEnter.endsWith('/contacts/'), afterEnter);
  check('F2g', 'Поиск: Ctrl+K и Escape', ctrlK && escClosed, `ctrlK=${ctrlK} esc=${escClosed}`);
  check('F2h', 'Поиск: фрагмент текста показывает место совпадения', /станци/i.test(snippet || ''), snippet);
}

// F3 search index failure
{
  const page = await newPage();
  await page.route('**/search-index.json*', route => route.abort());
  await page.goto(base + '/');
  await page.click('[data-open-search]');
  await page.waitForTimeout(500);
  const status = await page.locator('.search-status').textContent();
  check('F3', 'Поиск: понятное сообщение при ошибке загрузки индекса', /Не удалось загрузить поиск/.test(status), status);
}

// F4 settings persist + reset + blocked storage
{
  const page = await newPage();
  await page.goto(base + '/patients/');
  await page.click('[data-open-settings]');
  await page.check('#large-text');
  await page.check('#high-contrast');
  await page.check('#reduce-motion');
  const applied = await page.evaluate(() => ['large-text', 'high-contrast', 'no-motion'].map(c => document.documentElement.classList.contains(c)));
  await page.reload();
  const persisted = await page.evaluate(() => ['large-text', 'high-contrast', 'no-motion'].map(c => document.documentElement.classList.contains(c)));
  await page.click('[data-open-settings]');
  await page.click('#reset-settings');
  const reset = await page.evaluate(() => ['large-text', 'high-contrast', 'no-motion'].map(c => document.documentElement.classList.contains(c)).some(Boolean));
  check('F4a', 'Настройки: применение, сохранение после перезагрузки, сброс', applied.every(Boolean) && persisted.every(Boolean) && !reset, `applied=${applied} persisted=${persisted} reset=${reset}`);
  const blocked = await newPage();
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await blocked.goto(base + '/');
  await blocked.click('[data-open-settings]');
  await blocked.check('#large-text');
  const works = await blocked.evaluate(() => document.documentElement.classList.contains('large-text'));
  check('F4b', 'Настройки: работают при запрещённом localStorage', works && blocked.errors.length === 0, blocked.errors.join('; '));
}

// F5 dialogs: backdrop, focus trap, focus return
{
  const page = await newPage();
  await page.goto(base + '/');
  const opener = page.locator('[data-open-settings]');
  await opener.focus();
  await page.keyboard.press('Enter');
  const inside = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('#settings-dialog')); })); }
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => !document.querySelector('#settings-dialog').open);
  const returned = await page.evaluate(() => document.activeElement?.hasAttribute('data-open-settings'));
  check('F5', 'Диалоги: фокус остаётся внутри, закрытие кликом по фону, возврат фокуса', inside.every(Boolean) && closed && returned, `inside=${inside} closed=${closed} returned=${returned}`);
}

// F6 gallery
{
  const page = await newPage();
  await page.goto(base + '/gallery/');
  const first = page.locator('[data-photo]').first();
  await first.click();
  const c1 = await page.locator('#gallery-count').textContent();
  await page.keyboard.press('ArrowRight');
  const c2 = await page.locator('#gallery-count').textContent();
  const cap2 = await page.locator('#photo-caption').textContent();
  await page.click('#photo-next');
  await page.click('#photo-next');
  const wrap = await page.locator('#gallery-count').textContent();
  await page.keyboard.press('ArrowLeft');
  const back = await page.locator('#gallery-count').textContent();
  const big = await page.evaluate(() => { const img = document.querySelector('#gallery-dialog img'); return [img.naturalWidth, img.getAttribute('src')]; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const focusBack = await page.evaluate(() => document.activeElement?.hasAttribute('data-photo'));
  const thumbs = await page.evaluate(() => [...document.querySelectorAll('.gallery img')].map(i => i.currentSrc.split('/').pop()));
  check('F6a', 'Галерея: открытие, стрелки, кнопки, цикл, подписи, Escape и возврат фокуса', c1 === '1 / 3' && c2 === '2 / 3' && wrap === '1 / 3' && back === '3 / 3' && cap2 && focusBack, `${c1},${c2},${wrap},${back} cap=${cap2} focus=${focusBack}`);
  check('F6b', 'Галерея: в окне просмотра — полноразмерное фото', big[0] >= 1100, `${big}`);
  check('F6c', 'Галерея: миниатюры (информационно)', true, thumbs.join(', '));
}

// F7 news filters
{
  const page = await newPage();
  await page.goto(base + '/news/');
  const visible = () => page.evaluate(() => [...document.querySelectorAll('[data-category]')].filter(c => !c.hidden && getComputedStyle(c).display !== 'none').length);
  await page.click('[data-filter="Пациентам"]');
  const a = await visible(); const sa = await page.locator('#filter-status').textContent();
  await page.click('[data-filter="Услуги"]');
  const b = await visible();
  await page.click('[data-filter="all"]');
  const c = await visible();
  const pressed = await page.locator('[data-filter="all"]').getAttribute('aria-pressed');
  check('F7', 'Фильтры новостей и сообщение для screen reader', a === 2 && b === 1 && c === 3 && /2/.test(sa) && pressed === 'true', `${a}/${b}/${c} status="${sa}"`);
}

// F8 copy address: secure context and HTTP-like context without Clipboard API
{
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(base + '/contacts/');
  await page.click('[data-copy]');
  await page.waitForTimeout(300);
  const toast1 = await page.locator('#toast').textContent();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('F8a', 'Копирование адреса (Clipboard API доступен)', toast1 === 'Адрес скопирован' && clip.includes('Лермонтова'), `${toast1} | ${clip}`);
  const http = await newPage();
  await http.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined }); });
  await http.goto(base + '/contacts/');
  await http.click('[data-copy]');
  await http.waitForTimeout(300);
  const toast2 = await http.locator('#toast').textContent();
  const focusKept = await http.evaluate(() => document.activeElement?.hasAttribute('data-copy'));
  check('F8b', 'Копирование адреса без Clipboard API (как на HTTP)', toast2 === 'Адрес скопирован' && focusKept, `${toast2} focus=${focusKept}`);
}

// F9 404 and redirects
{
  const page = await newPage();
  const r = await page.goto(base + '/no-such-page/');
  const h1 = await page.locator('h1').textContent();
  const css = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check('F9a', '404: код ответа и собственная страница со стилями', r.status() === 404 && /не найдена/.test(h1) && /system-ui/.test(css), `${r.status()} ${h1}`);
  const redirect = await fetch(base + '/about', { redirect: 'manual' });
  check('F9b', '/about без слэша → 301 на /about/', redirect.status === 301 && /\/about\/$/.test(redirect.headers.get('location') || ''), `${redirect.status} ${redirect.headers.get('location')}`);
}

// F10 skip link and keyboard start
{
  const page = await newPage();
  await page.goto(base + '/patients/');
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => document.activeElement?.className);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const inMain = await page.evaluate(() => Boolean(document.activeElement?.closest('main')));
  check('F10', 'Ссылка «Перейти к содержимому» переносит фокус в основной блок', skip === 'skip' && inMain, `first=${skip} next-in-main=${inMain}`);
}

// F11 reduced motion: content visible without animation
{
  const page = await newPage({ reducedMotion: 'reduce' });
  await page.goto(base + '/');
  const hidden = await page.evaluate(() => document.querySelectorAll('.reveal-ready').length);
  check('F11', 'prefers-reduced-motion: блоки не скрываются для анимации', hidden === 0, `reveal-ready=${hidden}`);
}

// F12 print: reveal blocks are visible when printing
{
  const page = await newPage();
  await page.goto(base + '/');
  await page.emulateMedia({ media: 'print' });
  const opacity = await page.evaluate(() => [...document.querySelectorAll('.reveal-ready:not(.visible)')].map(e => getComputedStyle(e).opacity));
  check('F12', 'Печать: блоки, ещё не показанные анимацией, видимы', opacity.every(o => o === '1'), `opacities=${opacity.join(',')}`);
}

// F13 security policy works without server headers (GitHub Pages): inline scripts are blocked by <meta> CSP
{
  const page = await newPage();
  await page.goto(base + '/');
  const res = await page.evaluate(() => new Promise(resolve => {
    let violation = '';
    document.addEventListener('securitypolicyviolation', e => { violation = e.violatedDirective; }, { once: true });
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true';
    document.head.append(s);
    setTimeout(() => resolve({ ran: window.__inlineRan === true, violation, meta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') }), 200);
  }));
  const other = page.errors.filter(e => !/Content Security Policy/.test(e));
  check('F13', 'CSP в <meta>: встроенный скрипт заблокирован даже без заголовков сервера', !res.ran && /script-src/.test(res.violation) && res.meta && other.length === 0, `ran=${res.ran} violation=${res.violation} meta=${res.meta} other errors=${other}`);
}

await browser.close();
let failed = 0;
for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(4)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
