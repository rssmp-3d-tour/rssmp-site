// Page-level audit: console/CSP/network errors, horizontal overflow, headings,
// duplicate ids, images, axe-core. Usage: node audit.mjs http://localhost:8081 out-dir
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.argv[2];
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const routes = ['/', '/about/', '/patients/', '/news/', '/tours/', '/gallery/', '/contacts/', '/privacy/', '/404.html'];
const viewports = [[1920, 1080], [1366, 768], [1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800]];
const shotViewports = new Set(['1366x768', '390x844']);
const launchArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const browser = await chromium.launch({ args: launchArgs });
const report = { base, pages: [], axe: [], links: {} };

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += step) { scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 40)); }
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
}

for (const [w, h] of viewports) {
  const mobile = w < 800;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'ru-RU' });
  for (const route of routes) {
    const page = await context.newPage();
    const issues = [];
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) issues.push(`console.${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => issues.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => issues.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith(route === '/404.html' ? '/404.html' : '#never')) issues.push(`http ${r.status()}: ${r.url()}`); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
    const started = Date.now();
    const resp = await page.goto(base + route, { waitUntil: 'load' });
    const loadMs = Date.now() - started;
    await page.waitForTimeout(route === '/tours/' ? 2500 : 600);
    await scrollThrough(page);
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const vw = doc.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > vw + 1 || r.left < -1)) {
          let clipped = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1 && pr.left >= -1) { clipped = true; break; } }
          }
          if (!clipped && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        }
      }
      const ids = {};
      document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(hd => !hd.closest('dialog') && !hd.closest('[hidden]')).map(hd => `${hd.tagName}:${hd.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)}`);
      const smallTargets = [...document.querySelectorAll('a[href],button,input,[tabindex="0"]')].filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('dialog:not([open])') && (r.width < 24 || r.height < 24) && !(e.closest('p, li, dd, .source, .footer-grid, .footer-bottom, .topbar')); }).map(e => `${e.tagName.toLowerCase()}${e.className ? '.' + [...e.classList].join('.') : ''}"${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 25)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      return {
        scrollWidth: doc.scrollWidth, clientWidth: vw, overflow: doc.scrollWidth > vw,
        offenders: offenders.slice(0, 12),
        duplicateIds: Object.entries(ids).filter(([, n]) => n > 1).map(([id]) => id),
        headings,
        h1Count: document.querySelectorAll('h1').length,
        imgsNoAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.src),
        imgsNoSize: [...document.querySelectorAll('img')].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src')),
        brokenImgs: [...document.querySelectorAll('img[src]')].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.src),
        hiddenReveal: [...document.querySelectorAll('.reveal-ready:not(.visible)')].length,
        title: document.title,
        description: document.querySelector('meta[name=description]')?.content,
        canonical: document.querySelector('link[rel=canonical]')?.href || null,
        robots: document.querySelector('meta[name=robots]')?.content,
        smallTargets: smallTargets.slice(0, 15),
        links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
        blankNoRel: [...document.querySelectorAll('a[target=_blank]')].filter(a => !/noopener/.test(a.rel)).map(a => a.href),
        transfer: performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.encodedBodySize || 0),
        requests: performance.getEntriesByType('resource').length + 1
      };
    });
    const key = `${w}x${h}`;
    if (shotViewports.has(key)) await page.screenshot({ path: path.join(out, `${key}${route.replace(/\//g, '_') || '_'}.png`), fullPage: true });
    report.pages.push({ route, viewport: key, status: resp.status(), loadMs, issues: [...new Set(issues)], ...metrics, links: undefined });
    for (const href of metrics.links) report.links[href] = (report.links[href] || 0) + 1;
    await page.close();
  }
  await context.close();
}

// axe-core with CSP bypass (injecting the library inline would be blocked by CSP).
for (const [w, h] of [[1366, 768], [390, 844]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, bypassCSP: true, isMobile: w < 800, hasTouch: w < 800 });
  for (const route of routes) {
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForTimeout(route === '/tours/' ? 2500 : 500);
    await scrollThrough(page);
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async () => await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
    report.axe.push({ route, viewport: `${w}x${h}`, violations: result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 6).map(n => `${n.target.join(' ')} :: ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220)}`), count: v.nodes.length })) });
    await page.close();
  }
  await context.close();
}

// Internal link check
const internal = Object.keys(report.links).filter(h => h.startsWith('/') && !h.startsWith('//'));
report.internalLinkStatus = {};
for (const href of internal) {
  const r = await fetch(base + href.split('#')[0], { redirect: 'manual' });
  report.internalLinkStatus[href] = r.status;
}
await browser.close();
fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 1));

// Human summary
const lines = [];
for (const p of report.pages) {
  const flags = [];
  if (p.status !== 200 && p.route !== '/404.html') flags.push(`status ${p.status}`);
  if (p.overflow) flags.push(`H-OVERFLOW ${p.scrollWidth}>${p.clientWidth}: ${p.offenders.join(', ')}`);
  if (p.issues.length) flags.push(`ISSUES: ${p.issues.join(' | ')}`);
  if (p.duplicateIds.length) flags.push(`dup ids ${p.duplicateIds}`);
  if (p.h1Count !== 1) flags.push(`h1=${p.h1Count}`);
  if (p.brokenImgs.length) flags.push(`broken img ${p.brokenImgs}`);
  if (p.hiddenReveal) flags.push(`reveal-hidden ${p.hiddenReveal}`);
  lines.push(`${p.viewport.padEnd(9)} ${p.route.padEnd(11)} ${flags.join(' ; ') || 'ok'}`);
}
lines.push('', 'AXE:');
for (const a of report.axe) for (const v of a.violations) lines.push(`${a.viewport} ${a.route} [${v.impact}] ${v.id} x${v.count}: ${v.help}\n    ${v.nodes.join('\n    ')}`);
lines.push('', 'Internal links non-200:', ...Object.entries(report.internalLinkStatus).filter(([, s]) => s !== 200).map(([h, s]) => `${h} -> ${s}`));
lines.push('', 'Headings (1366):', ...report.pages.filter(p => p.viewport === '1366x768').map(p => `${p.route}: ${p.headings.join(' > ')}`));
lines.push('', 'Small targets (390):', ...report.pages.filter(p => p.viewport === '390x844').map(p => `${p.route}: ${p.smallTargets.join('; ')}`));
lines.push('', 'Weight (1366):', ...report.pages.filter(p => p.viewport === '1366x768').map(p => `${p.route}: ${(p.transfer / 1024).toFixed(0)} KB, ${p.requests} req, load ${p.loadMs} ms`));
lines.push('', 'Meta:', ...report.pages.filter(p => p.viewport === '1366x768').map(p => `${p.route}: title="${p.title}" robots=${p.robots} canonical=${p.canonical} desc=${p.description?.slice(0, 50)}`));
lines.push('', 'Images without width/height:', [...new Set(report.pages.flatMap(p => p.imgsNoSize))].join(', '));
fs.writeFileSync(path.join(out, 'summary.txt'), lines.join('\n'));
console.log(lines.join('\n'));
