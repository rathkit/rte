// The leak test (docs/LEAKS.md): creates and destroys the editor thousands of times, with every plugin, with the standard interface and as
// elements, in Chromium, Firefox and WebKit, and requires that nothing is left on the page. The probe (probe.mjs) counts listeners on window and
// document, live observers, pending timers, elements and style sheets, which works the same in all three engines; Chromium also gets its heap
// read after a forced collection, and a check that destroyed editors are collected. A deliberate leak shows that the probe sees what it should.
//   RTE_PLAYWRIGHT=<node_modules> tools/leak/run.sh [--quick]
import { createRequire } from "node:module";
import { growth, probeScript, settle, snapshot } from "./probe.mjs";

const base = process.argv[2];
const quick = process.argv.includes("--quick");
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
// [kind, warm-up cycles, measured cycles]. "Thousands" for the core; the interface and the elements are heavier, so hundreds.
const plan = [["core", 40, quick ? 300 : 3000], ["ui", 20, quick ? 60 : 400], ["element", 20, quick ? 60 : 400]];

let failures = 0;
let passes = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else { failures++; console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`); }
};

for (const [name, type] of engines) {
  const browser = await type.launch();
  const context = await browser.newContext();
  await context.addInitScript(probeScript);
  await context.route("**/*", (route) => (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  const load = async () => { await page.goto(new URL("/ui/demo/leak.html", base).href); await page.waitForFunction("window.__leakReady===true"); };
  const cycle = (kind, n) => page.evaluate(([k, c]) => window.__leak.cycle(k, c), [kind, n]);
  await load();
  for (const [kind, warm, count] of plan) {
    const started = Date.now();
    await cycle(kind, warm);
    await settle(page);
    const before = await snapshot(page);
    await cycle(kind, count);
    await settle(page);
    const after = await snapshot(page);
    console.log(`${name} ${kind}: ${count} made and destroyed in ${((Date.now() - started) / 1000).toFixed(1)} s; ${JSON.stringify(after)}`);
    check(`${name}: ${count} ${kind} editors made and destroyed leave nothing behind`, growth(before, after).length === 0, { before, after, grew: growth(before, after), listeners: await page.evaluate(() => window.__probe.listenerKeys()) });
  }
  // The probe itself: it must see a deliberate leak, or the checks above would pass for the wrong reason.
  const clean = await snapshot(page);
  await cycle("leaky", 3);
  await settle(page);
  const dirty = await snapshot(page);
  check(`${name}: the probe sees a deliberate leak (a listener, an interval, an observer and an element)`, dirty.listeners > clean.listeners && dirty.timers > clean.timers && dirty.observers > clean.observers && dirty.elements > clean.elements, { clean, dirty });
  check(`${name}: no page error while editors were made and destroyed`, errors.length === 0, errors);

  if (name === "chromium") {
    const client = await context.newCDPSession(page);
    await client.send("HeapProfiler.enable");
    const heap = async () => { await client.send("HeapProfiler.collectGarbage"); await client.send("HeapProfiler.collectGarbage"); return (await client.send("Runtime.getHeapUsage")).usedSize; };
    await load();
    await cycle("core", 200);
    const h0 = await heap();
    const n = quick ? 300 : 3000;
    await cycle("core", n);
    const h1 = await heap();
    console.log(`chromium heap: ${((h1 - h0) / 1024).toFixed(0)} KB more after ${n} editors (${(h0 / 1e6).toFixed(1)} MB before)`);
    check("chromium: the heap does not grow over thousands of editors (under 1 MB)", h1 - h0 < 1024 * 1024, { h0, h1 });
    await page.evaluate(() => window.__leak.weak(50));
    await heap();
    const alive = await page.evaluate(() => window.__leak.alive());
    check("chromium: destroyed editors are collected (none of 50 alive after a collection)", alive === 0, alive);
  }
  await browser.close();
}
console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
