// Local static server that emulates the Apache rules from dist/.htaccess:
// security headers, DirectoryIndex, trailing-slash redirects and ErrorDocument 404.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function headersFromHtaccess() {
  const file = path.join(root, '.htaccess');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*Header\s+always\s+set\s+([\w-]+)\s+"(.*)"\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

http.createServer((req, res) => {
  const security = headersFromHtaccess();
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.includes('..')) { res.writeHead(400); return res.end(); }
  let file = path.join(root, rel);
  const send = (status, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const headers = { ...security, 'Content-Type': types[ext] || 'application/octet-stream' };
    headers['Cache-Control'] = /\.(html|json)$/.test(ext) ? 'no-cache, no-store, must-revalidate' : 'public, max-age=604800';
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  };
  const baseName = path.basename(file);
  if (baseName.startsWith('.') && baseName !== '.') { res.writeHead(403, security); return res.end('Forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!rel.endsWith('/')) { res.writeHead(301, { ...security, Location: rel + '/' + url.search }); return res.end(); }
    const index = path.join(file, 'index.html');
    if (fs.existsSync(index)) return send(200, index);
    res.writeHead(403, security); return res.end('Forbidden');
  }
  if (fs.existsSync(file)) return send(200, file);
  const notFound = path.join(root, '404.html');
  if (fs.existsSync(notFound)) return send(404, notFound);
  res.writeHead(404); res.end('Not found');
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
