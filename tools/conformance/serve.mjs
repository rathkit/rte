// Serves the editor's conformance page and its built files on 127.0.0.1, for a conformance runner to drive.
//   node tools/conformance/serve.mjs [port]      (default: a free port, printed on the first line)
//   node tools/conformance/serve.mjs --lan [port] for a phone on the same network (hand testing, docs/HAND-TESTING.md): listens on every
//   interface, answers a request whose Host is a private address (10.x, 172.16-31.x, 192.168.x) or a .local name, prints the demo address, and
//   serves the same read-only files as above, for as long as it runs. Use it on a network you trust.
// Only files under packages/rte-core/conformance and packages/rte-core/dist are served, and, under /headless/ /element/, /ui/, /themes/, /icons/ and /frameworks/ (the framework check apps), the dist, demo and css folders of the other packages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../packages/rte-core");
const packages = { "/headless/": resolve(import.meta.dirname, "../../packages/rte-headless"), "/element/": resolve(import.meta.dirname, "../../packages/rte-element"), "/ui/": resolve(import.meta.dirname, "../../packages/rte-ui"), "/themes/": resolve(import.meta.dirname, "../../packages/rte-themes"), "/icons/": resolve(import.meta.dirname, "../../packages/rte-icons"), "/frameworks/": resolve(import.meta.dirname, "../framework-checks") };
const allowed = ["conformance", "dist"];
const allowedOther = ["dist", "demo", "css"];
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".map": "application/json" };

const lan = process.argv.includes("--lan");
const portArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const privateHost = /^(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local):\d+$/i;

const server = createServer(async (req, res) => {
  const host = req.headers.host ?? "";
  const url = new URL(req.url ?? "/", "http://localhost");
  const prefix = Object.keys(packages).find((p) => url.pathname.startsWith(p));
  const isHeadless = prefix !== undefined;
  const base = prefix ? (packages[prefix] ?? root) : root;
  const rel = normalize(decodeURIComponent(url.pathname.slice(prefix ? prefix.length - 1 : 0))).replace(/^[/\\]+/, "");
  const file = join(base, rel.endsWith("/") || rel === "" ? `${rel}index.html` : rel);
  const top = rel.split(/[/\\]/)[0] ?? "";
  if (!(lan ? privateHost : /^(127\.0\.0\.1|localhost):\d+$/).test(host) || !file.startsWith(base) || !(isHeadless ? allowedOther : allowed).includes(top)) {
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
server.listen(Number(portArg ?? 0), lan ? "0.0.0.0" : "127.0.0.1", () => {
  const port = server.address().port;
  if (!lan) { console.log(port); return; }
  const addresses = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address);
  console.log(`Open on the phone (same network): ${addresses.map((a) => `http://${a}:${port}/ui/demo/`).join("  or  ") || `http://<this computer's address>:${port}/ui/demo/`}`);
  console.log("Stop with Ctrl+C.");
});
