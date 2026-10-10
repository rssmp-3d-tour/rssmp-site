// Статические проверки защитных инвариантов. Они дополняют браузерный XSS/CSP-тест
// и аудит npm: задача — не дать будущей правке незаметно ослабить защиту сайта.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? 'OK' : 'FAIL'} — ${message}`);
  if (!condition) failures.push(message);
};

const shell = read('shell.html');
const app = read('static/app.js');
const tour = read('static/tour-viewer.js');
const htaccess = read('beget.htaccess');
const workflow = read('.github/workflows/site.yml');
const firstPartyJs = `${app}\n${tour}`;
const csp = shell.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || '';

check(Boolean(csp), 'CSP задана в HTML для GitHub Pages');
check(!/unsafe-inline|unsafe-eval|data:\s*;/.test(csp), 'CSP не разрешает inline/eval-скрипты');
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"]) {
  check(csp.includes(directive), `CSP содержит ${directive}`);
}
check(!/<base\b/i.test(shell), 'Нет тега base, меняющего разрешение всех URL');
check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(shell), 'В шаблоне нет inline-скриптов');
check(!/\b(?:eval|Function)\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/.test(firstPartyJs), 'Собственный JS не использует опасные HTML/eval API');
check(!/javascript:/i.test(`${shell}\n${firstPartyJs}`), 'Нет javascript:-URL');
check(!/target="_blank"(?![^>]*rel="[^"]*noopener[^"]*noreferrer)/i.test(shell), 'Внешнее новое окно защищено noopener+noreferrer');

for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) {
  check(htaccess.includes(header), `.htaccess задаёт ${header}`);
}
check(/frame-ancestors 'none'/.test(htaccess), 'Beget запрещает встраивание сайта во фрейм');
check(/permissions:\s*\n\s*contents:\s*read/.test(workflow), 'GitHub Actions имеет только contents: read');
check(!/pull_request_target/.test(workflow), 'Workflow не выполняет недоверенный PR-код с повышенным контекстом');
const actions = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(match => match[1]);
check(actions.length > 0 && actions.every(value => /@[0-9a-f]{40}$/.test(value)), 'Все GitHub Actions закреплены на полном commit SHA');

for (const lockPath of ['tests/package-lock.json', 'vendor-src/package-lock.json']) {
  const lock = JSON.parse(read(lockPath));
  const remotePackages = Object.entries(lock.packages || {}).filter(([name]) => name && name !== '');
  check(remotePackages.length > 0 && remotePackages.every(([, meta]) => typeof meta.integrity === 'string' && meta.integrity.startsWith('sha512-')), `${lockPath}: зависимости закреплены integrity-хэшами`);
}

if (failures.length) {
  console.error(`\nПровалено проверок: ${failures.length}`);
  process.exit(1);
}
console.log('\nSecurity-инварианты: OK');
