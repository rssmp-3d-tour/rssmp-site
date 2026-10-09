// Builds a TEST-ONLY copy of the site with other tour panoramas:
// - vehicles (default): four different synthetic panorama files without the station yard,
//   to check that the B/C selector works and each class shows its own pictures;
// - demo: the demonstration panoramas only, as before the station shots.
// The synthetic panoramas never go to the real dist.
// Usage: node make-vehicles-variant.mjs <project-dir> <output-dir> [vehicles|demo]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const [project, out] = process.argv.slice(2, 4).map(p => path.resolve(p));
const mode = process.argv[4] || 'vehicles';
if (!['vehicles', 'demo'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['build_pages.py', 'shell.html', 'home.html', 'beget.htaccess', 'static']) {
  fs.cpSync(path.join(project, name), path.join(out, name), { recursive: true });
}

const colors = { 'b-exterior': [70, 130, 180], 'b-interior': [200, 170, 90], 'c-exterior': [90, 160, 110], 'c-interior': [170, 90, 140] };
const demo = { 'b-exterior': 'tour-exterior-demo.jpg', 'b-interior': 'tour-interior-demo.jpg', 'c-exterior': 'tour-exterior-demo.jpg', 'c-interior': 'tour-interior-demo.jpg' };
const files = mode === 'demo' ? demo : {};
if (mode === 'vehicles') for (const [scene, [r, g, b]] of Object.entries(colors)) {
  const png = new PNG({ width: 1024, height: 512 });
  for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4, stripe = ((x >> 5) + (y >> 5)) % 2 ? 1 : 0.55, shade = 0.5 + 0.5 * (1 - y / 511);
    png.data[i] = r * stripe * shade; png.data[i + 1] = g * stripe * shade; png.data[i + 2] = b * stripe * shade; png.data[i + 3] = 255;
  }
  files[scene] = `tour-${scene}-test.png`;
  fs.writeFileSync(path.join(out, 'static', 'assets', files[scene]), PNG.sync.write(png));
}

const buildFile = path.join(out, 'build_pages.py');
const source = fs.readFileSync(buildFile, 'utf8');
const config = `TOUR_PANORAMAS = {\n${Object.entries(files).map(([k, v]) => `    '${k}': '${v}',`).join('\n')}\n}`;
const updated = source.replace(/TOUR_PANORAMAS = \{[\s\S]*?\n\}/, config);
if (updated === source) throw new Error('TOUR_PANORAMAS not found in build_pages.py');
fs.writeFileSync(buildFile, updated);
process.stdout.write(execFileSync('python3', [buildFile], { encoding: 'utf8' }));
