// Собирает Photo Sphere Viewer и three.js в один локальный файл без CDN:
//   cd vendor-src && npm install && npm run build
// Результат: ../static/vendor/psv.js, psv.css и LICENSES.txt (лицензии MIT).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('../static/vendor');
fs.mkdirSync(out, { recursive: true });
const pkg = name => JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8'));
const libs = ['@photo-sphere-viewer/core', '@photo-sphere-viewer/equirectangular-tiles-adapter', 'three'];
const banner = '/*! 3D-тур РССМП: ' + libs.map(n => `${n} ${pkg(n).version}`).join(', ') + '. Лицензии MIT — vendor/LICENSES.txt */';
await build({
  entryPoints: ['entry.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'RssmpPSV',
  target: ['es2020', 'safari15'],
  legalComments: 'none',
  banner: { js: banner },
  outfile: path.join(out, 'psv.js'),
});
const css = ['@photo-sphere-viewer/core/index.css'].map(f => fs.readFileSync(`node_modules/${f}`, 'utf8').replace(/\/\*# sourceMappingURL=.*?\*\//g, '')).join('\n');
fs.writeFileSync(path.join(out, 'psv.css'), `/* ${libs[0]} ${pkg(libs[0]).version} (MIT) */\n` + css);
const licenses = libs.map(n => `${n} ${pkg(n).version}\n${'='.repeat(60)}\n` + fs.readFileSync(`node_modules/${n}/LICENSE`, 'utf8').trim()).join('\n\n\n');
fs.writeFileSync(path.join(out, 'LICENSES.txt'), licenses + '\n');
for (const f of ['psv.js', 'psv.css', 'LICENSES.txt']) console.log(f, fs.statSync(path.join(out, f)).size, 'bytes');
