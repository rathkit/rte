import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from "@angular/ssr/node";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Angular answers only for hosts it was told about (a guard against forged Host headers); the check reaches the app as 127.0.0.1.
const engine = new AngularNodeAppEngine({ allowedHosts: ["127.0.0.1"] });
const browserFolder = join(dirname(fileURLToPath(import.meta.url)), "../browser");
const types: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon", ".json": "application/json" };

// The files the build puts in the browser folder (the app's script and styles), served as an Express app does with its static folder.
function sendFile(request: IncomingMessage, response: ServerResponse): boolean {
  const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname));
  const file = join(browserFolder, path);
  if (!file.startsWith(browserFolder) || path === "/" || !existsSync(file) || !statSync(file).isFile()) return false;
  response.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(response);
  return true;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (sendFile(request, response)) return;
  const answer = await engine.handle(request);
  if (answer) await writeResponseToNodeResponse(answer, response);
  else { response.statusCode = 404; response.end("Not found"); }
}

// The handler the Angular build asks for, and a plain server when this file is run on its own (no Express, nothing else to install).
export const reqHandler = createNodeRequestHandler(handle);
if (isMainModule(import.meta.url)) {
  createServer((request, response) => { handle(request, response).catch((error) => { console.error(error); response.statusCode = 500; response.end(); }); }).listen(3000, "0.0.0.0");
}
