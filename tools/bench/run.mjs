// The benchmark harness: numbers, not pass or fail. It drives the built editor in Chromium and writes what it measured, with the machine
// and the method, to a JSON file and to the console as tables. docs/MEASUREMENTS.md says how to read them.
//   RTE_PLAYWRIGHT=tools/browser-checks/node_modules tools/bench/run.sh [--quick] [--out results.json] [--class "name of the machine class"]
// The browser checks (tools/browser-checks) hold the editor to its speed budgets; this reports the figures, and only an alarm (a figure
// several times what the last full run found) fails, so a slow shared runner does not.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import os from "node:os";

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:/.test(a));
const flag = (name) => args.includes(name);
const option = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
const quick = flag("--quick");
const out = option("--out");
const machineClass = option("--class") ?? process.env.RTE_BENCH_CLASS ?? "unstated";

const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium } = require("playwright");
const playwrightVersion = require("playwright/package.json").version;

// The plan. Full runs use these; --quick (what CI runs) uses fewer, smaller ones.
const plan = quick
  ? { runs: 8, paragraphs: [1000, 5000], tables: [[50, 10], [100, 50]], coldRuns: 3, throttle: [1], depth: 60 }
  : { runs: 30, paragraphs: [1000, 5000, 20000], tables: [[50, 10], [100, 50], [200, 100]], coldRuns: 10, throttle: [1, 4], depth: 200 };

// Alarms: a figure above one of these fails the run. They are about five times what a full run found on the reference machine,
// so they catch a mistake that makes something several times slower and do not care about the machine. Milliseconds unless it says.
const alarms = {
  "cold.ready": 3000, "cold.firstLoad1000": 1500,
  "p1000.load": 400, "p1000.typeMiddle": 50, "p1000.enter": 50, "p1000.pasteText": 50, "p1000.pasteHtml": 300, "p1000.undo": 100, "p1000.redo": 100,
  "p5000.load": 1500, "p5000.typeMiddle": 150, "p5000.enter": 150, "p5000.undo": 300, "p5000.undoDeep": 300,
  "t500.load": 400, "t500.type": 80, "t5000.load": 1500, "t5000.type": 100,
  "mem.perUndoLevelPercent": 5,
};

const stat = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)];
  return { n: s.length, median: at(0.5), p95: at(0.95), min: s[0], max: s[s.length - 1] };
};

const browser = await chromium.launch();
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const machine = {
  class: machineClass,
  cpu: os.cpus()[0]?.model ?? "unknown",
  threads: os.cpus().length,
  memoryGB: Math.round(os.totalmem() / 2 ** 30),
  os: `${os.type()} ${os.release()}`,
  node: process.version,
  chromium: browser.version(),
  playwright: playwrightVersion,
  commit: git("rev-parse", "--short", "HEAD"),
  date: new Date().toISOString().slice(0, 10),
  mode: quick ? "quick" : "full",
};
const results = {};

async function fresh() {
  const context = await browser.newContext();
  await context.route("**/*", (route) => (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort()));
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(base);
  await page.waitForFunction("window.__confReady===true");
  const ready = await page.evaluate(() => performance.now());
  return { context, page, ready, wall: Date.now() - started };
}

// --- cold start: a new browser context each time (nothing cached), from navigation to the editor being ready, and the first load of a document
// (which pays for compiling the code). Also how much JavaScript the page fetched.
{
  const ready = [], first = [];
  let bytes = 0;
  for (let i = 0; i < plan.coldRuns; i++) {
    const t = await fresh();
    ready.push(t.ready);
    first.push(await t.page.evaluate(() => {
      const html = Array.from({ length: 1000 }, (_, k) => `<p>Paragraph ${k} has <strong>bold words</strong> and <em>emphasis</em>.</p>`).join("");
      const s = performance.now();
      window.__editor.setHtml(html);
      document.getElementById("ed").getBoundingClientRect();
      return performance.now() - s;
    }));
    bytes = await t.page.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).reduce((n, r) => n + r.decodedBodySize, 0));
    await t.context.close();
  }
  results.cold = { ready: stat(ready), firstLoad1000: stat(first), javascriptBytes: bytes };
}

// The page-side measuring helpers, given to the page as source so every scenario uses the same ones.
const helpers = `
  const el = document.getElementById("ed"), ed = window.__editor;
  const time = (fn) => { const s = performance.now(); fn(); el.getBoundingClientRect(); return performance.now() - s; };
  const input = (inputType, data) => () => el.dispatchEvent(new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }));
  const at = (k, offset) => window.__conf.select({ start: "p:nth-child(" + k + ")", so: offset, eo: offset });
  const para = (i) => "<p>Paragraph " + i + " has <strong>bold words</strong>, some <em>emphasis</em> and a <a href=\\"https://example.com/" + i + "\\">link</a> in about ninety characters.</p>";
  const doc = (n) => Array.from({ length: n }, (_, i) => para(i)).join("");
  const series = (runs, prepare, command) => { const xs = []; for (let i = 0; i < runs; i++) { prepare(i); xs.push(time(command)); } return xs; };
`;

async function paragraphs(page, n) {
  return page.evaluate(`(async () => {
    ${helpers}
    const runs = ${plan.runs}, n = ${n}, depth = ${plan.depth}, o = {};
    const html = doc(n);
    ed.setHtml(html);
    o.load = series(runs, () => {}, () => ed.setHtml(html));
    o.typeMiddle = series(runs, () => at(Math.floor(n / 2), 3), input("insertText", "x"));
    o.typeTop = series(runs, () => at(2, 3), input("insertText", "x"));
    o.typeEnd = series(runs, () => at(n, 3), input("insertText", "x"));
    o.enter = series(runs, () => at(2, 3), input("insertParagraph"));
    o.join = series(runs, () => at(3, 0), input("deleteContentBackward"));
    o.pasteText = series(runs, () => at(2, 3), () => ed.paste({ text: "one\\n\\ntwo\\n\\nthree" }));
    const pasted = doc(100);
    o.pasteHtml = series(runs, () => at(2, 3), () => ed.paste({ html: pasted }));
    // Undo and redo of one step (a line break each time, so each is a step of its own).
    ed.setHtml(html);
    o.undo = []; o.redo = [];
    for (let i = 0; i < runs; i++) { at(2, 3); input("insertParagraph")(); o.undo.push(time(() => ed.undo())); o.redo.push(time(() => ed.redo())); ed.undo(); }
    // Undo with a long history behind it.
    ed.setHtml(html);
    for (let i = 0; i < depth; i++) { at(2, 3); input("insertParagraph")(); }
    o.undoDeep = series(Math.min(runs, depth), () => {}, () => ed.undo());
    return o;
  })()`);
}

async function table(page, rows, cols) {
  return page.evaluate(`(() => {
    ${helpers}
    const runs = ${plan.runs}, r = ${rows}, c = ${cols};
    const cell = (i, j) => "<td>Cell " + i + "-" + j + " with <strong>bold</strong> and <em>italic</em> words</td>";
    const html = "<table><tbody>" + Array.from({ length: r }, (_, i) => "<tr>" + Array.from({ length: c }, (_, j) => cell(i, j)).join("") + "</tr>").join("") + "</tbody></table><p>after</p>";
    const o = { load: series(Math.min(runs, 8), () => {}, () => ed.setHtml(html)) };
    [...el.querySelectorAll("td")].forEach((td) => { td.__kept = true; });
    o.type = series(runs, () => window.__conf.select({ start: "tr:nth-child(" + Math.floor(r / 2) + ") td:nth-child(" + Math.floor(c / 2) + ") p", so: 3, eo: 3 }), input("insertText", "x"));
    o.redrawn = [...el.querySelectorAll("td")].filter((td) => !td.__kept).length - 1;
    return o;
  })()`);
}

for (const rate of plan.throttle) {
  const t = await fresh();
  const client = await t.context.newCDPSession(t.page);
  await client.send("Emulation.setCPUThrottlingRate", { rate });
  const suffix = rate === 1 ? "" : `@${rate}x`;
  for (const n of plan.paragraphs) {
    if (rate !== 1 && n > 5000) continue;
    const r = await paragraphs(t.page, n);
    results[`p${n}${suffix}`] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, stat(v)]));
  }
  for (const [rows, cols] of plan.tables) {
    if (rate !== 1 && rows * cols > 5000) continue;
    const r = await table(t.page, rows, cols);
    results[`t${rows * cols}${suffix}`] = { load: stat(r.load), type: stat(r.type), redrawn: r.redrawn };
  }
  await t.context.close();
}

// --- memory: the heap after a forced collection, for an empty page, for each size of document, and per undo level.
{
  const t = await fresh();
  const client = await t.context.newCDPSession(t.page);
  await client.send("HeapProfiler.enable");
  const heap = async () => { await client.send("HeapProfiler.collectGarbage"); return (await client.send("Runtime.getHeapUsage")).usedSize; };
  const empty = await heap();
  const mem = { emptyPageBytes: empty };
  for (const n of plan.paragraphs) {
    await t.page.evaluate(`(() => { ${helpers} ed.setHtml(""); })()`);
    const before = await heap();
    await t.page.evaluate(`(() => { ${helpers} ed.setHtml(doc(${n})); })()`);
    const withDoc = await heap();
    mem[`document${n}Bytes`] = withDoc - before;
    if (n === 5000) {
      await t.page.evaluate(`(() => { ${helpers} at(2500, 3); for (let i = 0; i < 100; i++) input("insertLineBreak")(); })()`);
      mem.perUndoLevelBytes = ((await heap()) - withDoc) / 100;
      mem.perUndoLevelPercent = (mem.perUndoLevelBytes / mem.document5000Bytes) * 100;
    }
  }
  results.mem = mem;
  await t.context.close();
}
await browser.close();

// --- report
const f = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
console.log(`machine class: ${machine.class} | ${machine.cpu}, ${machine.threads} threads, ${machine.memoryGB} GB | ${machine.os} | Node ${machine.node} | Chromium ${machine.chromium} | Playwright ${machine.playwright} | commit ${machine.commit} | ${machine.mode} run, ${plan.runs} runs per figure`);
console.log(`cold start: ready ${f(results.cold.ready.median)} ms (median of ${plan.coldRuns}), first load of 1,000 paragraphs ${f(results.cold.firstLoad1000.median)} ms, ${(results.cold.javascriptBytes / 1024).toFixed(0)} KB of JavaScript`);
for (const [name, r] of Object.entries(results)) {
  if (name === "cold" || name === "mem") continue;
  console.log(`\n${name}  (median / p95 ms)`);
  for (const [k, v] of Object.entries(r)) if (typeof v === "object") console.log(`  ${k.padEnd(12)} ${f(v.median).padStart(7)} / ${f(v.p95).padStart(7)}`);
  if ("redrawn" in r) console.log(`  other cells redrawn when typing: ${r.redrawn}`);
}
console.log(`\nmemory: ${Object.entries(results.mem).map(([k, v]) => `${k} ${k.endsWith("Percent") ? v.toFixed(2) : (v / 1e6).toFixed(2) + " MB"}`.replace("Bytes", "")).join(", ")}`);

if (out) writeFileSync(out, `${JSON.stringify({ machine, results }, null, 2)}\n`);

const get = (path) => path.split(".").reduce((o, k) => o?.[k], results);
const tripped = [];
for (const [path, limit] of Object.entries(alarms)) {
  const v = get(path);
  if (v === undefined) continue;
  const value = typeof v === "number" ? v : v.median;
  if (value > limit) tripped.push(`${path}: ${f(value)} is above the alarm of ${limit}`);
}
if (results.t5000 && results.t5000.redrawn !== 0) tripped.push(`t5000: typing redrew ${results.t5000.redrawn} other cells`);
if (tripped.length) { console.log(`\nALARM\n  ${tripped.join("\n  ")}`); process.exit(1); }
console.log("\nno alarms");
