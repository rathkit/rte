// Every paste fixture in fixtures/paste, pasted through the standard plugins without a browser: nothing from the source's markup
// noise or any active content may come through, and a fixture's own `expect` (what free paste must keep, and must not) must hold.
// The browser checks paste the same fixtures in Chromium, Firefox and WebKit and check the same expectations there.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { autoformat } from "./autoformat/plugin.ts";
import { createEngine } from "./core.ts";
import { exportHtml } from "./export.ts";
import { find } from "./find/plugin.ts";
import { footnotes } from "./footnotes/plugin.ts";
import { images } from "./images/plugin.ts";
import { lists } from "./lists/plugin.ts";
import { pasteBlocks } from "./paste.ts";
import { svg } from "./svg/plugin.ts";
import { tables } from "./tables/plugin.ts";
import { word } from "./word/plugin.ts";

interface Fixture {
  readonly payloads: Readonly<Record<string, string>>;
  readonly expect?: { readonly includes: readonly string[]; readonly excludes: readonly string[] };
}

const dir = new URL("../../../fixtures/paste/", import.meta.url);
// The standard plugins (`standardPlugins()`), without the parts that draw in a browser.
const engine = createEngine();
for (const plugin of [lists(), tables(), find(), autoformat(), footnotes(), word(), svg(), images()]) engine.use(plugin);

/** What no paste may ever produce, whatever the source: active content, local addresses, and the sources' own markup. */
const NEVER: readonly RegExp[] = [
  /<(?:script|style|iframe|object|embed|form|select|textarea|button|video|audio|math|svg)\b/i,
  /\son[a-z]+=/i,
  /(?:javascript|vbscript|file|cid):/i,
  /<!--|<!\[|<\/?[a-z]+:[a-z]/i,
  /mso-|class="?Mso|SCXW|BCX\d|paraid|ccp_infra|docs-internal-guid/i,
];

for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
  test(`paste fixture ${name}`, () => {
    const fixture = JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Fixture;
    const p = fixture.payloads;
    const data = { types: Object.keys(p), ...(p["text/html"] !== undefined ? { html: p["text/html"] } : {}), ...(p["text/plain"] !== undefined ? { text: p["text/plain"] } : {}) };
    let blocks = pasteBlocks(data, engine.pasteHandlers, engine.importOptions);
    for (const transform of engine.pasteTransforms) {
      const result = transform(blocks);
      assert.ok(!(result instanceof Promise), "no standard paste transform waits when nothing is uploaded");
      blocks = result;
    }
    const html = exportHtml({ blocks });
    assert.ok(html !== "", "something is pasted");
    for (const pattern of NEVER) assert.doesNotMatch(html, pattern);
    for (const wanted of fixture.expect?.includes ?? []) assert.ok(html.includes(wanted), `keeps ${JSON.stringify(wanted)}\n${html}`);
    for (const unwanted of fixture.expect?.excludes ?? []) assert.ok(!html.includes(unwanted), `drops ${JSON.stringify(unwanted)}\n${html}`);
  });
}
