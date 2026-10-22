// Drives the real editor with real browser events in Chromium, Firefox and WebKit: typing, the system clipboard,
// drag and drop, input-method composition, outside requests and speed. Playwright is not a dependency of this repo;
// point RTE_PLAYWRIGHT at a node_modules folder that has it.
//   RTE_PLAYWRIGHT=<node_modules> tools/browser-checks/run.sh
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const base = process.argv[2];
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
const fixtureDir = join(import.meta.dirname, "../../fixtures/paste");

let failures = 0;
let passes = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else {
    failures++;
    console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`);
  }
};

async function open(type, options = {}) {
  const browser = await type.launch();
  const context = await browser.newContext(options);
  const outside = [];
  // Anything that is not the local server is refused and logged, so a request that would leave the machine is seen.
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(url)) return route.continue();
    outside.push(url.slice(0, 80));
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(base);
  await page.waitForFunction("window.__confReady===true");
  const html = () => page.evaluate(() => window.__conf.snapshot().html);
  const reset = (h) => page.evaluate((v) => { window.__conf.reset(v); window.__conf.focus(); }, h);
  const select = (target) => page.evaluate((t) => window.__conf.select(t), target);
  return { browser, context, page, html, reset, select, outside, errors };
}

for (const [name, type] of engines) {
  const t = await open(type, name === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {});
  const { page, html, reset, select } = t;

  // --- typing and editing keys
  await reset("");
  await page.keyboard.type("Hello world");
  check(`${name} typing`, (await html()) === "<p>Hello world</p>", await html());
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");
  check(`${name} Enter`, (await html()) === "<p>Hello world</p><p>Second</p>", await html());
  for (let i = 0; i < 2; i++) await page.keyboard.press("Backspace");
  check(`${name} Backspace`, (await html()) === "<p>Hello world</p><p>Seco</p>", await html());
  for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
  check(`${name} Backspace joins`, (await html()) === "<p>Hello world</p>", await html());
  await reset("<p>one two</p>");
  await select({ start: "p", so: 4, eo: 7 });
  await page.keyboard.press("Control+B");
  check(`${name} bold on`, (await html()) === "<p>one <strong>two</strong></p>", await html());
  await page.keyboard.press("Control+B");
  check(`${name} bold off`, (await html()) === "<p>one two</p>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} undo`, (await html()) === "<p>one <strong>two</strong></p>", await html());
  await reset("<ul><li>a</li><li>b</li></ul>");
  await select({ start: "li:nth-child(1)", so: 1, eo: 1 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");
  check(`${name} Enter in a list`, (await html()) === "<ul><li>a</li><li>x</li><li>b</li></ul>", await html());
  await reset("<p>abc</p>");
  await select({ start: "p", so: 1, eo: 3 });
  await page.keyboard.type("Z");
  check(`${name} typing over a selection`, (await html()) === "<p>aZ</p>", await html());
  await reset("<p>one two three</p>");
  await select({ start: "p", so: 7, eo: 7 });
  await page.keyboard.press("Control+Backspace");
  check(`${name} word deletion`, (await html()).startsWith("<p>one") && !(await html()).includes("two"), await html());

  // --- clipboard: copy, cut, paste with the real keys, and what copy writes
  await reset("<p>one <strong>two</strong> three</p>");
  await select({ start: "p", so: 0, eo: 3 });
  await page.keyboard.press("Control+X");
  await page.keyboard.press("End");
  await page.keyboard.press("Control+V");
  check(`${name} cut and paste`, (await html()).includes("threeone"), await html());
  await reset("<p>a <strong>bold</strong> b</p>");
  await select({ start: "strong", so: 0, eo: 4 });
  await page.evaluate(() => document.addEventListener("copy", (e) => { window.__copied = [e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain")]; }, { once: true }));
  await page.keyboard.press("Control+C");
  check(`${name} copy writes the model's html and text`, JSON.stringify(await page.evaluate(() => window.__copied)) === JSON.stringify(["<p><strong>bold</strong></p>", "bold"]), await page.evaluate(() => window.__copied));
  // The system clipboard, written by a click so the browser allows it, then pasted with Ctrl+V.
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "write";
    b.onclick = () => navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob(["<p>real <b>paste</b></p><ul><li>x</li></ul>"], { type: "text/html" }), "text/plain": new Blob(["real paste\nx"], { type: "text/plain" }) })]);
    document.body.appendChild(b);
  });
  await page.click("#write");
  await page.waitForTimeout(300);
  await reset("");
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(300);
  check(`${name} real Ctrl+V inserts once`, (await html()).replace(/&nbsp;/g, " ") === "<p>real <strong>paste</strong></p><ul><li>x</li></ul>", await html());
  if (name !== "firefox") {
    await reset("");
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/html", "<p>one <b>two</b></p><ul><li>x</li></ul>");
      dt.setData("text/plain", "one two\nx");
      document.getElementById("ed").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    check(`${name} paste event inserts once`, (await html()) === "<p>one <strong>two</strong></p><ul><li>x</li></ul>", await html());
  }

  // --- drag a selection, and drop image files
  await reset("<p>alpha</p><p>beta</p>");
  await select({ start: "p:nth-child(1)", so: 0, eo: 5 });
  const from = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const to = await page.evaluate(() => { const r = document.querySelector("#ed p:nth-child(2)").getBoundingClientRect(); return { x: r.right - 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  check(`${name} dragging text moves it`, (await html()) === "<p></p><p>betaalpha</p>", await html());
  const drop = (mime, bytes, file) => page.evaluate(async ([m, b, f]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], f, { type: m }));
    const el = document.getElementById("ed");
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 10 }));
  }, [mime, bytes, file]);
  await reset("<p>x</p>");
  await drop("image/png", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ", "a.png");
  await page.waitForTimeout(200);
  check(`${name} a dropped image file becomes an image`, (await html()).includes('<img src="data:image/png;base64,'), await html());
  await reset("<p>x</p>");
  await drop("image/svg+xml", btoa("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"), "a.svg");
  await page.waitForTimeout(200);
  check(`${name} an svg file is refused`, !(await html()).includes("svg"), await html());

  // --- input the editor does not handle is blocked, not applied
  await reset("<p>keep</p>");
  const blocked = await page.evaluate(() => { const e = new InputEvent("beforeinput", { inputType: "formatJustifyCenter", cancelable: true, bubbles: true }); document.getElementById("ed").dispatchEvent(e); return e.defaultPrevented; });
  check(`${name} unknown input is prevented`, blocked && (await html()) === "<p>keep</p>", blocked);

  // --- every scrubbed capture, pasted: nothing may leave the machine, and nothing may throw
  let pasted = 0;
  for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith(".json"))) {
    const fx = JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
    await reset("");
    await page.evaluate((p) => window.__conf.paste(p), fx.payloads);
    pasted++;
  }
  check(`${name} ${pasted} captures pasted, none made an outside request`, t.outside.length === 0, t.outside.slice(0, 3));
  check(`${name} no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- input-method composition (Chromium, through the debugging protocol; a simulation, not a real input method)
{
  const t = await open(chromium);
  const client = await t.page.context().newCDPSession(t.page);
  await t.reset("<p>ab</p>");
  await t.select({ start: "p", so: 2, eo: 2 });
  await client.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
  await client.send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 });
  check("chromium composition leaves the model alone until it ends", (await t.html()) === "<p>ab</p>", await t.html());
  await client.send("Input.insertText", { text: "日本" });
  await t.page.waitForTimeout(100);
  check("chromium committed composition reaches the model", (await t.html()) === "<p>ab日本</p>", await t.html());
  await t.page.keyboard.type("!");
  check("chromium typing continues after composition", (await t.html()) === "<p>ab日本!</p>", await t.html());
  await t.browser.close();
}

// --- speed, against the performance budgets. Each command is timed from the event to the end of layout, 20 times;
// the budget is for the 95th percentile. Commands near the top of a long document are the expensive ones, because
// every later block shifts, so they are measured too. The throttled run uses a CPU four times slower.
{
  const t = await open(chromium);
  const client = await t.page.context().newCDPSession(t.page);
  const measure = (count) => t.page.evaluate((n) => {
    const html = Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} has <strong>bold words</strong>, some <em>emphasis</em> and a <a href="https://example.com/${i}">link</a> in about ninety characters.</p>`).join("");
    const el = document.getElementById("ed");
    const ed = window.__editor;
    const time = (fn) => { const s = performance.now(); fn(); el.getBoundingClientRect(); return performance.now() - s; };
    const p95 = (xs) => xs.slice().sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];
    const input = (inputType, data) => () => el.dispatchEvent(new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }));
    const at = (k, offset) => window.__conf.select({ start: `p:nth-child(${k})`, so: offset, eo: offset });
    // The first call pays for compiling the code; the median of the next five is what a page that is already running sees.
    const out = { setCold: time(() => ed.setHtml(html)) };
    out.set = Array.from({ length: 5 }, () => time(() => ed.setHtml(html))).sort((a, b) => a - b)[2];
    const run = (label, prepare, command) => {
      const xs = [];
      for (let i = 0; i < 20; i++) { prepare(i); xs.push(time(command)); }
      out[label] = p95(xs);
    };
    run("typeMiddle", () => at(Math.floor(n / 2), 3), input("insertText", "x"));
    run("typeTop", () => at(2, 3), input("insertText", "x"));
    run("enterTop", () => at(2, 3), input("insertParagraph"));
    run("joinTop", () => at(3, 0), input("deleteContentBackward"));
    run("pasteTop", () => at(2, 3), () => ed.paste({ text: "one\n\ntwo\n\nthree" }));
    return out;
  }, count);
  for (const [label, rate] of [["", 1], [" (CPU 4x slower)", 4]]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate });
    for (const [n, commandBudget, setBudget] of [[1000, 10, 40], [5000, 30, Infinity]]) {
      const r = await measure(n);
      const worst = Math.max(r.typeMiddle, r.typeTop, r.enterTop, r.joinTop, r.pasteTop);
      console.log(`speed${label} ${n} paragraphs: set ${r.set.toFixed(1)} ms warm, ${r.setCold.toFixed(1)} ms cold; p95 per command: type ${r.typeMiddle.toFixed(1)} (top ${r.typeTop.toFixed(1)}), Enter ${r.enterTop.toFixed(1)}, join ${r.joinTop.toFixed(1)}, paste ${r.pasteTop.toFixed(1)} ms`);
      if (rate === 1) {
        check(`speed: ${n} paragraphs, every command within ${commandBudget} ms (p95)`, worst <= commandBudget, r);
        check(`speed: ${n} paragraphs, set content within ${setBudget} ms`, r.set <= setBudget, r);
      }
    }
  }
  await t.browser.close();
}

// --- memory: how much one undo level adds, as a share of the document
{
  const t = await open(chromium);
  const client = await t.page.context().newCDPSession(t.page);
  await client.send("HeapProfiler.enable");
  const heap = async () => {
    await client.send("HeapProfiler.collectGarbage");
    return (await client.send("Runtime.getHeapUsage")).usedSize;
  };
  const baseline = await heap();
  await t.page.evaluate(() => {
    const html = Array.from({ length: 5000 }, (_, i) => `<p>Paragraph ${i} has <strong>bold words</strong>, some <em>emphasis</em> and a <a href="https://example.com/${i}">link</a> in about ninety characters.</p>`).join("");
    window.__editor.setHtml(html);
  });
  const withDoc = await heap();
  await t.page.evaluate(() => {
    window.__conf.select({ start: "p:nth-child(2500)", so: 3, eo: 3 });
    const el = document.getElementById("ed");
    for (let i = 0; i < 100; i++) el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
  });
  const withLevels = await heap();
  const docBytes = withDoc - baseline;
  const perLevel = (withLevels - withDoc) / 100;
  console.log(`memory: 5,000-paragraph document ${(docBytes / 1e6).toFixed(1)} MB, one undo level ${(perLevel / 1e3).toFixed(1)} KB (${((perLevel / docBytes) * 100).toFixed(2)}% of the document)`);
  check("memory: one undo level adds at most 1% of the document", perLevel <= docBytes * 0.01, { docBytes, perLevel });
  await t.browser.close();
}

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
