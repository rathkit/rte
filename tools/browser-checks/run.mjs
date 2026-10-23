// Drives the real editor with real browser events in Chromium, Firefox and WebKit: typing, the system clipboard,
// drag and drop, input-method composition, outside requests and speed. Playwright is not a dependency of this repo;
// point RTE_PLAYWRIGHT at a node_modules folder that has it.
//   RTE_PLAYWRIGHT=tools/browser-checks/node_modules tools/browser-checks/run.sh
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

async function open(type, options = {}, cfg = "", demo = false) {
  const page_url = demo === "element" ? "/element/demo/" : demo === "ui" ? "/ui/demo/" : "/headless/demo/";
  const ready_flag = demo === "element" ? "window.__elementReady===true" : demo === "ui" ? "window.__uiReady===true" : "window.__demoReady===true";
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
  await page.goto(demo ? new URL(page_url, base).href : cfg ? `${base}?cfg=${encodeURIComponent(cfg)}` : base);
  await page.waitForFunction(demo ? ready_flag : "window.__confReady===true");
  const html = () => page.evaluate(demo ? () => window.__demo.editor.getHtml() : () => window.__conf.snapshot().html);
  const reset = (h) => page.evaluate(demo ? (v) => { window.__demo.editor.setHtml(v); window.__demo.editor.focus(); } : (v) => { window.__conf.reset(v); window.__conf.focus(); }, h);
  const select = demo
    ? (target) => page.evaluate((t) => { const n = document.querySelector(`#ed ${t.start}`).firstChild; window.__demo.editor.selectDom(n, t.so, n, t.eo); }, target)
    : (target) => page.evaluate((t) => window.__conf.select(t), target);
  return { browser, context, page, html, reset, select, outside, errors };
}

for (const [name, type] of engines) {
  const t = await open(type, name === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {});
  const { page, html, reset, select } = t;

  // --- typing and editing keys
  await reset("");
  await page.keyboard.type("Hello world");
  check(`${name} typing`, (await html()) === "<p>Hello world</p>", await html());

  // Bold chosen at the caret with the keyboard is what the next letters take; choosing it again stops it.
  await reset("<p>ab</p>");
  await page.keyboard.press("ControlOrMeta+ArrowRight").catch(() => undefined);
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("XY");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("z");
  check(`${name} bold chosen at the caret applies to what is typed next`, (await html()) === "<p>ab<strong>XY</strong>z</p>", await html());
  // Select all with the keyboard, then type: the typing replaces everything. Firefox reports select-all as points on the surface itself.
  await reset("<p>one two</p><p>three</p>");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("X");
  check(`${name} select all by keyboard, then type`, (await html()) === "<p>X</p>", await html());
  // Back to where the checks that follow expect to be.
  await reset("");
  await page.keyboard.type("Hello world");
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
  // --- tables: Tab between cells, a row added past the last cell, and the commands
  await reset("<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>");
  await page.click("td");
  await page.keyboard.press("Tab");
  await page.keyboard.type("X");
  check(`${name} Tab moves to the next cell`, (await html()).startsWith("<table><tbody><tr><td>a</td><td>Xb</td></tr>"), await html());
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Y");
  check(`${name} Tab past the last cell adds a row`, (await html()) === "<table><tbody><tr><td>a</td><td>Xb</td></tr><tr><td>c</td><td>d</td></tr><tr><td>Y</td><td></td></tr></tbody></table><p></p>" || (await html()).includes("<tr><td>Y</td><td></td></tr>"), await html());
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Z");
  check(`${name} Shift+Tab goes back`, (await html()).includes("<tr><td>c</td><td>dZ</td></tr>") || (await html()).includes("<tr><td>c</td><td>Zd</td></tr>"), await html());
  await page.evaluate(() => window.__editor.commands.run("table.deleteRow"));
  check(`${name} the delete row command removes the row`, !(await html()).includes("<tr><td>c</td>"), await html());
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
    check(`${name} (no plugins) Enter in an item is a line break`, (await t.html()) === "<ul><li>one<ul><li>two</li></ul></li><li>t<br>hree</li></ul><dl><dt>t</dt><dd>d</dd></dl>", await t.html());
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

// --- the headless toolbar, driven through a bare page with no styles: keyboard, ARIA, focus, announcements
for (const [name, type] of engines) {
  const t = await open(type, {}, "", true);
  const { page } = t;
  const q = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e && { tabindex: e.tabIndex, disabled: e.disabled, ariaDisabled: e.getAttribute("aria-disabled"), pressed: e.getAttribute("aria-pressed"), label: e.getAttribute("aria-label"), keys: e.getAttribute("aria-keyshortcuts") }; }, sel);
  const active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  check(`${name} (headless) the toolbar is named and has the toolbar role`, await page.evaluate(() => { const b = document.getElementById("bar"); return b.getAttribute("role") === "toolbar" && b.getAttribute("aria-label") === "Formatting" && b.getAttribute("aria-orientation") === "horizontal"; }), "role");
  check(`${name} (headless) exactly one control is a tab stop`, (await page.evaluate(() => [...document.querySelectorAll("[data-rk-item]")].filter((e) => e.tabIndex === 0).length)) === 1, "tab stops");
  check(`${name} (headless) icon-only buttons get a name`, (await q("#rk-bold"))?.label === "Bold", await q("#rk-bold"));
  check(`${name} (headless) a shortcut is announced`, (await q("#rk-bold"))?.keys === "Control+B", await q("#rk-bold"));
  await t.reset("<p>one two three</p>");
  await page.evaluate(() => window.__demo.editor.focus());
  await page.waitForTimeout(60);
  // Redo is unavailable until something has been undone.
  const off = await q("#rk-redo");
  check(`${name} (headless) an unavailable control is aria-disabled, not disabled, so it can still be found`, off?.ariaDisabled === "true" && off?.disabled === false, off);
  // Select "two", press Bold with the mouse: the editor keeps the focus and the selection, and the button shows it is on.
  await t.select({ start: "p", so: 4, eo: 7 });
  await page.waitForTimeout(60);
  await page.click("#rk-bold");
  await page.waitForTimeout(60);
  check(`${name} (headless) pressing Bold bolds the selection`, (await t.html()) === "<p>one <strong>two</strong> three</p>", await t.html());
  check(`${name} (headless) and the focus stays in the editor`, (await active()) === "ed", await active());
  check(`${name} (headless) and the button reports it is pressed`, (await q("#rk-bold"))?.pressed === "true", await q("#rk-bold"));
  // A native select for the block type.
  await page.selectOption("#rk-block", "2");
  await page.waitForTimeout(60);
  check(`${name} (headless) choosing Heading 2 in the select changes the block`, (await t.html()).startsWith("<h2>"), await t.html());
  check(`${name} (headless) and returns the focus to the editor`, (await active()) === "ed", await active());
  // Keyboard: Tab into the toolbar lands on its one tab stop, arrows move, Home and End jump, Escape goes back to the editor.
  await page.evaluate(() => document.getElementById("rk-undo").focus());
  await page.keyboard.press("ArrowRight");
  check(`${name} (headless) ArrowRight moves along the toolbar`, (await active()) === "rk-redo", await active());
  check(`${name} (headless) and moves the tab stop with it`, (await q("#rk-redo"))?.tabindex === 0 && (await q("#rk-undo"))?.tabindex === -1, [await q("#rk-redo"), await q("#rk-undo")]);
  await page.keyboard.press("End");
  const last = await page.evaluate(() => [...document.querySelectorAll("[data-rk-item]")].at(-1).id);
  check(`${name} (headless) End jumps to the last control`, (await active()) === last, [await active(), last]);
  await page.keyboard.press("ArrowRight");
  check(`${name} (headless) and the toolbar wraps round`, (await active()) === "rk-undo", await active());
  await page.keyboard.press("Escape");
  check(`${name} (headless) Escape returns to the editor`, (await active()) === "ed", await active());
  // A dialog item does not run a command by itself: it asks the page to open something.
  await page.evaluate(() => { window.__opened.length = 0; });
  await t.select({ start: "h2", so: 0, eo: 3 });
  await page.waitForTimeout(60);
  await page.click("#rk-link");
  check(`${name} (headless) a dialog item asks the page to open its dialog`, JSON.stringify(await page.evaluate(() => window.__opened)) === '["link"]', await page.evaluate(() => window.__opened));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  await page.evaluate(() => { window.__closed.length = 0; });
  // The announcer is a polite live region, and says the same message twice.
  await page.evaluate(() => window.__demo.announcer.announce("Bold on"));
  await page.waitForTimeout(150);
  const live = await page.evaluate(() => { const e = document.querySelector("[role=status]"); return { text: e.textContent, live: e.getAttribute("aria-live"), atomic: e.getAttribute("aria-atomic") }; });
  check(`${name} (headless) the announcer is polite and says its message`, live.text === "Bold on" && live.live === "polite" && live.atomic === "true", live);
  await page.evaluate(() => window.__demo.announcer.announce("Bold on"));
  const cleared = await page.evaluate(() => document.querySelector("[role=status]").textContent);
  check(`${name} (headless) a repeated message is cleared first, so it is said again`, cleared === "", cleared);
  // --- menu
  const attr = (sel, a) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n), [sel, a]);
  const hidden = (sel) => page.evaluate((s) => document.querySelector(s).hidden, sel);
  check(`${name} (headless) a menu button says what it opens`, (await attr("#more", "aria-haspopup")) === "menu" && (await attr("#more", "aria-expanded")) === "false" && (await attr("#more", "aria-controls")) === "more-menu" && (await hidden("#more-menu")), "closed menu");
  await page.click("#more");
  await page.waitForTimeout(40);
  check(`${name} (headless) clicking it opens the menu and focuses the first item`, (await attr("#more", "aria-expanded")) === "true" && (await active()) === "mi-a" && (await attr("#more-menu", "role")) === "menu" && (await attr("#mi-a", "role")) === "menuitem", await active());
  const walk = async (keys) => { const seen = []; for (const k of keys) { await page.keyboard.press(k); seen.push(await active()); } return seen; };
  check(`${name} (headless) arrows move through the items, a disabled one stays reachable, and the ends wrap`, JSON.stringify(await walk(["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "Home", "End"])) === JSON.stringify(["mi-b", "mi-c", "mi-a", "mi-c", "mi-a", "mi-c"]), "walk");
  await page.keyboard.press("Home");
  await page.keyboard.press("c");
  check(`${name} (headless) typing a letter jumps to the item that starts with it`, (await active()) === "mi-c", await active());
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check(`${name} (headless) a disabled item cannot be chosen`, (await attr("#more", "aria-expanded")) === "true" && (await page.evaluate(() => window.__chosen.length)) === 0, "disabled");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  check(`${name} (headless) choosing an item reports it, closes the menu and returns to the button`, JSON.stringify(await page.evaluate(() => window.__chosen)) === '["mi-c"]' && (await attr("#more", "aria-expanded")) === "false" && (await active()) === "more", [await page.evaluate(() => window.__chosen), await active()]);
  await page.focus("#more");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(40);
  check(`${name} (headless) ArrowUp on the button opens the menu at the last item`, (await active()) === "mi-c", await active());
  await page.keyboard.press("Escape");
  check(`${name} (headless) Escape closes it and returns to the button`, (await attr("#more", "aria-expanded")) === "false" && (await active()) === "more", await active());
  await page.click("#more");
  await page.waitForTimeout(40);
  await page.click("#ed");
  check(`${name} (headless) clicking elsewhere closes it without taking the focus back`, (await attr("#more", "aria-expanded")) === "false" && (await active()) === "ed", await active());
  // --- dialog (the browser's own <dialog>)
  await t.reset("<p>one two</p>");
  await t.select({ start: "p", so: 0, eo: 3 });
  await page.waitForTimeout(60);
  await page.click("#rk-link");
  await page.waitForTimeout(60);
  check(`${name} (headless) a dialog opens, is modal, named, and takes the focus`, await page.evaluate(() => { const d = document.getElementById("dlg"); return d.open && d.getAttribute("aria-modal") === "true" && d.getAttribute("aria-labelledby") === "dlg-title" && document.activeElement.name === "href"; }), await active());
  await page.click("#dlg-ok");
  await page.waitForTimeout(60);
  const bad = await page.evaluate(() => { const i = document.querySelector("[name=href]"); const e = document.querySelector("[data-rk-error=href]"); return { invalid: i.getAttribute("aria-invalid"), by: i.getAttribute("aria-describedby") === e.id, text: e.textContent, focused: document.activeElement === i, open: document.getElementById("dlg").open }; });
  check(`${name} (headless) an empty required field is flagged, explained, focused, and the dialog stays open`, bad.invalid === "true" && bad.by && bad.text === "Address is required." && bad.focused && bad.open, bad);
  await page.waitForTimeout(120);
  check(`${name} (headless) and the problem is announced`, (await page.evaluate(() => document.querySelector("[role=status]").textContent)) === "Address is required.", "announce");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (headless) Escape cancels and focus returns to the control that opened it`, JSON.stringify(await page.evaluate(() => window.__closed)) === '["cancel"]' && (await active()) === "rk-link", [await page.evaluate(() => window.__closed), await active()]);
  await page.evaluate(() => { window.__closed.length = 0; });
  await page.click("#rk-link");
  await page.waitForTimeout(60);
  await page.fill("[name=href]", "https://x.test");
  await page.click("#dlg-ok");
  await page.waitForTimeout(60);
  check(`${name} (headless) a good value submits and closes`, JSON.stringify(await page.evaluate(() => window.__closed)) === '["submit"]' && !(await page.evaluate(() => document.getElementById("dlg").open)), await page.evaluate(() => window.__closed));
  // --- a dialog that is not the native element: the machine traps focus and handles Escape itself
  await page.click("#plain-open");
  await page.waitForTimeout(40);
  check(`${name} (headless) a plain dialog takes the focus`, (await active()) === "p1", await active());
  check(`${name} (headless) Tab wraps from the last control to the first`, JSON.stringify(await walk(["Tab", "Tab", "Tab"])) === JSON.stringify(["p2", "p3", "p1"]), "tab");
  check(`${name} (headless) and Shift+Tab from the first goes to the last`, JSON.stringify(await walk(["Shift+Tab"])) === JSON.stringify(["p3"]), "shift tab");
  await page.keyboard.press("Escape");
  check(`${name} (headless) Escape closes it and focus returns to what opened it`, (await page.evaluate(() => document.getElementById("plain").hidden)) && (await active()) === "plain-open", await active());
  check(`${name} (headless) no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- the custom element <rk-editor> and <rk-toolbar>, in a real form
for (const [name, type] of engines) {
  const t = await open(type, {}, "", "element");
  const { page } = t;
  const val = (id) => page.evaluate((i) => document.getElementById(i).value, id);
  const form = () => page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("f"))));
  const events = () => page.evaluate(() => window.__events.splice(0).map((e) => e.join(":")));
  check(`${name} (element) both elements are defined and the editors are ready`, await page.evaluate(() => !!customElements.get("rk-editor") && !!customElements.get("rk-toolbar") && window.__events.filter((e) => e[0] === "rk-ready").length === 3), "defined");
  check(`${name} (element) the value attribute and the element's own children are the starting content`, (await val("body")) === "<p>Hello</p>" && (await val("second")) === "<p>from children</p>", [await val("body"), await val("second")]);
  check(`${name} (element) the editing surface is named from the label attribute`, await page.evaluate(() => document.querySelector("#body [data-rk-surface]").getAttribute("aria-label") === "Body"), "label");
  const f0 = await form();
  check(`${name} (element) the editors take part in the form`, f0.body === "<p>Hello</p>" && f0.second === "<p>from children</p>", f0);
  await events();
  await page.click("#body [data-rk-surface]");
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  const ev = await events();
  check(`${name} (element) typing sends rk-change and input, and updates the form`, ev.includes('rk-change:body:<p>Hello!</p>') && ev.includes("input:body") && (await form()).body === "<p>Hello!</p>", [ev, await form()]);
  check(`${name} (element) and the other editor is untouched`, (await val("second")) === "<p>from children</p>", await val("second"));
  await page.click("#second [data-rk-surface]");
  check(`${name} (element) leaving an editor whose value changed sends change`, (await events()).includes("change:body"), "change");
  await page.click("#reset");
  await page.waitForTimeout(50);
  check(`${name} (element) a form reset puts the starting content back`, (await val("body")) === "<p>Hello</p>" && (await form()).body === "<p>Hello</p>", await val("body"));
  await page.evaluate(() => { document.getElementById("body").value = "<p>Set</p>"; });
  check(`${name} (element) setting value replaces the document and the form value`, (await val("body")) === "<p>Set</p>" && (await form()).body === "<p>Set</p>", await form());
  await page.evaluate(() => document.getElementById("body").setAttribute("value", "<p>Attr</p>"));
  check(`${name} (element) changing the value attribute does too`, (await val("body")) === "<p>Attr</p>", await val("body"));
  await page.evaluate(() => document.getElementById("second").setAttribute("readonly", ""));
  check(`${name} (element) readonly makes the surface read-only, and removing it makes it editable again`, await page.evaluate(() => { const e = document.getElementById("second"); const a = e.editor.readOnly && e.querySelector("[data-rk-surface]").getAttribute("contenteditable") === "false"; e.removeAttribute("readonly"); return a && !e.editor.readOnly; }), "readonly");
  check(`${name} (element) a required editor that is empty is invalid, and valid once it has text`, await (async () => {
    const bad = await page.evaluate(() => document.getElementById("req").validity.valueMissing && !document.getElementById("f").checkValidity());
    await page.click("#req [data-rk-surface]");
    await page.keyboard.type("text");
    const good = await page.evaluate(() => !document.getElementById("req").validity.valueMissing);
    return bad && good;
  })(), "required");
  // The toolbar: built from the editor's items, behaving through the headless layer.
  check(`${name} (element) the toolbar draws a control for each item and names it`, await page.evaluate(() => { const b = document.querySelector("rk-toolbar"); const bold = b.querySelector('[data-rk-item="bold"]'); return b.getAttribute("role") === "toolbar" && bold && bold.textContent === "Bold" && b.querySelectorAll("[data-rk-item]").length > 10; }), "toolbar");
  await page.evaluate(() => { document.getElementById("body").value = "<p>one two</p>"; });
  await page.click("#body [data-rk-surface]");
  await page.evaluate(() => { const n = document.querySelector("#body [data-rk-surface] p").firstChild; document.getElementById("body").editor.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('rk-toolbar [data-rk-item="bold"]');
  await page.waitForTimeout(60);
  check(`${name} (element) pressing Bold in the toolbar bolds the selection in its editor`, (await val("body")) === "<p><strong>one</strong> two</p>", await val("body"));
  // Moving an element in the page keeps what it holds. Removing one cleans up.
  await page.evaluate(() => { const e = document.getElementById("body"); document.body.appendChild(e); });
  await page.waitForTimeout(50);
  check(`${name} (element) moving the element keeps its content and it still works`, (await val("body")) === "<p><strong>one</strong> two</p>" && (await page.evaluate(() => !!document.getElementById("body").editor)), await val("body"));
  await page.evaluate(() => document.getElementById("second").remove());
  check(`${name} (element) removing an element leaves no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- the styled interface: parts, themes, tokens, density, classes, messages, icons, forced colors, reduced motion, the link dialog
for (const [name, type] of engines) {
  const t = await open(type, {}, "", "ui");
  const { page } = t;
  const css = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
  const rootBg = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).backgroundColor, id);
  const setStyle = (which, style) => page.evaluate(([w, st]) => window[w].ui.setStyle(st), [which, style]);
  const active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  check(`${name} (ui) the root, toolbar and content are parts, and every control is a part`, await page.evaluate(() => { const r = document.getElementById("root"); return r.classList.contains("rk-root") && r.getAttribute("data-rk-part") === "root" && !!r.querySelector('[data-rk-part=toolbar]') && !!r.querySelector('[data-rk-part=content]') && [...r.querySelectorAll("[data-rk-item]")].every((e) => e.hasAttribute("data-rk-part")); }), "parts");
  check(`${name} (ui) groups of controls are separated`, (await page.evaluate(() => document.querySelectorAll('#root [data-rk-part=separator]').length)) >= 4, "separators");
  check(`${name} (ui) every button has an icon, a name and a tooltip with its key`, await page.evaluate(() => [...document.querySelectorAll('#root button[data-rk-item]')].every((b) => b.querySelector('[data-rk-part=icon] svg') && b.getAttribute("aria-label") && b.title) && document.querySelector('#root [data-rk-item=bold]').title === "Bold (Ctrl+B)"), "icons");
  check(`${name} (ui) the block-type select is named`, (await page.evaluate(() => document.querySelector("#root select[data-rk-item=block]").getAttribute("aria-label"))) === "Block type", "select");
  // Themes: two editors in two themes on one page, and a switch at run time.
  check(`${name} (ui) light and dark themes color their own editor`, (await rootBg("root")) === "rgb(255, 255, 255)" && (await rootBg("second")) === "rgb(16, 21, 29)", [await rootBg("root"), await rootBg("second")]);
  await setStyle("__one", { theme: "dark" });
  check(`${name} (ui) the default icons survive a theme switch`, await page.evaluate(() => [...document.querySelectorAll('#root button[data-rk-item]')].every((b) => b.querySelector("svg"))), "icons after switch");
  check(`${name} (ui) switching theme at run time changes the look without rebuilding`, (await rootBg("root")) === "rgb(16, 21, 29)", await rootBg("root"));
  await setStyle("__one", { theme: "high-contrast" });
  check(`${name} (ui) the high-contrast theme is black and white`, (await rootBg("root")) === "rgb(0, 0, 0)" && (await css("#root [data-rk-part=content]", "color")) === "rgb(255, 255, 255)", await rootBg("root"));
  await setStyle("__one", { theme: "auto" });
  await page.emulateMedia({ colorScheme: "dark" });
  check(`${name} (ui) the auto theme follows the system's dark setting`, (await rootBg("root")) === "rgb(16, 21, 29)", await rootBg("root"));
  await setStyle("__one", { theme: "auto", scheme: "light" });
  check(`${name} (ui) and a chosen scheme beats the system`, (await rootBg("root")) === "rgb(255, 255, 255)", await rootBg("root"));
  await page.emulateMedia({ colorScheme: "light" });
  await setStyle("__one", { theme: "light" });
  // Tokens, density, classes, messages, icons.
  await setStyle("__one", { theme: "light", tokens: { "--rk-bg": "#ffeedd" } });
  check(`${name} (ui) a token beats the preset`, (await rootBg("root")) === "rgb(255, 238, 221)", await rootBg("root"));
  await setStyle("__one", { theme: "light" });
  check(`${name} (ui) and takes itself off again when it is no longer asked for`, (await rootBg("root")) === "rgb(255, 255, 255)", await rootBg("root"));
  const size = async (d) => { await setStyle("__one", { theme: "light", ...(d ? { density: d } : {}) }); return css("#root [data-rk-item=bold]", "height"); };
  check(`${name} (ui) density changes control size: compact 28px, default 32px, comfortable 40px`, [await size("compact"), await size(undefined), await size("comfortable")].join() === "28px,32px,40px", "density");
  await setStyle("__one", { theme: "light", classes: { button: "u-btn u-big", content: "u-body" } });
  check(`${name} (ui) extra classes land on every element of a part`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rk-part=button]")].every((b) => b.classList.contains("u-btn") && b.classList.contains("u-big")) && document.querySelector("#root [data-rk-part=content]").classList.contains("u-body")), "classes");
  await setStyle("__one", { theme: "light" });
  check(`${name} (ui) and are taken away again`, await page.evaluate(() => !document.querySelector("#root .u-btn, #root .u-body")), "classes gone");
  await setStyle("__one", { theme: "light", messages: { "item.bold": "Gras" } });
  check(`${name} (ui) messages rename an item for assistive technology and the tooltip`, await page.evaluate(() => { const b = document.querySelector("#root [data-rk-item=bold]"); return b.getAttribute("aria-label") === "Gras" && b.title.startsWith("Gras"); }), "messages");
  await setStyle("__one", { theme: "light", icons: { bold: '<svg viewBox="0 0 24 24" id="custom-bold"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>', italic: '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>' } });
  check(`${name} (ui) a given icon replaces the default`, await page.evaluate(() => !!document.querySelector("#root [data-rk-item=bold] svg#custom-bold")), "custom icon");
  check(`${name} (ui) and an icon that is not plain svg is refused, leaving the words`, await page.evaluate(() => { const b = document.querySelector("#root [data-rk-item=italic]"); return !b.querySelector("svg") && b.textContent === "Italic"; }), "unsafe icon");
  await setStyle("__one", { theme: "light" });
  // Non-color cues, focus, forced colors, reduced motion.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="bold"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) a pressed button has a thicker bottom edge, not only a different color`, (await css('#root [data-rk-item="bold"]', "borderBottomWidth")) === "3px" && (await css('#root [data-rk-item="italic"]', "borderBottomWidth")) === "1px", [await css('#root [data-rk-item="bold"]', "borderBottomWidth"), await css('#root [data-rk-item="italic"]', "borderBottomWidth")]);
  await page.evaluate(() => document.querySelector('#root [data-rk-item="bold"]').focus());
  await page.keyboard.press("ArrowRight");
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor }; });
  check(`${name} (ui) keyboard focus draws a 2px solid ring in the focus color`, ring.style === "solid" && ring.width === "2px" && ring.color === "rgb(23, 64, 139)", ring);
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await page.evaluate(() => { const b = document.querySelector('#root [data-rk-item="bold"]'); const c = getComputedStyle(b); return { bottom: c.borderBottomWidth, style: c.borderBottomStyle }; });
  check(`${name} (ui) in forced colors a pressed button keeps a real border, thicker still`, forced.bottom === "4px" && forced.style === "solid", forced);
  await page.emulateMedia({ forcedColors: "none" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(`${name} (ui) reduced motion turns the button transitions off`, (await css('#root [data-rk-item="italic"]', "transitionDuration")) === "0s", await css('#root [data-rk-item="italic"]', "transitionDuration"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Announcements and the link dialog.
  check(`${name} (ui) pressing a toggle announces it`, await page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve(document.querySelector("#root [role=status]").textContent === "Bold on"), 150))), "announce");
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 4, n, 7); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the link dialog opens with its title, a labelled field, and focus in the field`, await page.evaluate(() => { const d = document.querySelector("#root [data-rk-part=dialog]"); const f = d.querySelector("[data-rk-part=field]"); return d.open && d.querySelector("[data-rk-part=dialog-title]").textContent === "Link" && f.labels[0].textContent === "Address" && document.activeElement === f; }), await active());
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) an unsafe address is refused with a message tied to the field`, await page.evaluate(() => { const f = document.querySelector("#root [data-rk-part=field]"); const e = document.querySelector("#root [data-rk-part=field-error]"); return f.getAttribute("aria-invalid") === "true" && f.getAttribute("aria-describedby") === e.id && e.textContent.length > 0 && document.querySelector("#root [data-rk-part=dialog]").open; }), "unsafe");
  await page.fill("#root [data-rk-part=field]", "https://x.test");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) a good address closes the dialog and links the selected text`, (await page.evaluate(() => window.__one.editor.getHtml())) === '<p>one <a href="https://x.test">two</a> three</p>' && !(await page.evaluate(() => document.querySelector("#root [data-rk-part=dialog]").open)), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) focus goes back to the control that opened it`, (await active()) === "rk-link" || (await page.evaluate(() => document.activeElement.getAttribute("data-rk-item"))) === "link", await active());
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rk-part=content] a").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) opened on an existing link, the dialog shows its address`, (await page.evaluate(() => document.querySelector("#root [data-rk-part=field]").value)) === "https://x.test", await page.evaluate(() => document.querySelector("#root [data-rk-part=field]").value));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  // Cleaning up.
  await page.evaluate(() => window.__two.ui.destroy());
  check(`${name} (ui) destroying an interface removes what it added and leaves the other one alone`, await page.evaluate(() => { const r = document.getElementById("second"); return !r.classList.contains("rk-root") && !r.hasAttribute("data-rk-theme") && !r.querySelector("[data-rk-part=toolbar]") && document.getElementById("root").classList.contains("rk-root"); }), "destroy");
  check(`${name} (ui) no page errors`, t.errors.length === 0, t.errors);
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
  // Shared machines are slower and noisier than a desk: RTE_SPEED_SCALE widens every budget by that factor (CI sets 2). Unset, it is 1.
  const scale = Number(process.env.RTE_SPEED_SCALE ?? 1);
  for (const [label, rate] of [["", 1], [" (CPU 4x slower)", 4]]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate });
    const caret = await caretMoves(5000);
    console.log(`speed${label} 5000 paragraphs, caret move with ${caret.subscribed} subscribed commands: p95 ${caret.p95.toFixed(2)} ms (${caret.woken} notifications)`);
    if (rate === 1) check("speed: a caret move with every command subscribed, 5000 paragraphs, within 30 ms (p95)", caret.p95 <= 30 * scale, caret);
    for (const [n, commandBudget, setBudget] of [[1000, 10, 40], [5000, 30, Infinity]]) {
      const r = await measure(n);
      const worst = Math.max(r.typeMiddle, r.typeTop, r.enterTop, r.joinTop, r.pasteTop);
      console.log(`speed${label} ${n} paragraphs: set ${r.set.toFixed(1)} ms warm, ${r.setCold.toFixed(1)} ms cold; p95 per command: type ${r.typeMiddle.toFixed(1)} (top ${r.typeTop.toFixed(1)}), Enter ${r.enterTop.toFixed(1)}, join ${r.joinTop.toFixed(1)}, paste ${r.pasteTop.toFixed(1)} ms`);
      if (rate === 1) {
        check(`speed: ${n} paragraphs, every command within ${commandBudget} ms (p95)`, worst <= commandBudget * scale, r);
        check(`speed: ${n} paragraphs, set content within ${setBudget} ms`, r.set <= setBudget * scale, r);
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
