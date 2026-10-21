// Local-only server for the paste capture page. Node built-ins only.
// Binds to 127.0.0.1, serves four static files, and writes each capture to ./captures/.
//   node serve.mjs            (default port 4455, or set PORT)
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4455);
const capturesDir = join(here, 'captures');
const maxBytes = 20 * 1024 * 1024;
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/capture.js': ['capture.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const csp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src data:", "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

const send = (res, status, type, body) => {
  res.writeHead(status, {
    'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': csp,
  });
  res.end(body);
};
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

const server = createServer((req, res) => {
  // Refuse requests whose Host is not this machine, so a web page cannot reach us by DNS rebinding.
  const host = req.headers.host ?? '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, 'text/plain', 'bad host');

  if (req.method === 'GET' && files[req.url]) {
    const [name, type] = files[req.url];
    return send(res, 200, type, readFileSync(join(here, name)));
  }
  if (req.method === 'POST' && req.url === '/save') {
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, 403, 'text/plain', 'bad origin');
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { send(res, 413, 'text/plain', 'too large'); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      if (size > maxBytes) return;
      try {
        const capture = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        mkdirSync(capturesDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = `${stamp}_${slug(capture?.meta?.app)}_${slug(capture?.meta?.browser)}_${slug(capture?.meta?.sample)}.json`;
        writeFileSync(join(capturesDir, name), JSON.stringify(capture, null, 2));
        send(res, 200, 'application/json', JSON.stringify({ file: `captures/${name}` }));
      } catch {
        send(res, 400, 'text/plain', 'bad json');
      }
    });
    return;
  }
  send(res, 404, 'text/plain', 'not found');
});
server.listen(port, '127.0.0.1', () => console.log(`paste capture: http://localhost:${port}/  (writing to ${capturesDir})`));
