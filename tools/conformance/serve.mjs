// Serves the editor's conformance page and its built files on 127.0.0.1, for a conformance runner to drive.
//   node tools/conformance/serve.mjs [port]      (default: a free port, printed on the first line)
// Only files under packages/rte-core/conformance and packages/rte-core/dist are served, and, under /headless/, packages/rte-headless/dist and demo.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../packages/rte-core");
const headless = resolve(import.meta.dirname, "../../packages/rte-headless");
const allowed = ["conformance", "dist"];
const allowedHeadless = ["dist", "demo"];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".map": "application/json" };

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? "";
  const url = new URL(req.url ?? "/", "http://localhost");
  const isHeadless = url.pathname.startsWith("/headless/");
  const base = isHeadless ? headless : root;
  const rel = normalize(decodeURIComponent(url.pathname.slice(isHeadless ? "/headless".length : 0))).replace(/^[/\\]+/, "");
  const file = join(base, rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel);
  const top = rel.split(/[/\\]/)[0] ?? "";
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || !file.startsWith(base) || !(isHeadless ? allowedHeadless : allowed).includes(top)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(url.pathname.endsWith("/") ? join(base, rel, "index.html") : file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
server.listen(Number(process.argv[2] ?? 0), "127.0.0.1", () => console.log(server.address().port));
