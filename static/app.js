'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

// Mobile menu
const menu = $('.menu'), nav = $('#nav');
const setMenu = open => {
  nav.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.textContent = open ? 'Закрыть' : 'Меню';
};
menu?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));

// Display settings: stored only in this browser
const prefs = { large: false, contrast: false, motion: false };
const prefBoxes = [['large-text', 'large'], ['high-contrast', 'contrast'], ['reduce-motion', 'motion']];
try {
  const saved = JSON.parse(localStorage.getItem('rssmp-display') || '{}');
  for (const k of Object.keys(prefs)) prefs[k] = saved[k] === true;
} catch {}
const applyPrefs = () => {
  const html = document.documentElement;
  html.classList.toggle('large-text', prefs.large);
  html.classList.toggle('high-contrast', prefs.contrast);
  html.classList.toggle('no-motion', prefs.motion);
  for (const [id, key] of prefBoxes) { const box = $('#' + id); if (box) box.checked = prefs[key]; }
};
applyPrefs();
const savePrefs = () => { applyPrefs(); try { localStorage.setItem('rssmp-display', JSON.stringify(prefs)); } catch {} };
for (const [id, key] of prefBoxes) $('#' + id)?.addEventListener('change', e => { prefs[key] = e.target.checked; savePrefs(); });
$('#reset-settings')?.addEventListener('click', () => { for (const k in prefs) prefs[k] = false; savePrefs(); toast('Настройки сброшены'); });

// Dialogs
const openDialog = dialog => { if (dialog && !dialog.open) dialog.showModal(); };
$$('[data-open-settings]').forEach(b => b.addEventListener('click', () => openDialog($('#settings-dialog'))));
$$('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => {
  const r = d.getBoundingClientRect();
  if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
}));

// Site search over the local index
let searchPages = null, searchLoading = null;
const normalize = s => s.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
function snippet(text, word) {
  const clean = text.replace(/\s+/g, ' ');
  const at = word ? normalize(clean).indexOf(word) : -1;
  const start = at > 60 ? clean.lastIndexOf(' ', at - 50) + 1 : 0;
  const part = clean.slice(start, start + 140);
  return (start > 0 ? '…' : '') + part + (start + 140 < clean.length ? '…' : '');
}
function renderSearch() {
  const query = normalize($('#site-search').value), box = $('#search-results');
  box.replaceChildren();
  if (!searchPages) return;
  const words = query.split(/\s+/).filter(Boolean);
  const found = searchPages.filter(p => words.every(w => normalize(p.title + ' ' + p.text).includes(w)));
  // Pages whose title matches the query come first.
  const titleHits = p => words.filter(w => normalize(p.title).includes(w)).length;
  found.sort((a, b) => titleHits(b) - titleHits(a));
  $('.search-status').textContent = query
    ? (found.length ? `Найдено разделов: ${found.length}` : 'Ничего не найдено. Попробуйте «контакты», «пациентам» или «тур».')
    : 'Выберите раздел или введите запрос.';
  for (const p of found) {
    const a = document.createElement('a');
    a.className = 'search-result';
    a.href = p.url;
    const title = document.createElement('strong');
    title.textContent = p.title;
    const desc = document.createElement('p');
    desc.textContent = snippet(p.text, words.find(w => normalize(p.text).includes(w)));
    a.append(title, desc);
    box.append(a);
  }
}
async function startSearch() {
  openDialog($('#search-dialog'));
  $('#site-search').focus();
  if (searchPages) { renderSearch(); return; }
  $('.search-status').textContent = 'Загружаем разделы…';
  const url = document.documentElement.dataset.searchIndex || '/search-index.json';
  if (!searchLoading) searchLoading = fetch(url)
    .then(r => { if (!r.ok) throw new Error('load'); return r.json(); })
    .then(p => { searchPages = p; })
    .catch(() => { $('.search-status').textContent = 'Не удалось загрузить поиск. Закройте окно и попробуйте снова.'; })
    .finally(() => { searchLoading = null; });
  await searchLoading;
  if (searchPages) renderSearch();
}
$$('[data-open-search]').forEach(b => b.addEventListener('click', startSearch));
$('#site-search')?.addEventListener('input', renderSearch);
$('#site-search')?.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const first = $('#search-results .search-result');
  if (first) { e.preventDefault(); first.click(); }
});

// Gallery
const photos = $$('[data-photo]');
let photoIndex = 0;
const showPhoto = i => {
  photoIndex = (i + photos.length) % photos.length;
  const selected = photos[photoIndex], dialog = $('#gallery-dialog'), img = dialog.querySelector('img');
  img.src = selected.dataset.photo;
  img.alt = selected.querySelector('img').alt;
  $('#photo-caption').textContent = img.alt;
  $('#gallery-count').textContent = `${photoIndex + 1} / ${photos.length}`;
  openDialog(dialog);
};
photos.forEach((b, i) => b.addEventListener('click', () => showPhoto(i)));
$('#photo-prev')?.addEventListener('click', () => showPhoto(photoIndex - 1));
$('#photo-next')?.addEventListener('click', () => showPhoto(photoIndex + 1));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && nav?.classList.contains('open')) { setMenu(false); menu.focus(); }
  if ($('#gallery-dialog')?.open) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(photoIndex - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(photoIndex + 1); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); startSearch(); }
});

// News filters
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const value = button.dataset.filter;
  let count = 0;
  $$('[data-category]').forEach(card => { card.hidden = value !== 'all' && card.dataset.category !== value; if (!card.hidden) count++; });
  $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('#filter-status').textContent = `Показано публикаций: ${count}`;
}));

// Toast and copying. navigator.clipboard exists only on HTTPS, so on plain HTTP
// the address is copied through a temporary text field.
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}
async function copyText(text, returnFocus) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'copy-buffer';
  document.body.append(area);
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  area.remove();
  returnFocus?.focus();
  return copied;
}
$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  toast(await copyText(b.dataset.copy, b) ? 'Адрес скопирован' : 'Не удалось скопировать. Выделите адрес и скопируйте вручную.');
}));

// Reveal on scroll (skipped when motion is reduced)
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches && !prefs.motion) {
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
  }, { threshold: .08 });
  $$('.section .two-col,.section-title,.card,.partners,.gallery figure,.info-box').forEach(el => { el.classList.add('reveal-ready'); observer.observe(el); });
}
