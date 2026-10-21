// Prints one line per saved capture: source, browser, sample and the clipboard types with sizes.
//   node summarize.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('./captures/', import.meta.url).pathname;
let names = [];
try { names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch {}
if (!names.length) { console.log('No captures yet.'); process.exit(0); }
for (const name of names) {
  const c = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const types = c.types.map((t) => `${t}:${c.payloads[t].length}`).join(' ');
  console.log(`${c.meta.app} | ${c.meta.browser} | ${c.meta.os} | ${c.meta.sample || '-'} | ${types}${c.files?.length ? ` | ${c.files.length} file(s)` : ''}`);
}
console.log(`\n${names.length} capture(s)`);
