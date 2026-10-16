// Finds words in headings/large text that are wider than their container (clipped or broken mid-word).
import { chromium } from 'playwright';
const base = process.argv[2];
const b = await chromium.launch();
const routes = ['/', '/about/', '/patients/', '/news/', '/tours/', '/gallery/', '/contacts/', '/privacy/', '/404.html'];
for (const [w, h] of [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390], [1024, 768], [1366, 768], [1920, 1080]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 800 });
  const p = await ctx.newPage();
  const found = [];
  for (const r of routes) {
    await p.goto(base + r);
    const bad = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('h1, h2, h3, .photo-label p, .error-code, .info-box > a')) {
        if (el.closest('dialog, [hidden]')) continue;
        const cs = getComputedStyle(el);
        const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (!el.clientWidth) continue;
        for (const word of el.innerText.split(/\s+/).filter(Boolean)) {
          const s = document.createElement('span');
          s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform}`;
          s.textContent = word; document.body.append(s);
          const ww = s.getBoundingClientRect().width; s.remove();
          if (ww > avail + 0.5) out.push(`${el.tagName.toLowerCase()}.${el.className} "${word}" ${Math.round(ww)}>${Math.round(avail)}`);
        }
      }
      return out;
    });
    if (bad.length) found.push(`${r}: ${bad.join('; ')}`);
  }
  console.log(`${w}px: ${found.length ? '\n  ' + found.join('\n  ') : 'ok'}`);
  await ctx.close();
}
await b.close();
