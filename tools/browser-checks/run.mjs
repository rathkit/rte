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

async function open(type, options = {}, cfg = "") {
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
  await page.goto(cfg ? `${base}?cfg=${encodeURIComponent(cfg)}` : base);
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
  // --- lists: Tab, Shift+Tab, typed shortcuts, Enter and Backspace, and the toggle command
  await reset("<ul><li>a</li><li>b</li><li>c</li></ul>");
  await select({ start: "li:nth-child(2)", so: 1, eo: 1 });
  await page.keyboard.press("Tab");
  check(`${name} Tab nests the item`, (await html()) === "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>", await html());
  await page.keyboard.press("Shift+Tab");
  check(`${name} Shift+Tab undoes it`, (await html()) === "<ul><li>a</li><li>b</li><li>c</li></ul>", await html());
  await reset("<p>x</p>");
  await page.evaluate(() => window.__editor.commands.run("list.numbered"));
  check(`${name} the list command makes a numbered list`, (await html()) === "<ol><li>x</li></ol>", await html());
  check(`${name} and reports it`, (await page.evaluate(() => [window.__editor.commands.state("list.numbered").active, window.__editor.commands.state("list.bulleted").active])).join() === "true,false", "state");
  await reset("");
  await page.keyboard.type("- ");
  await page.keyboard.type("item");
  check(`${name} "- " starts a bulleted list`, (await html()) === "<ul><li>item</li></ul>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} undo takes back the typing, not the list`, (await html()) === "<ul><li></li></ul>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} undo again restores the typed marker`, (await html()) === "<p>-</p>", await html());
  await reset("");
  await page.keyboard.type("1. ");
  await page.keyboard.type("one");
  check(`${name} "1. " starts a numbered list`, (await html()) === "<ol><li>one</li></ol>", await html());
  await reset("");
  await page.keyboard.type("2. ");
  check(`${name} "2. " is just text`, (await html()) === "<p>2.&nbsp;</p>" || (await html()) === "<p>2. </p>", await html());
  await reset("<ul><li>a</li><li>b</li></ul>");
  await select({ start: "li:nth-child(2)", so: 1, eo: 1 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  check(`${name} Enter on an empty item leaves the list`, (await html()) === "<ul><li>a</li><li>b</li></ul><p></p>", await html());
  await reset("<ul><li>a</li><li>b</li></ul>");
  await select({ start: "li:nth-child(2)", so: 0, eo: 0 });
  await page.keyboard.press("Backspace");
  check(`${name} Backspace at the start of an item joins it up`, (await html()) === "<ul><li>ab</li></ul>", await html());

  // --- definition lists
  await reset("<p>a</p><p>b</p>");
  await page.evaluate(() => { window.__conf.select("all"); window.__editor.commands.run("list.definition"); });
  check(`${name} the definition list command makes terms`, (await html()) === "<dl><dt>a</dt><dt>b</dt></dl>", await html());
  check(`${name} and reports it`, await page.evaluate(() => window.__editor.commands.state("list.definition").active), "state");
  await select({ start: "dt:nth-child(2)", so: 1, eo: 1 });
  await page.keyboard.press("Tab");
  check(`${name} Tab makes a term a detail`, (await html()) === "<dl><dt>a</dt><dd>b</dd></dl>", await html());
  await page.keyboard.press("Enter");
  await page.keyboard.type("c");
  check(`${name} Enter after a detail starts a term`, (await html()) === "<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl>", await html());
  await page.keyboard.press("Enter");
  check(`${name} Enter after a term starts a detail`, (await html()) === "<dl><dt>a</dt><dd>b</dd><dt>c</dt><dd></dd></dl>", await html());
  await page.keyboard.press("Enter");
  check(`${name} Enter on an empty entry leaves the list`, (await html()) === "<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl><p></p>", await html());

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

// --- images: inline limit, upload hook, svg cleaning, byte checks
{
  const pngBytes = (n) => { const a = new Uint8Array(n); a.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return Array.from(a); };
  const dropFile = (page, name, type, bytes) => page.evaluate(([n, t, b]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], n, { type: t }));
    const el = document.getElementById("ed");
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 10 }));
  }, [name, type, bytes]);
  for (const [name, type] of engines) {
    // No upload function: small images embed, large ones are left out and reported.
    const t = await open(type, {}, JSON.stringify({ maxInline: 1000 }));
    await t.reset("<p>x</p>");
    await dropFile(t.page, "small.png", "image/png", pngBytes(500));
    await t.page.waitForTimeout(250);
    check(`${name} a small image file is embedded`, (await t.html()).includes("data:image/png;base64,"), await t.html());
    await t.reset("<p>x</p>");
    await dropFile(t.page, "big.png", "image/png", pngBytes(5000));
    await t.page.waitForTimeout(250);
    const rejected = await t.page.evaluate(() => window.__rejected);
    check(`${name} a large image file is left out and reported`, !(await t.html()).includes("<img") && rejected.length === 1 && rejected[0].reason === "too-large", { html: await t.html(), rejected });
    await t.reset("<p>x</p>");
    await dropFile(t.page, "fake.png", "image/png", Array.from(new TextEncoder().encode("<script>alert(1)</script>")));
    await t.page.waitForTimeout(250);
    check(`${name} a file whose bytes do not match its type is refused`, !(await t.html()).includes("<img") && (await t.page.evaluate(() => window.__rejected)).some((r) => r.reason === "unsupported"), await t.html());
    await t.reset("<p>x</p>");
    await dropFile(t.page, "a.svg", "image/svg+xml", Array.from(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script><rect width="4" height="4" onclick="x()"/></svg>')));
    await t.page.waitForTimeout(250);
    const shown = await t.html();
    const svgText = await t.page.evaluate((h) => { const m = /base64,([^"]+)"/.exec(h); return m ? atob(m[1]) : ""; }, shown);
    check(`${name} a dropped svg is cleaned`, svgText.includes("<rect") && !/script|onclick/.test(svgText), svgText);
    // Pasted HTML with a big embedded image: left out and reported when there is no upload function.
    await t.reset("");
    await t.page.evaluate((b) => window.__conf.paste({ "text/html": `<p>a</p><p><img src="data:image/png;base64,${btoa(String.fromCharCode(...b))}"></p><p>b</p>` }), pngBytes(5000));
    check(`${name} a large image inside pasted html is left out`, (await t.html()) === "<p>a</p><p>b</p>", await t.html());
    check(`${name} image checks: no page errors`, t.errors.length === 0, t.errors);
    await t.browser.close();
    // With an upload function: files and embedded images are uploaded and only addresses reach the document.
    const u = await open(type, {}, JSON.stringify({ upload: true }));
    await u.reset("<p>x</p>");
    await dropFile(u.page, "photo.png", "image/png", pngBytes(5000));
    await u.page.waitForTimeout(300);
    check(`${name} an uploaded file becomes an address`, /<img src="https:\/\/cdn\.test\/1\.png">/.test(await u.html()) && !(await u.html()).includes("data:"), await u.html());
    await u.reset("");
    await u.page.evaluate((b) => window.__conf.paste({ "text/html": `<p>a</p><p><img src="data:image/png;base64,${btoa(String.fromCharCode(...b))}"></p><p><img src="data:image/png;base64,${btoa(String.fromCharCode(...b))}"></p>` }), pngBytes(5000));
    await u.page.waitForTimeout(300);
    const pasted = await u.html();
    check(`${name} embedded images in pasted html are uploaded`, (pasted.match(/https:\/\/cdn\.test\//g) ?? []).length === 2 && !pasted.includes("data:"), pasted);
    check(`${name} uploads: ${(await u.page.evaluate(() => window.__uploads)).length} calls, no page errors`, u.errors.length === 0, u.errors);
    await u.browser.close();
  }
}

// --- the editor with no plugins at all: lists in a document survive, Tab is left to the browser, SVG images are refused
{
  const sampleSvg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>').toString("base64")}`;
  for (const [name, type] of engines) {
    const t = await open(type, {}, JSON.stringify({ core: true }));
    await t.reset("<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul><dl><dt>t</dt><dd>d</dd></dl>");
    check(`${name} (no plugins) a document with lists loads and saves intact`, (await t.html()) === "<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul><dl><dt>t</dt><dd>d</dd></dl>", await t.html());
    await t.select({ start: "li:nth-child(2)", so: 1, eo: 1 });
    await t.page.keyboard.press("Enter");
    check(`${name} (no plugins) Enter in an item is a line break`, (await t.html()).includes("<li>t<br>hree</li>") || (await t.html()).includes("<li>three<br></li>") || (await t.html()).includes("<br>"), await t.html());
    const tabbed = await t.page.evaluate(() => { const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); document.getElementById("ed").dispatchEvent(e); return e.defaultPrevented; });
    check(`${name} (no plugins) Tab is left to the browser`, tabbed === false, tabbed);
    check(`${name} (no plugins) there are no list commands`, !(await t.page.evaluate(() => window.__editor.commands.has("list.bulleted"))), "commands");
    await t.reset("");
    await t.page.evaluate((src) => window.__conf.paste({ "text/html": `<p>a</p><p><img src="${src}"></p>` }), sampleSvg);
    check(`${name} (no plugins) an svg data image is refused`, !(await t.html()).includes("<img"), await t.html());
    await t.browser.close();
    const s = await open(type, {});
    await s.reset("");
    await s.page.evaluate((src) => window.__conf.paste({ "text/html": `<p>a</p><p><img src="${src}"></p>` }), sampleSvg);
    check(`${name} (standard) the same svg image is kept`, (await s.html()).includes("<img src=\"data:image/svg+xml;base64,"), await s.html());
    await s.browser.close();
  }
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
  // Moving the caret with every command's button subscribed (about twenty of them), as a toolbar would be.
  const caretMoves = (count) => t.page.evaluate(async (n) => {
    const ed = window.__editor;
    ed.setHtml(Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} has <strong>bold words</strong> and a <a href="https://example.com/${i}">link</a>.</p>`).join(""));
    const names = ed.commands.list().map((c) => c.name);
    let woken = 0;
    for (const name of names) ed.commands.subscribe(name, () => { woken++; });
    const times = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      ed.engine.setSelection({ anchor: { path: [100 + i * 7], offset: 3 }, focus: { path: [100 + i * 7], offset: 3 } });
      await Promise.resolve();
      await new Promise((resolve) => queueMicrotask(resolve));
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    return { p95: times[Math.ceil(times.length * 0.95) - 1], subscribed: names.length, woken };
  }, count);
  for (const [label, rate] of [["", 1], [" (CPU 4x slower)", 4]]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate });
    const caret = await caretMoves(5000);
    console.log(`speed${label} 5000 paragraphs, caret move with ${caret.subscribed} subscribed commands: p95 ${caret.p95.toFixed(2)} ms (${caret.woken} notifications)`);
    if (rate === 1) check("speed: a caret move with every command subscribed, 5000 paragraphs, within 30 ms (p95)", caret.p95 <= 30, caret);
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
