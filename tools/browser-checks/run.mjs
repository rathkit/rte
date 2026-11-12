// Drives the real editor with real browser events in Chromium, Firefox and WebKit: typing, the system clipboard,
// drag and drop, input-method composition, outside requests and speed. Playwright is not a dependency of this repo;
// point RTE_PLAYWRIGHT at a node_modules folder that has it.
//   RTE_PLAYWRIGHT=tools/browser-checks/node_modules tools/browser-checks/run.sh
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const base = process.argv[2];
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
const fixtureDir = join(import.meta.dirname, "../../fixtures/paste");

// A valid 1 by 1 PNG, built here (a literal base64 string could contain a word the denylist check looks for).
function onePixelPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 255]))), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

let failures = 0;
let passes = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else {
    failures++;
    console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`);
  }
};

async function open(type, options = {}, cfg = "", demo = false, init = undefined) {
  const page_url = demo === "element" ? "/element/demo/" : demo === "ui" ? "/ui/demo/" : "/headless/demo/";
  const ready_flag = demo === "element" ? "window.__elementReady===true" : demo === "ui" ? "window.__uiReady===true" : "window.__demoReady===true";
  const browser = await type.launch();
  const context = await browser.newContext(options);
  if (init) await context.addInitScript(init);
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

  // --- input types the browser asks for by name that are not typing
  const beforeInput = (inputType, data) => page.evaluate(([t, d]) => document.getElementById("ed").dispatchEvent(new InputEvent("beforeinput", { inputType: t, data: d, bubbles: true, cancelable: true })), [inputType, data]);
  await reset("<p>abcd</p>");
  await select({ start: "p", so: 2, eo: 2 });
  await beforeInput("insertTranspose");
  check(`${name} a transpose request swaps the characters round the caret`, (await html()) === "<p>acbd</p>", await html());
  await reset("<p>one</p>");
  await select({ start: "p", so: 3, eo: 3 });
  await beforeInput("insertFromYank", " two");
  check(`${name} a yank request inserts the text`, (await html()).replace(/&nbsp;/g, " ") === "<p>one two</p>", await html());
  await reset("<p>one two</p>");
  await select({ start: "p", so: 0, eo: 3 });
  // Chromium turns an input type it does not know into an empty one when the event is made, so it never sends these two.
  if (name !== "chromium") {
    await beforeInput("deleteContent");
    check(`${name} a delete-content request deletes the selection`, (await html()) === "<p> two</p>" || (await html()) === "<p>&nbsp;two</p>", await html());
  }
  await reset("<p>one</p>");
  await select({ start: "p", so: 1, eo: 1 });
  await beforeInput("insertOrderedList");
  check(`${name} an ordered list request makes a numbered list`, (await html()) === "<ol><li>one</li></ol>", await html());
  // A soft line is a line as the page wraps it: the test finds where the lines break, puts the caret in the middle of the second one,
  // and checks each request against the text worked out from those breaks.
  await page.evaluate(() => { document.getElementById("ed").style.width = "160px"; });
  const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi";
  await reset(`<p>${text}</p>`);
  const lines = await page.evaluate(() => {
    const n = document.querySelector("#ed p").firstChild; const out = []; let top = null;
    for (let i = 0; i < n.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const t = Math.round(r.getBoundingClientRect().top); if (top === null || t > top + 5) { out.push(i); top = t; } }
    return out;
  });
  check(`${name} the test paragraph wraps onto at least three lines`, lines.length >= 3, lines);
  const lineStart = lines[1];
  const lineEnd = lines[2];
  const mid = Math.floor((lineStart + lineEnd) / 2);
  const lineCheck = async (inputType, expected, label) => {
    await reset(`<p>${text}</p>`);
    await select({ start: "p", so: mid, eo: mid });
    await beforeInput(inputType);
    const got = (await html()).replace(/&nbsp;/g, " ");
    // A space at the wrap belongs to the line before it or the line after it, depending on the browser; ignore only that.
    check(`${name} ${label}`, got.replace(/ /g, "") === `<p>${expected}</p>`.replace(/ /g, ""), { got, expected });
  };
  await lineCheck("deleteSoftLineBackward", text.slice(0, lineStart) + text.slice(mid), "deleting to the start of a soft line takes from the start of that line to the caret");
  await lineCheck("deleteSoftLineForward", text.slice(0, mid) + text.slice(lineEnd), "deleting to the end of a soft line takes from the caret to the end of that line");
  if (name !== "chromium") await lineCheck("deleteEntireSoftLine", text.slice(0, lineStart) + text.slice(lineEnd), "deleting the entire soft line takes that line only");
  await page.evaluate(() => { document.getElementById("ed").style.width = ""; });

  // --- a paragraph inside a list item
  await reset("<ul><li>one</li></ul>");
  await select({ start: "li", so: 3, eo: 3 });
  await page.keyboard.press("ControlOrMeta+Shift+Enter");
  await page.keyboard.type("two");
  check(`${name} Mod+Shift+Enter starts a paragraph in the item, not a new item`, (await html()) === "<ul><li><p>one</p><p>two</p></li></ul>", await html());
  check(`${name} and the gap between the paragraphs is drawn without being text`, await page.evaluate(() => { const li = document.querySelector("#ed li"); return !!li.querySelector("[data-rte-gap]") && li.textContent === "onetwo"; }), await page.evaluate(() => document.querySelector("#ed li").innerHTML));
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  check(`${name} Backspace at the start of the second paragraph joins it to the first`, (await html()) === "<ul><li>onetwo</li></ul>", await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and one undo brings it back`, (await html()) === "<ul><li><p>one</p><p>two</p></li></ul>", await html());
  await reset("<ul><li><p>a</p><p>b</p></li><li>c</li></ul>");
  await page.click("#ed li:nth-child(2)");
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  check(`${name} a list loaded with two paragraphs in an item can still be typed in elsewhere`, (await html()) === "<ul><li><p>a</p><p>b</p></li><li>c!</li></ul>", await html());

  // --- typed shortcuts
  for (const [typed, out] of [["## Title", "<h2>Title</h2>"], ["> quoted", "<blockquote><p>quoted</p></blockquote>"], ["a **b** c", "<p>a <strong>b</strong> c</p>"], ["`x` y", "<p><code>x</code> y</p>"], ["see https://example.test/a now", '<p>see <a href="https://example.test/a">https://example.test/a</a> now</p>']]) {
    await reset("");
    await page.keyboard.type(typed);
    check(`${name} typing ${JSON.stringify(typed)} formats as it goes`, (await html()).replace(/&nbsp;/g, " ") === out, await html());
  }
  await reset("");
  await page.keyboard.type("**bold**");
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} one undo takes a typed shortcut back`, !(await html()).includes("<strong>"), await html());

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
  // Selection and caret rules (docs/SELECTION.md): where the editor says the caret is must be where the page has it, in every engine.
  const model = () => page.evaluate(() => { const s = window.__editor.selection; const f = (p) => `${p.path.join(".")}:${p.offset}`; return `${f(s.anchor)}>${f(s.focus)}`; });
  const put = (selector, nth, offset, end = offset) => page.evaluate(([sel, n, a, b]) => { const el = document.querySelectorAll(`#ed ${sel}`)[n]; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const t = walker.nextNode() ?? el; window.__editor.selectDom(t, t === el ? 0 : a, t, t === el ? 0 : b); }, [selector, nth, offset, end]);
  const key = async (...keys) => { for (const k of keys) await page.keyboard.press(k); await page.waitForTimeout(60); };
  const png = onePixelPng();
  // An inline image is one position: the caret passes it in one key, shift extends over exactly it, delete removes just it.
  await reset(`<p>a<img src="${png}" alt="i">b</p>`);
  await put("p", 0, 1);
  await key("ArrowRight");
  check(`${name} selection: one Right passes an inline image`, (await model()) === "0:2>0:2", await model());
  await put("p", 0, 1);
  await key("Shift+ArrowRight");
  check(`${name} selection: Shift+Right selects exactly the image`, (await model()) === "0:1>0:2", await model());
  await put("p", 0, 1);
  await key("Delete");
  check(`${name} selection: Delete before an image removes only the image`, (await html()) === "<p>ab</p>", await html());
  // A footnote reference is the same.
  await reset('<p>ab<sup data-note="q"><a href="#fn-q">1</a></sup>cd</p><section class="footnotes" role="doc-endnotes"><ol><li id="fn-q" data-note="q">Q. <a href="#fnref-q" role="doc-backlink">↩</a></li></ol></section>');
  await put("p", 0, 2);
  await key("ArrowRight");
  check(`${name} selection: one Right passes a footnote reference`, (await model()) === "0:3>0:3", await model());
  await put("p", 0, 2);
  await key("Shift+ArrowRight");
  check(`${name} selection: Shift+Right selects exactly the reference`, (await model()) === "0:2>0:3", await model());
  // Select all runs from the start of the first block to the end of the last.
  await reset("<p>one</p><p>two</p><ul><li>x</li></ul>");
  await put("p", 0, 1);
  await key("ControlOrMeta+a");
  check(`${name} selection: select all spans the whole document`, (await model()) === "0:0>2.0:1", await model());
  // Shift-arrow extends one character at a time, and back.
  await reset("<p>hello</p>");
  await put("p", 0, 1);
  await key("Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowRight");
  check(`${name} selection: three Shift+Right extend by three`, (await model()) === "0:1>0:4", await model());
  await key("Shift+ArrowLeft");
  check(`${name} selection: Shift+Left takes one back`, (await model()) === "0:1>0:3", await model());
  await key("Shift+ArrowDown");
  check(`${name} selection: Shift+Down at the last line goes to the end`, (await model()).startsWith("0:1>0:") && (await model()).endsWith(":5"), await model());
  // Across blocks: shift-down selects through to the same column of the next block.
  await reset("<p>one</p><p>two</p>");
  await put("p", 0, 1);
  await key("Shift+ArrowDown");
  check(`${name} selection: Shift+Down runs into the next block at the same column`, (await model()) === "0:1>1:1", await model());
  // Right-to-left text: Right moves toward the end of the line on the screen, which is the start of the text.
  await reset('<p dir="rtl">אבגד</p>');
  await put("p", 0, 2);
  await key("ArrowRight");
  check(`${name} selection: in right-to-left text Right moves to the earlier letter`, (await model()) === "0:1>0:1", await model());
  await key("ArrowLeft", "ArrowLeft");
  check(`${name} selection: and Left to the later one`, (await model()) === "0:3>0:3", await model());
  // Block edges: the caret moves on to the next container at its start, and Down keeps the column.
  await reset("<ul><li>a</li><li>b</li></ul>");
  await put("li", 0, 1);
  await key("ArrowRight");
  check(`${name} selection: Right at the end of a list item goes to the start of the next`, (await model()) === "0.1:0>0.1:0", await model());
  await key("ArrowLeft");
  check(`${name} selection: Left at the start goes back to the end`, (await model()) === "0.0:1>0.0:1", await model());
  await reset("<blockquote><p>q</p></blockquote><p>after</p>");
  await put("blockquote p", 0, 1);
  await key("ArrowRight");
  check(`${name} selection: Right at the end of a quote leaves it for the next block`, (await model()) === "1:0>1:0", await model());
  await key("ArrowLeft");
  check(`${name} selection: and Left comes back into the quote`, (await model()) === "0.0:1>0.0:1", await model());
  await reset("<pre><code>ab</code></pre><p>x</p>");
  await put("pre", 0, 2);
  await key("ArrowRight");
  check(`${name} selection: Right at the end of a code block leaves it`, (await model()) === "1:0>1:0", await model());
  await reset("<table><tr><td>a</td><td>b</td></tr></table>");
  await put("td", 0, 1);
  await key("ArrowRight");
  check(`${name} selection: Right at the end of a table cell goes to the next cell`, (await model()) === "0.0.1.0:0>0.0.1.0:0", await model());
  await reset("<p>one</p><table><tr><td>a</td><td>b</td></tr></table>");
  await put("p", 0, 1);
  await key("ArrowDown");
  check(`${name} selection: Down into a table lands in the cell below the column`, (await model()).startsWith("1.0.0.0:"), await model());
  // A table with nothing after it: Down from its last cell leaves the caret in the cell, on the page as well as in the model.
  await reset("<p>x</p><table><tr><td>a</td></tr></table>");
  await put("td", 0, 1);
  await key("ArrowDown");
  check(`${name} selection: Down in the last cell of a last table keeps the caret in the cell`, (await model()) === "1.0.0.0:1>1.0.0.0:1" && (await page.evaluate(() => document.getSelection().anchorNode?.parentElement?.closest("td") !== null)), await model());
  // A rule is skipped over by the caret and never holds it; the text on either side never jumps across it.
  await reset("<p>one</p><hr><p>two</p>");
  await put("p", 0, 1);
  await key("ArrowDown");
  check(`${name} selection: Down passes a rule to the next block`, (await model()).startsWith("2:"), await model());
  await reset("<hr><p>two</p>");
  await put("p", 0, 0);
  await key("ArrowUp");
  check(`${name} selection: Up from the block after a leading rule keeps the caret in that block's text`, (await model()) === "1:0>1:0" && (await page.evaluate(() => document.getSelection().anchorNode?.nodeType === 3)), await model());
  await key("Backspace");
  check(`${name} selection: Backspace there removes the rule`, (await html()) === "<p>two</p>", await html());
  await reset("<p>one</p><hr><p>two</p>");
  await put("p", 0, 3);
  await key("Delete");
  check(`${name} selection: Delete at the end of a block before a rule removes the rule, not the text order`, (await html()) === "<p>one</p><p>two</p>", await html());
  // Double and triple click: a word, then the block, and typing replaces exactly that.
  const clickAt = async (selector, nth, offset, count) => {
    const box = await page.evaluate(([sel, n, off]) => { const first = (x) => (x.nodeType === 3 ? x : [...x.childNodes].map(first).find(Boolean)); const t = first(document.querySelectorAll(`#ed ${sel}`)[n]); const r = document.createRange(); r.setStart(t, off); r.setEnd(t, off + 1); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, [selector, nth, offset]);
    await page.mouse.click(box.x, box.y, { clickCount: count });
    await page.waitForTimeout(80);
  };
  await reset("<p>one two three</p>");
  await clickAt("p", 0, 5, 2);
  check(`${name} selection: double click selects the word`, (await model()) === "0:4>0:7", await model());
  await reset("<p>one two</p><p>next</p>");
  await clickAt("p", 0, 2, 3);
  await page.keyboard.type("X");
  check(`${name} selection: triple click selects the block, and typing leaves the next block alone`, (await html()) === "<p>X</p><p>next</p>", await html());
  await reset("<ul><li>one</li><li>two</li></ul>");
  await clickAt("li", 0, 1, 3);
  await page.keyboard.type("X");
  check(`${name} selection: triple click on a list item selects just that item`, (await html()) === "<ul><li>X</li><li>two</li></ul>", await html());
  await reset("<table><tr><td>cell</td><td>b</td></tr></table>");
  await clickAt("td", 0, 1, 3);
  await page.keyboard.type("X");
  check(`${name} selection: triple click in a table cell selects just that cell's text`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>X</td><td>b</td></tr></table>", await html());

  // Enter, Shift+Enter, Backspace and Delete at block edges (docs/BLOCK-EDGES.md has every case; these are a sample in a real browser).
  const edge = async (label, start, offset, selector, keys, expected, nth = 0) => {
    await reset(start);
    await put(selector, nth, offset);
    await key(...keys);
    check(`${name} keys: ${label}`, (await html()).replace(/<\/?tbody>/g, "") === expected, await html());
  };
  await edge("Shift+Enter at the end of a paragraph, then typing, goes on the new line", "<p>abcd</p>", 4, "p", ["Shift+Enter", "X"], "<p>abcd<br>X</p>");
  await edge("Enter on an empty last paragraph in a quote leaves the quote", "<blockquote><p>a</p><p></p></blockquote>", 0, "blockquote p", ["Enter"], "<blockquote><p>a</p></blockquote><p></p>", 1);
  await edge("Backspace at the start of a quote's first paragraph takes it out", "<blockquote><p>a</p><p>b</p></blockquote>", 0, "blockquote p", ["Backspace"], "<p>a</p><blockquote><p>b</p></blockquote>");
  await edge("Backspace at the start of a code block makes it a paragraph", "<pre><code>ab</code></pre>", 0, "pre", ["Backspace"], "<p>ab</p>");
  await edge("Enter twice at the end of a code block leaves it", "<pre><code>ab</code></pre>", 2, "pre", ["Enter", "Enter", "X"], "<pre>ab</pre><p>X</p>");
  await edge("Backspace at the start of a first heading makes it a paragraph", "<h2>ab</h2>", 0, "h2", ["Backspace"], "<p>ab</p>");
  await edge("Backspace at the start of a paragraph after code steps into the code", "<pre><code>a</code></pre><p>b</p>", 0, "p", ["Backspace", "X"], "<pre>aX</pre><p>b</p>");
  await edge("Enter on an empty last list item leaves the list", "<ul><li>a</li><li></li></ul>", 0, "li", ["Enter", "X"], "<ul><li>a</li></ul><p>X</p>", 1);
  await edge("Backspace on an empty paragraph after a table removes it", "<table><tr><td>a</td></tr></table><p></p>", 0, "> p", ["Backspace"], "<table><tr><td>a</td></tr></table>");
  await edge("Backspace after a rule removes the rule and not the text", "<p>a</p><hr><p>b</p>", 0, "p", ["Backspace"], "<p>a</p><p>b</p>", 1);
  await edge("Delete before a rule removes the rule and not the text", "<p>a</p><hr><p>b</p>", 1, "p", ["Delete"], "<p>a</p><p>b</p>");
  await edge("Backspace in a table cell's first paragraph does nothing to the table", "<table><tr><td>a</td><td>b</td></tr></table>", 0, "td", ["Backspace"], "<table><tr><td>a</td><td>b</td></tr></table>", 1);
  await edge("Enter in a table cell starts a paragraph in that cell", "<table><tr><td>ab</td><td>c</td></tr></table>", 1, "td", ["Enter", "X"], "<table><tr><td><p>a</p><p>Xb</p></td><td>c</td></tr></table>");
  // Content policy (docs/CONTENT-POLICY.md): hostile markup never throws, and what it holds that is not allowed does not reach the page.
  await reset(`${"<div>".repeat(100000)}deep${"<span>".repeat(100000)}<script>SECRET</script><a href="java&#9;script:alert(1)" onclick="x()">link</a><img src="file:///x" onerror="window.__pwned=1">`);
  check(`${name} policy: 100,000 nested elements load, with the text and without the script`, (await html()) === "<p>deeplink</p>", (await html()).slice(0, 200));
  check(`${name} policy: nothing hostile reached the page`, await page.evaluate(() => !window.__pwned && !document.querySelector("#ed script, #ed [onclick], #ed [onerror], #ed a[href^=javascript]")));
  // An empty item that holds a nested list shows a marker; Backspace in it takes the marker away.
  await edge("Enter at the end of an item with a nested list gives an item with a bullet", "<ul><li>a<ul><li>b</li></ul></li></ul>", 1, "ul > li", ["Enter"], "<ul><li>a</li><li><ul><li>b</li></ul></li></ul>");
  check(`${name} keys: that item shows its bullet`, await page.evaluate(() => getComputedStyle(document.querySelectorAll("#ed > ul > li")[1]).listStyleType) !== "none");
  await key("Backspace");
  check(`${name} keys: Backspace in it takes the bullet away`, (await page.evaluate(() => getComputedStyle(document.querySelectorAll("#ed > ul > li")[1]).listStyleType)) === "none", await html());
  // A footnote's text stays in the notes list.
  await reset('<p>a<sup data-note="q"><a href="#fn-q">1</a></sup>b</p><section class="footnotes" role="doc-endnotes"><ol><li id="fn-q" data-note="q">Q. <a href="#fnref-q" role="doc-backlink">↩</a></li></ol></section>');
  const before = await html();
  await put("ol[data-rte-notes] li", 0, 0);
  await key("Backspace");
  check(`${name} keys: Backspace at the start of a note does nothing`, (await html()) === before, await html());
  await page.evaluate(() => { const walker = document.createTreeWalker(document.querySelector("#ed > p"), NodeFilter.SHOW_TEXT); let last; while (walker.nextNode()) last = walker.currentNode; window.__editor.selectDom(last, last.length, last, last.length); });
  await key("Delete");
  check(`${name} keys: Delete at the end of the body does not pull the note in`, (await html()) === before, await html());

  // Read-only and disabled (docs/ACCESS.md): every way of changing the document, walked in both states.
  const ACCESS_DOC = '<p>alpha beta</p><ul><li style="list-style-type: none;"><input type="checkbox" disabled> todo</li></ul><table><tr><td>a</td><td>b</td></tr></table><p>last</p>';
  const fire = (fn, ...args) => page.evaluate(fn, ...args);
  for (const state of ["readonly", "disabled"]) {
    const tag = `${name} access (${state})`;
    await reset(ACCESS_DOC);
    // A history step exists before the editor is switched, so undo has something to refuse.
    await page.click("#ed > p");
    await page.keyboard.type("Q");
    let typed = await html();
    await page.evaluate((st) => { st === "readonly" ? window.__editor.setReadOnly(true) : window.__editor.setDisabled(true); }, state);
    const same = async (what) => check(`${tag}: ${what}`, (await html()) === typed, await html());
    // Keys and shortcuts.
    await page.click("#ed > p", { force: true });
    for (const k of ["X", "Enter", "Backspace", "Delete", "Tab", "Shift+Tab", "Control+b", "Control+i", "Control+u", "Control+z", "Control+y", "Control+Shift+z", "Control+x", "Control+k", "Control+Enter", "Alt+ArrowUp"]) {
      await page.keyboard.press(k);
    }
    await same("typing, Enter, Backspace, Delete, Tab, shortcuts, undo, redo and cut change nothing");
    await page.keyboard.type("hello");
    await same("typing a word changes nothing");
    // The input events a browser sends for spellcheck, autocorrect, dictation, drag, composition and menus.
    const blocked = await fire(() => {
      const el = document.getElementById("ed");
      const out = [];
      for (const inputType of ["insertText", "insertReplacementText", "insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertFromYank", "insertTranspose", "insertLineBreak", "insertParagraph", "insertCompositionText", "insertLink", "insertOrderedList", "insertUnorderedList", "insertHorizontalRule", "deleteContentBackward", "deleteContentForward", "deleteByCut", "deleteByDrag", "deleteWordBackward", "deleteHardLineBackward", "historyUndo", "historyRedo", "formatBold", "formatItalic", "formatUnderline", "formatStrikeThrough", "formatJustifyCenter", "formatIndent", "formatRemove", "formatSetBlockTextDirection"]) {
        const ev = new InputEvent("beforeinput", { inputType, data: "ZZ", bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        if (!ev.defaultPrevented) out.push(inputType);
      }
      return out;
    });
    check(`${tag}: every kind of input event is refused`, blocked.length === 0, blocked);
    await same("none of those input events changed anything");
    // Composition.
    await fire(() => {
      const el = document.getElementById("ed");
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "日", bubbles: true }));
      el.dispatchEvent(new CompositionEvent("compositionend", { data: "日本", bubbles: true }));
    });
    await same("an input-method composition changes nothing");
    // Paste (event and API), drop (text and files), drag, cut.
    if (name !== "firefox") {
      await fire(() => {
        const dt = new DataTransfer();
        dt.setData("text/html", "<p>PASTED</p>");
        dt.setData("text/plain", "PASTED");
        document.getElementById("ed").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        const cut = new DataTransfer();
        document.getElementById("ed").dispatchEvent(new ClipboardEvent("cut", { clipboardData: cut, bubbles: true, cancelable: true }));
      });
      await same("a paste event and a cut event change nothing");
    }
    await fire(() => window.__editor.paste({ html: "<p>API</p>", text: "API" }));
    await same("paste through the API changes nothing");
    await fire(async () => {
      const el = document.getElementById("ed");
      const r = el.getBoundingClientRect();
      for (const fill of [(dt) => dt.setData("text/plain", "DROPPED"), (dt) => dt.setData("text/html", "<p>DROPPED</p>"), (dt) => dt.items.add(new File(["x"], "a.txt", { type: "text/plain" })), (dt) => dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" }))]) {
        const dt = new DataTransfer();
        fill(dt);
        el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 10 }));
        el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 10 }));
      }
    });
    await page.waitForTimeout(80);
    await same("dropping text, markup and files changes nothing");
    // Dragging the page's own text.
    await page.evaluate(() => window.__editor.selectDom(document.querySelector("#ed > p").firstChild, 0, document.querySelector("#ed > p").firstChild, 5));
    const dragBox = await page.evaluate(() => { const r = document.querySelector("#ed > p:last-child").getBoundingClientRect(); return { x: r.x + 4, y: r.y + r.height / 2 }; });
    await fire(([x, y]) => {
      const el = document.getElementById("ed");
      const dt = new DataTransfer();
      el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      el.dispatchEvent(new DragEvent("dragend", { dataTransfer: dt, bubbles: true }));
    }, [dragBox.x, dragBox.y]);
    await same("dragging the page's own text somewhere else changes nothing");
    // Commands, by name: the editor's own and the plugins'.
    const ran = await fire(() => {
      const ed = window.__editor;
      const names = ed.commands.list().map((c) => c.name).filter((n) => !/^(document\.|history\.undo$)/.test(n) || n.startsWith("document.") === false);
      const changed = [];
      for (const n of names) {
        if (/^(find\.|markdown\.copy|selection|document\.)/.test(n)) continue;
        const state = ed.commands.state(n);
        const before = ed.getHtml();
        let result;
        try { result = ed.commands.run(n, n === "link.set" ? { href: "https://x" } : n === "image.insert" ? { src: "https://x/y.png" } : undefined); } catch { result = "threw"; }
        if (result === true || ed.getHtml() !== before) changed.push(n);
        if (state.enabled && !/^(history\.|view\.)/.test(n) && ed.commands.list().find((c) => c.name === n)) changed.push(`${n} (enabled)`);
      }
      return { count: names.length, changed };
    });
    check(`${tag}: no command changes anything, and none of them reports itself as enabled`, ran.changed.length === 0 && ran.count > 30, ran);
    await same("running every command changed nothing");
    // The task checkbox.
    await page.click("#ed [data-rte-check]", { force: true });
    await same("clicking a task's checkbox changes nothing");
    // Table sizing: the column and row edges and the grips do nothing, and the pointer does not offer them.
    const grid = '<table><tr><td>a1</td><td>a2</td></tr><tr><td>b1</td><td>b2</td></tr></table>';
    await page.evaluate((g) => { window.__editor.setReadOnly(false); window.__editor.setDisabled(false); window.__editor.setHtml(g); }, grid);
    const gridBefore = await html();
    await page.evaluate((st) => { st === "readonly" ? window.__editor.setReadOnly(true) : window.__editor.setDisabled(true); }, state);
    const cellGeometry = () => page.evaluate(() => { const b = document.querySelector("#ed tr:nth-child(1) td:nth-child(1)").getBoundingClientRect(); return { right: b.right, bottom: b.bottom, mid: b.top + b.height / 2, left: b.left + b.width / 2 }; });
    const g = await cellGeometry();
    await page.mouse.move(g.right - 2, g.mid);
    check(`${tag}: the pointer on a column edge does not offer to resize`, (await page.evaluate(() => document.getElementById("ed").style.cursor)) === "", await page.evaluate(() => document.getElementById("ed").style.cursor));
    await page.mouse.down();
    await page.mouse.move(g.right + 40, g.mid, { steps: 4 });
    check(`${tag}: dragging a column edge shows no guide`, (await page.evaluate(() => document.querySelectorAll("[data-rte-resize-line]").length)) === 0, "guide");
    await page.mouse.up();
    await page.mouse.move(g.left, g.bottom - 2);
    await page.mouse.down();
    await page.mouse.move(g.left, g.bottom + 30, { steps: 4 });
    check(`${tag}: dragging a row edge shows no guide`, (await page.evaluate(() => document.querySelectorAll("[data-rte-resize-line]").length)) === 0, "guide");
    await page.mouse.up();
    await page.mouse.dblclick(g.right - 2, g.mid);
    await page.click("#ed td", { force: true });
    await page.waitForTimeout(60);
    check(`${tag}: a table the caret is in has no grips`, (await page.evaluate(() => document.querySelectorAll("[data-rte-grip]").length)) === 0, "grips");
    check(`${tag}: table edges, grips and double clicks changed nothing`, (await html()).replace(/<\/?tbody>/g, "") === gridBefore.replace(/<\/?tbody>/g, ""), await html());
    await page.evaluate((a) => { window.__editor.setReadOnly(false); window.__editor.setDisabled(false); window.__editor.setHtml(a); }, ACCESS_DOC);
    await page.evaluate((st) => { st === "readonly" ? window.__editor.setReadOnly(true) : window.__editor.setDisabled(true); }, state);
    typed = await html();
    // Replacing text with the find bar's command.
    await fire(() => { window.__editor.commands.run("find.replaceAll", { find: "alpha", replace: "ZED" }); window.__editor.commands.run("find.replace", { replace: "ZED" }); });
    await same("replace and replace all change nothing");
    // What stays: selection and copy.
    await fire(() => window.__editor.selectDom(document.querySelector("#ed > p").firstChild, 0, document.querySelector("#ed > p").firstChild, 5));
    const copied = await fire(() => {
      const dt = new DataTransfer();
      document.getElementById("ed").dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
      return dt.getData("text/plain");
    }).catch(() => null);
    if (name !== "firefox") check(`${tag}: copy still gives the selected text`, copied === "alpha", copied);
    const model = await page.evaluate(() => { const s = window.__editor.selection; return s.anchor.offset !== s.focus.offset; });
    check(`${tag}: selection still moves in the model`, model, await page.evaluate(() => window.__editor.selection));
    // Programmatic replacement by the host still works: it is not an edit by the user.
    await fire(() => window.__editor.setHtml("<p>host set</p>"));
    check(`${tag}: the host can still set the content`, (await html()) === "<p>host set</p>", await html());
    // Focus and the page's own words about it.
    const attrs = await page.evaluate(() => { const e = document.getElementById("ed"); return { ce: e.getAttribute("contenteditable"), ro: e.getAttribute("aria-readonly"), dis: e.getAttribute("aria-disabled"), tab: e.getAttribute("tabindex"), tabIndex: e.tabIndex }; });
    if (state === "readonly") check(`${tag}: read-only is announced and stays in the tab order`, attrs.ce === "false" && attrs.ro === "true" && attrs.dis === null && attrs.tabIndex === 0, attrs);
    else check(`${tag}: disabled is announced and leaves the tab order`, attrs.ce === "false" && attrs.ro === null && attrs.dis === "true" && attrs.tab === null && attrs.tabIndex === -1, attrs);
    await page.evaluate(() => { const b = document.createElement("button"); b.id = "before"; b.textContent = "before"; document.body.insertBefore(b, document.getElementById("ed")); const a = document.createElement("button"); a.id = "after"; a.textContent = "after"; document.getElementById("ed").after(a); document.getElementById("before").focus(); });
    await page.keyboard.press("Tab");
    const landed = await page.evaluate(() => document.activeElement.id);
    check(`${tag}: Tab ${state === "readonly" ? "lands on the editor" : "skips the editor"}`, landed === (state === "readonly" ? "ed" : "after"), landed);
    await page.evaluate(() => { document.getElementById("before").remove(); document.getElementById("after").remove(); });
    if (state === "disabled") {
      await page.evaluate(() => { window.__editor.setDisabled(false); window.__editor.focus(); });
      await page.evaluate(() => { window.__editor.setDisabled(true); });
      check(`${tag}: disabling an editor that has the focus takes the focus away`, await page.evaluate(() => document.activeElement !== document.getElementById("ed")), await page.evaluate(() => document.activeElement.tagName));
    }
    // And back: everything works again.
    await page.evaluate(() => { window.__editor.setReadOnly(false); window.__editor.setDisabled(false); });
    await reset("<p>back</p>");
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    const again = await page.evaluate(() => { const e = document.getElementById("ed"); return { ce: e.getAttribute("contenteditable"), ro: e.getAttribute("aria-readonly"), dis: e.getAttribute("aria-disabled"), tab: e.getAttribute("tabindex") }; });
    check(`${tag}: switched off again, the editor edits and its attributes are as they were`, (await html()) === "<p>back!</p>" && again.ce === "true" && again.ro === null && again.dis === null && again.tab === null, [await html(), again]);
  }
  // History rules (docs/HISTORY.md): typing in a row is one step; moving the caret ends it; a composition is a step of its own.
  await reset("<p>one two</p>");
  await select({ start: "p", so: 3, eo: 3 });
  await page.keyboard.type("AB");
  await page.keyboard.press("End");
  await page.keyboard.type("C");
  check(`${name} history: typed text is in`, (await html()) === "<p>oneAB twoC</p>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} history: one undo takes back only the typing after the caret moved`, (await html()) === "<p>oneAB two</p>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} history: the next takes back the first typing`, (await html()) === "<p>one two</p>", await html());
  await page.keyboard.press("Control+Shift+Z");
  await page.keyboard.press("Control+Shift+Z");
  check(`${name} history: redo twice puts it all back`, (await html()) === "<p>oneAB twoC</p>", await html());
  await reset("<p></p>");
  await select({ start: "p", so: 0, eo: 0 });
  await page.keyboard.type("hello");
  await page.keyboard.press("Control+Z");
  check(`${name} history: typing a word is still one undo step`, (await html()) === "<p></p>", await html());
  // An input method: the browser has changed the text by the time the composition ends; the editor takes it as one step.
  await reset("<p></p>");
  await select({ start: "p", so: 0, eo: 0 });
  await page.keyboard.type("ab");
  await page.evaluate(() => {
    const el = document.querySelector("[contenteditable]");
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const text = el.querySelector("p").firstChild;
    text.data = "ab日本";
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本" }));
  });
  await page.keyboard.type("c");
  check(`${name} history: composition and typing are in`, (await html()) === "<p>ab日本c</p>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} history: undo takes back the typing after the composition`, (await html()) === "<p>ab日本</p>", await html());
  await page.keyboard.press("Control+Z");
  check(`${name} history: the next takes back the composition alone`, (await html()) === "<p>ab</p>", await html());
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
  // --- task lists: the checkbox is not text, so typing, selecting and Enter must work as if it were not there
  await reset("<ul><li>buy milk</li></ul>");
  await page.click("li");
  await page.evaluate(() => window.__editor.commands.run("list.checklist"));
  const task = '<ul><li style="list-style-type: none;"><input type="checkbox" disabled> buy milk</li></ul>';
  check(`${name} the task list command makes the item a task, drawn with a checkbox that is not text`, (await html()) === task && (await page.evaluate(() => { const b = document.querySelector("#ed li [data-rte-check]"); return b.getAttribute("role") === "checkbox" && b.getAttribute("aria-checked") === "false"; })), await html());
  await page.click("li");
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  check(`${name} typing at the end of a task goes in the right place`, (await html()).includes("buy milk!</li>"), await html());
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  check(`${name} and at the start`, (await html()).includes("disabled> &gt;buy milk!</li>") || (await html()).includes("> >buy milk!</li>") || (await html()).includes(">&gt;buy milk!</li>"), await html());
  await page.keyboard.press("Shift+End");
  await page.keyboard.type("Q");
  check(`${name} replacing a selection that starts at the start of a task works`, (await html()).includes("Q</li>") && !(await html()).includes("buy"), await html());
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  check(`${name} Enter makes another task that is not done`, (await html()).endsWith(`<li style="list-style-type: none;"><input type="checkbox" disabled> second</li></ul>`), await html());
  await page.click("li:nth-child(2) [data-rte-check]");
  check(`${name} clicking a checkbox ticks the task and draws it ticked`, (await html()).endsWith(`<input type="checkbox" disabled checked> second</li></ul>`) && (await page.evaluate(() => document.querySelector("#ed li:nth-child(2) [data-rte-check]").getAttribute("aria-checked"))) === "true", await html());
  await page.click("li:nth-child(2)");
  await page.keyboard.press("ControlOrMeta+Enter");
  check(`${name} Mod+Enter unticks it`, (await html()).endsWith(`<input type="checkbox" disabled> second</li></ul>`), await html());
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  check(`${name} Backspace at the start of a task takes its checkbox away`, (await html()).endsWith("<li>second</li></ul>") || (await html()).endsWith("<li> second</li></ul>"), await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and undo brings it back`, (await html()).includes("disabled> second</li>"), await html());
  await reset("");
  await page.keyboard.type("[x] ");
  await page.keyboard.type("done thing");
  check(`${name} typing [x] and a space starts a task that is already done`, (await html()) === `<ul><li style="list-style-type: none;"><input type="checkbox" disabled checked> done thing</li></ul>`, await html());
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
  // Formatting the browser asks for by name runs the command; Mod+\ clears formatting.
  await reset("<p>one two</p>");
  await select({ start: "p", so: 0, eo: 3 });
  await page.evaluate(() => document.getElementById("ed").dispatchEvent(new InputEvent("beforeinput", { inputType: "formatSuperscript", bubbles: true, cancelable: true })));
  check(`${name} the browser's superscript request makes the text superscript`, (await html()) === "<p><sup>one</sup> two</p>", await html());
  await page.evaluate(() => document.getElementById("ed").dispatchEvent(new InputEvent("beforeinput", { inputType: "formatJustifyCenter", bubbles: true, cancelable: true })));
  check(`${name} and a justify request aligns the block`, (await html()).includes('text-align: center'), await html());
  await page.keyboard.press("ControlOrMeta+\\");
  check(`${name} Mod+\\ clears the formatting`, !(await html()).includes("<sup>"), await html());
  // A table pasted into a table fills its cells.
  await reset("<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>");
  await page.click("tr:nth-child(1) td:nth-child(2)");
  await page.evaluate(() => window.__editor.paste({ html: "<table><tr><td>X</td><td>Y</td></tr><tr><td>Z</td><td>W</td></tr></table>" }));
  check(`${name} pasting a table with the caret in a cell fills cells and grows the table`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>a</td><td>X</td><td>Y</td></tr><tr><td>c</td><td>Z</td><td>W</td></tr></table>", await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and one undo takes it all back`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>", await html());
  await page.evaluate(() => window.__editor.paste({ text: "P\tQ\nR\tS\n" }));
  check(`${name} tab-separated text pasted into a cell becomes cells filled from that cell`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>a</td><td>P</td><td>Q</td></tr><tr><td>c</td><td>R</td><td>S</td></tr></table>", await html());
  // List items that hold more than text: code, paragraphs and quotes after the text, in order, each one editable.
  const ITEM = "<ul><li>a<pre>code</pre><p>after</p><ul><li>sub</li></ul></li><li>b</li></ul>";
  await reset(ITEM);
  check(`${name} a list item shows code, a paragraph and a nested list after its text, in order`, (await html()) === ITEM, await html());
  await page.click("li > pre");
  await page.keyboard.press("End");
  await page.keyboard.type("X");
  check(`${name} typing at the end of code inside an item goes into the code`, (await html()) === ITEM.replace("code", "codeX"), await html());
  await page.keyboard.press("Enter");
  await page.keyboard.type("z");
  check(`${name} Enter in code inside an item adds a line to the code`, (await html()) === ITEM.replace("code", "codeX\nz"), await html());
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and undo takes the typing back`, (await html()) === ITEM.replace("code", "codeX") || (await html()) === ITEM, await html());
  await reset(ITEM);
  await page.click("li > p");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("n");
  check(`${name} Enter at the end of a paragraph inside an item adds a paragraph there`, (await html()) === ITEM.replace("<p>after</p>", "<p>after</p><p>n</p>"), await html());
  await reset("<ul><li>a<pre>code</pre><p></p></li></ul>");
  await page.click("li > p");
  await page.keyboard.press("Backspace");
  check(`${name} Backspace in an empty paragraph after code inside an item removes it`, (await html()) === "<ul><li>a<pre>code</pre></li></ul>", await html());
  await reset(ITEM);
  await page.click("li > p");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("U");
  check(`${name} the Up key moves from a paragraph in an item into the code above it`, /<pre>[^<]*U[^<]*<\/pre>/.test(await html()), await html());
  await reset(ITEM);
  await page.click("li > pre");
  await page.keyboard.press("ControlOrMeta+a");
  await page.evaluate(() => document.addEventListener("copy", (e) => { window.__copied = e.clipboardData.getData("text/html"); }, { once: true }));
  await page.keyboard.press("ControlOrMeta+c");
  check(`${name} copying a whole item writes its code and nested list too`, (await page.evaluate(() => window.__copied)).includes("<pre>code</pre>") && (await page.evaluate(() => window.__copied)).includes("<li>sub</li>"), await page.evaluate(() => window.__copied));
  // Markdown paste (an opt-in plugin): plain text that is clearly Markdown is read as Markdown; HTML on the clipboard and code blocks are left alone.
  await page.evaluate(async () => { const m = await import("/dist/markdown/index.js"); window.__mdStop = window.__editor.use(m.markdown()); });
  await reset("");
  await page.evaluate(() => window.__editor.paste({ text: "# Title\n\n- one\n- **two**\n\n[site](https://x.test)" }));
  check(`${name} Markdown in plain text pastes as headings, lists and links`, (await html()).includes('<h1>Title</h1><ul><li>one</li><li><strong>two</strong></li></ul><p><a href="https://x.test">site</a></p>'), await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and one undo takes the Markdown paste back`, (await html()) === "<p></p>", await html());
  await reset("<p>x</p>");
  await page.click("p");
  await page.evaluate(() => window.__editor.paste({ text: "# Title\n\n- one\n- two", html: "<p>rich</p>" }));
  check(`${name} HTML on the clipboard wins over Markdown in its plain text`, (await html()).includes("rich") && !(await html()).includes("<h1>"), await html());
  await reset("<p>x</p>");
  await page.click("p");
  await page.evaluate(() => window.__editor.paste({ text: "snake_case_name and 2*3*4" }));
  check(`${name} plain text that is not Markdown pastes as typed`, (await html()).includes("snake_case_name and 2*3*4") && !(await html()).includes("<em>"), await html());
  await reset("<pre>code</pre>");
  await page.click("pre");
  await page.evaluate(() => window.__editor.paste({ text: "# Title\n\n- one\n- two" }));
  check(`${name} pasting into a code block stays literal`, (await html()).startsWith("<pre>") && !(await html()).includes("<h1>") && !(await html()).includes("<ul>"), await html());
  // Copy also writes the selection as Markdown (the copy hook), next to the editor's own HTML and text.
  await reset("<h2>T</h2><p>a <strong>bold</strong> and <a href=\"https://x.test\">link</a></p><ul><li>x</li><li>y</li></ul>");
  await page.click("p");
  await page.keyboard.press("ControlOrMeta+a");
  await page.evaluate(() => document.addEventListener("copy", (e) => { window.__copied = [e.clipboardData.getData("text/html"), e.clipboardData.getData("text/plain"), e.clipboardData.getData("text/markdown")]; }, { once: true }));
  await page.keyboard.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => window.__copied);
  check(`${name} copy also writes the selection as Markdown`, copied[2] === "## T\n\na **bold** and [link](https://x.test)\n\n- x\n- y" && copied[0].includes("<h2>") && copied[1].includes("bold"), copied);
  await page.evaluate(() => window.__mdStop());
  // Footnotes (in the standard editor): a reference is one atom in the text, numbered by its place; its note is an item of the list at the end.
  const refs = () => page.evaluate(() => [...document.querySelectorAll("#ed sup[data-rte-note]")].map((e) => e.textContent));
  await reset("<p>Hello world</p>");
  await page.click("p");
  await page.keyboard.press("Home");
  for (let k = 0; k < 5; k++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+Alt+f");
  await page.keyboard.type("The source.");
  check(`${name} the footnote key puts a numbered reference in the text and the caret in the new note`, JSON.stringify(await refs()) === '["1"]' && (await page.evaluate(() => document.querySelector("#ed ol[data-rte-notes] li")?.textContent)) === "The source.", await html());
  check(`${name} the note is written as a section with its address and a way back`, (await html()).includes('<section class="footnotes" role="doc-endnotes"><ol><li id="fn-n1" data-note="n1">The source. <a href="#fnref-n1" role="doc-backlink">'), await html());
  check(`${name} the reference is announced as a footnote reference`, await page.evaluate(() => { const e = document.querySelector("#ed sup[data-rte-note]"); return e?.getAttribute("role") === "doc-noteref" && e.getAttribute("aria-label") === "Footnote 1" && e.getAttribute("contenteditable") === "false"; }));
  await page.keyboard.press("ControlOrMeta+Alt+Shift+f");
  await page.keyboard.type("X");
  check(`${name} the jump key goes from the note to just after its reference`, (await html()).startsWith('<p>Hello<sup data-note="n1"><a href="#fn-n1" id="fnref-n1" role="doc-noteref">1</a></sup>X world</p>'), await html());
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("Y");
  check(`${name} the arrow keys step over a reference as one character`, (await html()).startsWith('<p>HelloY<sup'), await html());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Backspace");
  check(`${name} Backspace right after a reference removes it and its note`, (await html()) === "<p>HelloYX world</p>", await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and one undo brings the reference and the note back together`, JSON.stringify(await refs()) === '["1"]' && (await html()).includes("The source."), await html());
  await page.keyboard.press("Home");
  await page.keyboard.press("ControlOrMeta+Alt+f");
  await page.keyboard.type("First.");
  check(`${name} a reference put before another takes number 1 and the old one becomes 2, in the list too`, JSON.stringify(await refs()) === '["1","2"]' && JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("#ed ol[data-rte-notes] li")].map((e) => e.textContent))) === '["First.","The source."]', await html());
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second paragraph.");
  check(`${name} Enter in a note starts another paragraph of that note, not another note`, (await page.evaluate(() => document.querySelectorAll("#ed ol[data-rte-notes] li").length)) === 2 && (await html()).includes("<p>First.</p><p>Second paragraph.</p>"), await html());
  await page.evaluate(() => window.__editor.commands.run("footnote.goto"));
  await page.keyboard.press("ControlOrMeta+a");
  await page.evaluate(() => document.addEventListener("copy", (e) => { window.__copied = e.clipboardData.getData("text/html"); }, { once: true }));
  await page.keyboard.press("ControlOrMeta+c");
  check(`${name} copying the text writes its notes too`, (await page.evaluate(() => window.__copied)).includes('class="footnotes"') && (await page.evaluate(() => window.__copied)).includes("Second paragraph."), await page.evaluate(() => window.__copied));
  await reset("<p>x</p>");
  await page.click("p");
  await page.evaluate(() => window.__editor.paste({ html: '<p>A<sup data-note="q"><a href="#fn-q">1</a></sup></p><section class="footnotes" role="doc-endnotes"><ol><li id="fn-q" data-note="q">Quoted. <a href="#fnref-q" role="doc-backlink">\u21A9</a></li></ol></section>' }));
  check(`${name} pasting HTML that carries notes makes notes`, JSON.stringify(await refs()) === '["1"]' && (await page.evaluate(() => document.querySelector("#ed ol[data-rte-notes] li")?.textContent)) === "Quoted.", await html());
  await page.evaluate(async () => { const m = await import("/dist/markdown/index.js"); window.__mdStop = window.__editor.use(m.markdown()); });
  await reset("<p>x</p>");
  await page.click("p");
  await page.evaluate(() => window.__editor.paste({ text: "Claim[^1] and more[^2].\n\n[^1]: First *source*.\n[^2]: Second." }));
  check(`${name} Markdown with footnotes pastes as references and notes`, JSON.stringify(await refs()) === '["1","2"]' && (await page.evaluate(() => [...document.querySelectorAll("#ed ol[data-rte-notes] li")].map((e) => e.textContent))).join("|") === "First source.|Second.", await html());
  await page.evaluate(() => document.addEventListener("copy", (e) => { window.__copied = e.clipboardData.getData("text/markdown"); }, { once: true }));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  check(`${name} copy also writes the footnotes as Markdown`, (await page.evaluate(() => window.__copied)).includes("[^1]: First *source*.") && (await page.evaluate(() => window.__copied)).includes("Claim[^1]"), await page.evaluate(() => window.__copied));
  await page.evaluate(() => window.__mdStop());
  // Cell edges: Backspace at the start of a cell and Delete at the end of one leave the table whole.
  await reset("<p>x</p><table><tbody><tr><td>ab</td><td>cd</td></tr></tbody></table><p>y</p>");
  await page.click("td:nth-child(2)");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  check(`${name} Backspace at the start of a cell does nothing`, (await html()) === "<p>x</p><table><tbody><tr><td>ab</td><td>cd</td></tr></tbody></table><p>y</p>", await html());
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  check(`${name} Delete at the end of a cell does nothing`, (await html()) === "<p>x</p><table><tbody><tr><td>ab</td><td>cd</td></tr></tbody></table><p>y</p>", await html());
  await page.click("td:nth-child(1)");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Backspace");
  check(`${name} a selection across two cells deletes in each without joining them`, (await html()) === "<p>x</p><table><tbody><tr><td></td><td>cd</td></tr></tbody></table><p>y</p>" || (await html()) === "<p>x</p><table><tbody><tr><td></td><td>d</td></tr></tbody></table><p>y</p>", await html());
  // Cells a selection runs across are marked; a caret marks none.
  await reset("<table><tbody><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></tbody></table><p>z</p>");
  const marked = () => page.evaluate(() => document.querySelectorAll("#ed [data-rte-cell-selected]").length);
  await page.evaluate(() => { const a = document.querySelector("#ed tr:nth-child(1) td:nth-child(1) p").firstChild; const d = document.querySelector("#ed tr:nth-child(2) td:nth-child(2) p").firstChild; window.__editor.selectDom(a, 1, d, 1); });
  await page.waitForTimeout(60);
  check(`${name} a selection across cells marks the rectangle of cells`, (await marked()) === 4, await marked());
  await page.evaluate(() => { const a = document.querySelector("#ed tr:nth-child(1) td:nth-child(1) p").firstChild; const b = document.querySelector("#ed tr:nth-child(1) td:nth-child(2) p").firstChild; window.__editor.selectDom(a, 1, b, 1); });
  await page.waitForTimeout(60);
  check(`${name} and only the cells the selection runs across`, (await marked()) === 2, await marked());
  await page.evaluate(() => { const a = document.querySelector("#ed tr:nth-child(1) td:nth-child(1) p").firstChild; window.__editor.selectDom(a, 1, a, 1); });
  await page.waitForTimeout(60);
  check(`${name} a caret marks none`, (await marked()) === 0, await marked());
  check(`${name} marking cells leaves the document as it was`, (await html()) === "<table><tbody><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></tbody></table><p>z</p>", await html());
  // A real drag with the mouse from one cell to another selects the rectangle between them.
  const centerOf = (sel) => page.evaluate((q) => { const b = document.querySelector(q).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
  const dragFrom = await centerOf("#ed tr:nth-child(1) td:nth-child(1)");
  const dragTo = await centerOf("#ed tr:nth-child(2) td:nth-child(2)");
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragTo.x, dragTo.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  check(`${name} dragging the mouse from cell to cell marks the rectangle`, (await marked()) === 4, await marked());
  await page.evaluate(() => { const a = document.querySelector("#ed tr:nth-child(1) td:nth-child(1) p").firstChild; window.__editor.selectDom(a, 1, a, 1); });
  // Dragging a column edge sets the width; one undo step; a double-click puts it back to automatic.
  const cellBox = () => page.evaluate(() => { const b = document.querySelector("#ed tr:nth-child(1) td:nth-child(1)").getBoundingClientRect(); return { right: b.right, top: b.top, mid: b.top + b.height / 2, width: b.width }; });
  let box = await cellBox();
  await page.mouse.move(box.right - 2, box.mid);
  check(`${name} the pointer on a column edge shows the resize cursor`, (await page.evaluate(() => document.getElementById("ed").style.cursor)) === "col-resize", "cursor");
  await page.mouse.down();
  await page.mouse.move(box.right + 40, box.mid, { steps: 4 });
  check(`${name} dragging shows a guide line`, (await page.evaluate(() => !!document.querySelector("[data-rte-resize-line]"))) === true, "line");
  await page.mouse.up();
  await page.waitForTimeout(60);
  const wide = await cellBox();
  check(`${name} letting go sets the column width`, /<col style="width: \d+px"><col>/.test(await html()) && Math.abs(wide.width - (box.width + 42)) < 8, { html: await html(), before: box.width, after: wide.width });
  check(`${name} and the guide line is gone`, (await page.evaluate(() => !!document.querySelector("[data-rte-resize-line]"))) === false, "line");
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} one undo takes the width back`, !(await html()).includes("<colgroup>"), await html());
  await page.evaluate(() => window.__editor.commands.run("table.columnWidth", { width: "150px" }));
  box = await cellBox();
  await page.mouse.dblclick(box.right - 2, box.mid);
  check(`${name} double-clicking an edge puts the column back to automatic`, !(await html()).includes("<colgroup>"), await html());
  await page.evaluate(() => window.__editor.commands.run("table.deleteRow"));
  check(`${name} the delete row command removes the row`, !(await html()).includes("<tr><td>c</td>"), await html());
  // Sorting rows from the table menu, by the column the caret is in.
  await reset("<table><tbody><tr><td>b</td></tr><tr><td>c</td></tr><tr><td>a</td></tr></tbody></table><p>z</p>");
  await page.click("#ed tr:nth-child(1) td:nth-child(1)");
  await page.evaluate(() => window.__editor.commands.run("table.sort", "asc"));
  check(`${name} sorting puts the rows in order`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr></table><p>z</p>", await html());
  // Grips on the table the caret is in: drag the row's or the column's to move it.
  await reset("<table><tbody><tr><td>a1</td><td>a2</td><td>a3</td></tr><tr><td>b1</td><td>b2</td><td>b3</td></tr><tr><td>c1</td><td>c2</td><td>c3</td></tr></tbody></table><p>z</p>");
  await page.click("#ed tr:nth-child(1) td:nth-child(1)");
  await page.waitForTimeout(60);
  const gripBox = (kind) => page.evaluate((k) => { const g = document.querySelector(`[data-rte-grip="${k}"]`); if (!g) return null; const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, kind);
  check(`${name} a table with the caret in it has a row grip and a column grip, and no resize grips for a mouse`, !!(await gripBox("row")) && !!(await gripBox("column")) && !(await gripBox("width")) && !(await gripBox("height")), [await gripBox("row"), await gripBox("column")]);
  const rowStart = await gripBox("row");
  const lastRow = await centerOf("#ed tr:nth-child(3) td:nth-child(1)");
  await page.mouse.move(rowStart.x, rowStart.y);
  await page.mouse.down();
  await page.mouse.move(lastRow.x, lastRow.y + 14, { steps: 5 });
  check(`${name} dragging the row grip shows a guide`, (await page.evaluate(() => !!document.querySelector("[data-rte-resize-line]"))) === true, "line");
  await page.mouse.up();
  await page.waitForTimeout(80);
  check(`${name} letting go moves the row there`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>b1</td><td>b2</td><td>b3</td></tr><tr><td>c1</td><td>c2</td><td>c3</td></tr><tr><td>a1</td><td>a2</td><td>a3</td></tr></table><p>z</p>", await html());
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} and one undo takes it back`, (await html()).replace(/<\/?tbody>/g, "").startsWith("<table><tr><td>a1</td>"), await html());
  await page.click("#ed tr:nth-child(1) td:nth-child(1)");
  await page.waitForTimeout(60);
  const colStart = await gripBox("column");
  const lastCol = await centerOf("#ed tr:nth-child(1) td:nth-child(3)");
  await page.mouse.move(colStart.x, colStart.y);
  await page.mouse.down();
  await page.mouse.move(lastCol.x + 20, lastCol.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  check(`${name} dragging the column grip moves the column`, (await html()).replace(/<\/?tbody>/g, "") === "<table><tr><td>a2</td><td>a3</td><td>a1</td></tr><tr><td>b2</td><td>b3</td><td>b1</td></tr><tr><td>c2</td><td>c3</td><td>c1</td></tr></table><p>z</p>", await html());
  await page.evaluate(() => window.__editor.engine.setFocused(false));
  await page.waitForTimeout(60);
  check(`${name} the grips go when the editor loses focus`, !(await gripBox("row")), "grip");
  // Dragging the bottom edge of a row sets its height; a double-click puts it back to automatic.
  await reset("<table><tbody><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></tbody></table><p>z</p>");
  await page.click("#ed tr:nth-child(2) td:nth-child(1)");
  const rowBox = () => page.evaluate(() => { const b = document.querySelector("#ed tr:nth-child(1)").getBoundingClientRect(); return { bottom: b.bottom, left: b.left, width: b.width, height: b.height }; });
  let rb = await rowBox();
  await page.mouse.move(rb.left + 10, rb.bottom - 2);
  check(`${name} the pointer on a row's bottom edge shows the resize cursor`, (await page.evaluate(() => document.getElementById("ed").style.cursor)) === "row-resize", "cursor");
  await page.mouse.down();
  await page.mouse.move(rb.left + 10, rb.bottom + 40, { steps: 4 });
  check(`${name} dragging a row edge shows a guide line`, (await page.evaluate(() => !!document.querySelector("[data-rte-resize-line]"))) === true, "line");
  await page.mouse.up();
  await page.waitForTimeout(60);
  const tall = await rowBox();
  check(`${name} letting go sets the row height`, /<tr style="height: \d+px">/.test(await html()) && Math.abs(tall.height - (rb.height + 42)) < 8, { html: await html(), before: rb.height, after: tall.height });
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} one undo takes the row height back`, !(await html()).includes("height"), await html());
  await page.click("#ed tr:nth-child(1) td:nth-child(1)");
  await page.evaluate(() => window.__editor.commands.run("table.rowHeight", { height: "80px" }));
  rb = await rowBox();
  await page.mouse.dblclick(rb.left + 10, rb.bottom - 2);
  check(`${name} double-clicking a row edge puts the row back to automatic`, !(await html()).includes("height"), await html());
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
  const blocked = await page.evaluate(() => { const e = new InputEvent("beforeinput", { inputType: "formatFontName", cancelable: true, bubbles: true }); document.getElementById("ed").dispatchEvent(e); return e.defaultPrevented; });
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

// --- the clipboard matrix (docs/CLIPBOARD.md): what copy, cut and drag write, and what paste and drop read, in each kind of place, in one
// editor and between two on the same page. The system clipboard is written by a click and read with a real Ctrl+V, so Firefox (which
// ignores the data of a made-up paste event) is covered as well. Each check's name starts "clipboard:" and the doc names it.
for (const [name, type] of engines) {
  const t = await open(type, name === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {});
  const { page } = t;
  const cb = (what, ok, detail) => check(`${name} clipboard: ${what}`, ok, detail);
  // A second editor on the page: the standard one with Markdown, made from the built files, with the given options.
  const second = (options = {}) => page.evaluate(async (o) => {
    const { createEditor } = await import("../dist/standard/index.js");
    const { markdown } = await import("../dist/markdown/index.js");
    window.__b?.destroy();
    document.getElementById("ed2")?.remove();
    const el = document.createElement("div");
    el.id = "ed2";
    el.style.cssText = "min-height:80px;border:1px solid #888;padding:8px;margin-top:16px";
    document.body.appendChild(el);
    window.__warnings = [];
    window.__b = createEditor({ element: el, plugins: [markdown()], onWarning: (w) => window.__warnings.push(w.code), ...o });
  }, options);
  const ed = (id) => (id === "ed" ? "window.__editor" : "window.__b");
  const html = (id = "ed") => page.evaluate(`${ed(id)}.getHtml()`);
  const set = (id, value) => page.evaluate(([e, v]) => { const editor = e === "ed" ? window.__editor : window.__b; editor.setHtml(v); editor.focus(); }, [id, value]);
  // Selects from the first text inside `from` at `so` to the first text inside `to` at `eo`.
  const sel = (id, from, so, to, eo) => page.evaluate(([e, a, ao, b, bo]) => {
    const root = document.getElementById(e);
    const text = (s) => { const n = root.querySelector(s); return document.createTreeWalker(n, NodeFilter.SHOW_TEXT).nextNode() ?? n; };
    const editor = e === "ed" ? window.__editor : window.__b;
    editor.focus();
    editor.selectDom(text(a), ao, text(b ?? a), bo);
  }, [id, from, so, to, eo]);
  // Presses Ctrl+C or Ctrl+X and returns every format the editor wrote.
  const copy = async (key = "C") => {
    await page.evaluate((k) => { window.__copied = null; document.addEventListener(k, (e) => { window.__copied = Object.fromEntries([...e.clipboardData.types].map((ty) => [ty, e.clipboardData.getData(ty)])); }, { once: true }); }, key === "X" ? "cut" : "copy");
    await page.keyboard.press(`Control+${key}`);
    return page.evaluate(() => window.__copied);
  };
  // Puts formats on the system clipboard, from a click so the browser allows it. `image/png` is given as base64.
  const clip = async (data) => {
    await page.evaluate((d) => {
      window.__clip = undefined;
      const b = document.createElement("button");
      b.id = "clip";
      b.style.cssText = "position:fixed;right:0;bottom:0";
      b.onclick = () => {
        const item = {};
        for (const [k, v] of Object.entries(d)) item[k] = new Blob([k === "image/png" ? Uint8Array.from(atob(v), (c) => c.charCodeAt(0)) : v], { type: k });
        navigator.clipboard.write([new ClipboardItem(item)]).then(() => { window.__clip = "ok"; }, (e) => { window.__clip = String(e); });
        b.remove();
      };
      document.body.appendChild(b);
    }, data);
    await page.click("#clip");
    await page.waitForFunction("window.__clip !== undefined");
    return page.evaluate(() => window.__clip);
  };
  const paste = async () => { await page.keyboard.press("Control+V"); await page.waitForTimeout(150); };
  // A real mouse drag from the middle of the selection to the end of the text in `target`, or to a screen point.
  const drag = async (target) => {
    const from = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const to = typeof target === "string" ? await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.right - 2, y: r.y + r.height / 2 }; }, target) : target;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 5, from.y + 5, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const table = "<table><tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody></table>";
  await second();

  // What copy writes.
  await set("ed2", '<p>a <strong>bold</strong> <a href="https://e.com">l</a></p>');
  await sel("ed2", "p", 0, "a", 1);
  const md = await copy();
  cb("copy writes html, plain text and, with the Markdown plugin, Markdown", md?.["text/html"] === '<p>a <strong>bold</strong> <a href="https://e.com">l</a></p>' && md?.["text/plain"] === "a bold l" && md?.["text/markdown"] === "a **bold** [l](https://e.com)", md);
  await set("ed", "<pre><code>if (x) {\n  y();\n}</code></pre>");
  await sel("ed", "pre", 0, "pre", 17);
  const code = await copy();
  cb("copy in a code block writes the code as it is", code?.["text/plain"] === "if (x) {\n  y();\n}" && code?.["text/html"] === "<pre>if (x) {\n  y();\n}</pre>", code);
  await set("ed", table);
  await sel("ed", "tr:nth-child(1) td:nth-child(1)", 0, "tr:nth-child(2) td:nth-child(2)", 2);
  const cells = await copy();
  cb("copy of a cell range writes a table and tab-separated rows", cells?.["text/plain"] === "a1\tb1\na2\tb2" && cells?.["text/html"] === table, cells);
  await set("ed", "<p>one</p><hr><p>two</p>");
  await sel("ed", "p:first-child", 0, "p:last-child", 3);
  const rule = await copy();
  cb("copy across a rule writes the rule", rule?.["text/html"] === "<p>one</p><hr><p>two</p>", rule);
  const cutRule = await copy("X");
  cb("cut across a rule takes the rule with it", cutRule?.["text/html"] === "<p>one</p><hr><p>two</p>" && (await html()) === "<p></p>", await html());

  // What paste reads, in each kind of place.
  await set("ed", "<pre><code>xy</code></pre>");
  await clip({ "text/html": "<p>a <b>b</b></p><p>c</p>", "text/plain": "  a b\n\nc" });
  await sel("ed", "pre", 1, "pre", 1);
  await paste();
  cb("paste into a code block inserts the plain text as it is", (await html()) === "<pre>x  a b\n\ncy</pre>", await html());
  await set("ed", "<pre><code>xy</code></pre>");
  await clip({ "text/plain": "a\tb\nc\td" });
  await sel("ed", "pre", 1, "pre", 1);
  await paste();
  cb("tab-separated text pasted into a code block stays text", (await html()) === "<pre>xa\tb\nc\tdy</pre>", await html());
  await set("ed", table);
  await clip({ "text/html": "<table><tr><td>X</td><td>Y</td><td>Z</td></tr></table>", "text/plain": "X\tY\tZ" });
  await sel("ed", "td", 0, "td", 0);
  await paste();
  cb("a table pasted into a cell fills the cells and grows the table", (await html()) === "<table><tbody><tr><td>X</td><td>Y</td><td>Z</td></tr><tr><td>a2</td><td>b2</td><td></td></tr></tbody></table>", await html());
  await set("ed", table);
  await clip({ "text/plain": "x\ty\nz\tw" });
  await sel("ed", "td", 0, "td", 0);
  await paste();
  cb("tab-separated text pasted into a cell fills the cells", (await html()) === "<table><tbody><tr><td>x</td><td>y</td></tr><tr><td>z</td><td>w</td></tr></tbody></table>", await html());
  await set("ed", table);
  await clip({ "text/html": "<table><tr><td>S</td></tr></table>", "text/plain": "S" });
  await sel("ed", "tr:nth-child(1) td:nth-child(1)", 0, "tr:nth-child(2) td:nth-child(2)", 2);
  await paste();
  cb("one copied cell pasted over a cell range fills every selected cell", (await html()) === "<table><tbody><tr><td>S</td><td>S</td></tr><tr><td>S</td><td>S</td></tr></tbody></table>", await html());
  await set("ed", "<p>x</p>");
  await sel("ed", "p", 1, "p", 1);
  await paste();
  cb("one copied cell pasted into text is text", (await html()) === "<p>xS</p>", await html());
  await set("ed", table);
  await clip({ "text/plain": "plain" });
  await sel("ed", "tr:nth-child(1) td:nth-child(1)", 0, "tr:nth-child(2) td:nth-child(2)", 2);
  await paste();
  cb("plain text pasted over a cell range goes in the first cell and empties the rest", (await html()) === "<table><tbody><tr><td>plain</td><td></td></tr><tr><td></td><td></td></tr></tbody></table>", await html());
  await set("ed", "<ul><li>ab</li></ul>");
  await clip({ "text/html": "<ul><li>x</li><li>y</li></ul>", "text/plain": "x\ny" });
  await sel("ed", "li", 1, "li", 1);
  await paste();
  cb("a list pasted into a list item joins the list", (await html()) === "<ul><li>ax</li><li>yb</li></ul>", await html());

  // The whole grid: each kind of clipboard content into each kind of place (Markdown in the second editor, which has the plugin).
  const places = {
    paragraph: ["<p>xy</p>", ["p", 1, "p", 1]],
    "code block": ["<pre><code>xy</code></pre>", ["pre", 1, "pre", 1]],
    cell: [table, ["td", 1, "td", 1]],
    "cell range": [table, ["tr:nth-child(1) td:nth-child(1)", 0, "tr:nth-child(2) td:nth-child(2)", 2]],
    "list item": ["<ul><li>xy</li></ul>", ["li", 1, "li", 1]],
  };
  const row = (a, b) => `<table><tbody><tr>${a}</tr><tr>${b}</tr></tbody></table>`;
  const grid = [
    ["html", { "text/html": "<p>a <b>b</b></p><p>c</p>", "text/plain": "a b\n\nc" }, ["<p>xa <strong>b</strong></p><p>cy</p>", "<pre>xa b\n\ncy</pre>", row("<td><p>aa <strong>b</strong></p><p>c1</p></td><td>b1</td>", "<td>a2</td><td>b2</td>"), row("<td><p>a <strong>b</strong></p><p>c</p></td><td></td>", "<td></td><td></td>"), "<ul><li>xa <strong>b</strong></li><li>cy</li></ul>"]],
    ["one cell", { "text/html": "<table><tr><td>S</td></tr></table>", "text/plain": "S" }, ["<p>xSy</p>", "<pre>xSy</pre>", row("<td>aS1</td><td>b1</td>", "<td>a2</td><td>b2</td>"), row("<td>S</td><td>S</td>", "<td>S</td><td>S</td>"), "<ul><li>xSy</li></ul>"]],
    ["plain text", { "text/plain": "one\n\ntwo" }, ["<p>xone</p><p>twoy</p>", "<pre>xone\n\ntwoy</pre>", row("<td><p>aone</p><p>two1</p></td><td>b1</td>", "<td>a2</td><td>b2</td>"), row("<td><p>one</p><p>two</p></td><td></td>", "<td></td><td></td>"), "<ul><li>xone</li><li>twoy</li></ul>"]],
    ["tab-separated text", { "text/plain": "x\ty\nz\tw" }, ["<p>xx\ty<br>z\twy</p>", "<pre>xx\ty\nz\twy</pre>", row("<td>x</td><td>y</td>", "<td>z</td><td>w</td>"), row("<td>x</td><td>y</td>", "<td>z</td><td>w</td>"), "<ul><li>xx\ty<br>z\twy</li></ul>"]],
    ["Markdown text", { "text/plain": "# T\n\n- i\n- j" }, ["<p>xT</p><ul><li>i</li><li>j</li></ul><p>y</p>", "<pre>x# T\n\n- i\n- jy</pre>", row("<td><p>aT</p><ul><li>i</li><li>j</li></ul><p>1</p></td><td>b1</td>", "<td>a2</td><td>b2</td>"), row("<td><h1>T</h1><ul><li>i</li><li>j</li></ul></td><td></td>", "<td></td><td></td>"), "<ul><li>xT</li><li>i</li><li>jy</li></ul>"]],
    ...(name === "firefox" ? [] : [["an image", { "image/png": onePixelPng().split(",")[1] }, ["<p>x<img>y</p>", "<pre>xy</pre>", row("<td>a<img>1</td><td>b1</td>", "<td>a2</td><td>b2</td>"), row("<td><img></td><td></td>", "<td></td><td></td>"), "<ul><li>x<img>y</li></ul>"]]]),
  ];
  for (const [what, data, expected] of grid) {
    const id = what === "Markdown text" ? "ed2" : "ed";
    for (const [i, [place, [start, selection]]] of Object.entries(places).entries()) {
      await clip(data);
      await set(id, start);
      await sel(id, ...selection);
      await paste();
      const got = (await html(id)).replace(/<img src="data:image\/png;base64,[^"]*">/g, "<img>");
      cb(`grid: ${what} pasted into a ${place}`, got === expected[i], got);
    }
  }

  // Markdown, with the plugin: read from plain text, but never in a code block.
  await set("ed2", "<p>x</p>");
  await clip({ "text/plain": "# Title\n\n- one\n- two" });
  await sel("ed2", "p", 1, "p", 1);
  await paste();
  cb("Markdown plain text pasted with the plugin becomes structure", (await html("ed2")) === "<p>xTitle</p><ul><li>one</li><li>two</li></ul>", await html("ed2"));
  await set("ed2", "<pre><code>xy</code></pre>");
  await sel("ed2", "pre", 1, "pre", 1);
  await paste();
  cb("Markdown plain text pasted into a code block stays text", (await html("ed2")) === "<pre>x# Title\n\n- one\n- twoy</pre>", await html("ed2"));

  // Between two editors on the page.
  const rich = '<h2>T</h2><p>a <strong>b</strong> <em>c</em> <a href="https://e.com/">l</a></p><ul><li>one<ul><li>nested</li></ul></li></ul><ol><li>n</li></ol><blockquote><p>q</p></blockquote><pre>code\n  x</pre>' + table + "<hr><p>tail</p>";
  await set("ed", rich);
  await page.evaluate(() => window.__editor.selectAll());
  await copy();
  await set("ed2", "");
  await paste();
  cb("everything copied in one editor pastes the same in another", (await html("ed2")) === (await html()), [await html(), await html("ed2")]);
  await set("ed", "<p>from <em>A</em> here</p>");
  await set("ed2", "<p>B:</p>");
  await sel("ed", "p", 0, "em", 1);
  await copy("X");
  await sel("ed2", "p", 2, "p", 2);
  await paste();
  cb("cut in one editor and paste in another moves the text", (await html()) === "<p>&nbsp;here</p>" && (await html("ed2")) === "<p>B:from <em>A</em></p>", [await html(), await html("ed2")]);
  await set("ed", "<p>alpha</p>");
  await set("ed2", "<p>beta</p>");
  await sel("ed", "p", 0, "p", 5);
  await drag("#ed2 p");
  cb("a drag from one editor to another copies", (await html()) === "<p>alpha</p>" && (await html("ed2")) === "<p>betaalpha</p>", [await html(), await html("ed2")]);
  await sel("ed2", "p", 0, "p", 4);
  await drag("#ed p");
  cb("and back", (await html()) === "<p>alphabeta</p>", [await html(), await html("ed2")]);

  // Dragging out to a place that takes no drop, and dropping in from outside.
  await set("ed", "<p>alpha</p><p>gamma</p>");
  await sel("ed", "p", 0, "p", 5);
  const outside = await page.evaluate(() => { const r = document.getElementById("ed2").getBoundingClientRect(); return { x: r.x + 10, y: r.bottom + 120 }; });
  await drag(outside);
  cb("a drag out to a place that takes no drop leaves the text", (await html()) === "<p>alpha</p><p>gamma</p>", await html());
  await page.evaluate(() => {
    const field = document.createElement("textarea");
    field.id = "field";
    field.style.cssText = "display:block;width:300px;height:60px;margin-top:16px";
    document.body.appendChild(field);
  });
  await sel("ed", "p", 0, "p", 5);
  const into = await page.evaluate(() => { const r = document.getElementById("field").getBoundingClientRect(); return { x: r.x + 20, y: r.y + 20 }; });
  await drag(into);
  cb("a drag out into a text field on the page moves the text", (await html()) === "<p></p><p>gamma</p>" && (await page.evaluate(() => document.getElementById("field").value)) === "alpha", [await html(), await page.evaluate(() => document.getElementById("field").value)]);
  await page.evaluate(() => document.getElementById("field").remove());
  await set("ed", "<p>alpha</p><p>gamma</p>");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", "<b>B</b>");
    dt.setData("text/plain", "B");
    const r = document.querySelector("#ed p:last-child").getBoundingClientRect();
    document.getElementById("ed").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 2, clientY: r.y + r.height / 2 }));
  });
  cb("markup dropped from outside goes in where it is dropped", (await html()) === "<p>alpha</p><p>gamma<strong>B</strong></p>", await html());
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "a.txt", { type: "text/plain" }));
    const r = document.querySelector("#ed p").getBoundingClientRect();
    document.getElementById("ed").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 2, clientY: r.y + r.height / 2 }));
  });
  await page.waitForTimeout(100);
  cb("a dropped file that is not an image is ignored", (await html()) === "<p>alpha</p><p>gamma<strong>B</strong></p>", await html());

  // An image on the clipboard, with no text beside it. Firefox, as Playwright runs it, hands the paste event an empty clipboard for an
  // image written this way, so there the file route is checked by the drop above and in the image checks.
  if (name !== "firefox") {
    await set("ed", "<p>x</p>");
    const wrote = await clip({ "image/png": onePixelPng().split(",")[1] });
    await sel("ed", "p", 1, "p", 1);
    await paste();
    await page.waitForTimeout(150);
    cb("an image on the clipboard pastes as an image", wrote === "ok" && (await html()).startsWith('<p>x<img src="data:image/png;base64,'), [wrote, (await html()).slice(0, 60)]);
  }

  // Read-only: copy works, cut writes and deletes nothing, paste is refused.
  await set("ed", "<p>keep</p>");
  await page.evaluate(() => window.__editor.setReadOnly(true));
  await sel("ed", "p", 0, "p", 4);
  const ro = await copy();
  const roCut = await copy("X");
  await clip({ "text/plain": "NO" });
  await sel("ed", "p", 0, "p", 4);
  await paste();
  cb("read-only: copy and cut write, nothing is deleted, paste is refused", ro?.["text/plain"] === "keep" && roCut?.["text/plain"] === "keep" && (await html()) === "<p>keep</p>", [ro, roCut, await html()]);
  await page.evaluate(() => window.__editor.setReadOnly(false));

  // Limits: past the input limit nothing is read (HTML falls back to the plain text), and past maxLength the paste is refused whole.
  await second({ content: { maxInputLength: 100 } });
  await set("ed2", "<p>x</p>");
  await clip({ "text/plain": "y".repeat(150) });
  await sel("ed2", "p", 1, "p", 1);
  await paste();
  cb("plain text past the input limit is refused and reported", (await html("ed2")) === "<p>x</p>" && (await page.evaluate(() => window.__warnings)).includes("content-too-long"), [await html("ed2"), await page.evaluate(() => window.__warnings)]);
  await page.evaluate(() => { window.__warnings.length = 0; });
  await clip({ "text/html": `<p>${"z".repeat(150)}</p>`, "text/plain": "short" });
  await sel("ed2", "p", 1, "p", 1);
  await paste();
  cb("markup past the input limit falls back to the plain text, and is reported", (await html("ed2")) === "<p>xshort</p>" && (await page.evaluate(() => window.__warnings)).includes("content-too-long"), [await html("ed2"), await page.evaluate(() => window.__warnings)]);
  await set("ed2", "<pre><code>x</code></pre>");
  await clip({ "text/plain": "y".repeat(150) });
  await sel("ed2", "pre", 1, "pre", 1);
  await paste();
  cb("plain text past the input limit is refused in a code block too", (await html("ed2")) === "<pre>x</pre>", await html("ed2"));
  await second({ maxLength: 10 });
  await set("ed2", "<p>x</p>");
  await clip({ "text/plain": "0123456789abc" });
  await sel("ed2", "p", 1, "p", 1);
  await paste();
  cb("a paste past maxLength is refused whole", (await html("ed2")) === "<p>x</p>", await html("ed2"));
  cb("no page errors", t.errors.length === 0, t.errors);
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
  check(`${name} (headless) exactly one control is a tab stop`, (await page.evaluate(() => [...document.querySelectorAll("[data-rte-item]")].filter((e) => e.tabIndex === 0).length)) === 1, "tab stops");
  check(`${name} (headless) icon-only buttons get a name`, (await q("#rte-bold"))?.label === "Bold", await q("#rte-bold"));
  check(`${name} (headless) a shortcut is announced`, (await q("#rte-bold"))?.keys === "Control+B", await q("#rte-bold"));
  await t.reset("<p>one two three</p>");
  await page.evaluate(() => window.__demo.editor.focus());
  await page.waitForTimeout(60);
  // Redo is unavailable until something has been undone.
  const off = await q("#rte-redo");
  check(`${name} (headless) an unavailable control is aria-disabled, not disabled, so it can still be found`, off?.ariaDisabled === "true" && off?.disabled === false, off);
  // Select "two", press Bold with the mouse: the editor keeps the focus and the selection, and the button shows it is on.
  await t.select({ start: "p", so: 4, eo: 7 });
  await page.waitForTimeout(60);
  await page.click("#rte-bold");
  await page.waitForTimeout(60);
  check(`${name} (headless) pressing Bold bolds the selection`, (await t.html()) === "<p>one <strong>two</strong> three</p>", await t.html());
  check(`${name} (headless) and the focus stays in the editor`, (await active()) === "ed", await active());
  check(`${name} (headless) and the button reports it is pressed`, (await q("#rte-bold"))?.pressed === "true", await q("#rte-bold"));
  // A native select for the block type.
  await page.selectOption("#rte-block", "2");
  await page.waitForTimeout(60);
  check(`${name} (headless) choosing Heading 2 in the select changes the block`, (await t.html()).startsWith("<h2>"), await t.html());
  check(`${name} (headless) and returns the focus to the editor`, (await active()) === "ed", await active());
  // Keyboard: Tab into the toolbar lands on its one tab stop, arrows move, Home and End jump, Escape goes back to the editor.
  await page.evaluate(() => document.getElementById("rte-undo").focus());
  await page.keyboard.press("ArrowRight");
  check(`${name} (headless) ArrowRight moves along the toolbar`, (await active()) === "rte-redo", await active());
  check(`${name} (headless) and moves the tab stop with it`, (await q("#rte-redo"))?.tabindex === 0 && (await q("#rte-undo"))?.tabindex === -1, [await q("#rte-redo"), await q("#rte-undo")]);
  await page.keyboard.press("End");
  const last = await page.evaluate(() => [...document.querySelectorAll("[data-rte-item]")].at(-1).id);
  check(`${name} (headless) End jumps to the last control`, (await active()) === last, [await active(), last]);
  await page.keyboard.press("ArrowRight");
  check(`${name} (headless) and the toolbar wraps round`, (await active()) === "rte-undo", await active());
  await page.keyboard.press("Escape");
  check(`${name} (headless) Escape returns to the editor`, (await active()) === "ed", await active());
  // A dialog item does not run a command by itself: it asks the page to open something.
  await page.evaluate(() => { window.__opened.length = 0; });
  await t.select({ start: "h2", so: 0, eo: 3 });
  await page.waitForTimeout(60);
  await page.click("#rte-link");
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
  await page.click("#rte-link");
  await page.waitForTimeout(60);
  check(`${name} (headless) a dialog opens, is modal, named, and takes the focus`, await page.evaluate(() => { const d = document.getElementById("dlg"); return d.open && d.getAttribute("aria-modal") === "true" && d.getAttribute("aria-labelledby") === "dlg-title" && document.activeElement.name === "href"; }), await active());
  await page.click("#dlg-ok");
  await page.waitForTimeout(60);
  const bad = await page.evaluate(() => { const i = document.querySelector("[name=href]"); const e = document.querySelector("[data-rte-error=href]"); return { invalid: i.getAttribute("aria-invalid"), by: i.getAttribute("aria-describedby") === e.id, text: e.textContent, focused: document.activeElement === i, open: document.getElementById("dlg").open }; });
  check(`${name} (headless) an empty required field is flagged, explained, focused, and the dialog stays open`, bad.invalid === "true" && bad.by && bad.text === "Address is required." && bad.focused && bad.open, bad);
  await page.waitForTimeout(120);
  check(`${name} (headless) and the problem is announced`, (await page.evaluate(() => document.querySelector("[role=status]").textContent)) === "Address is required.", "announce");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (headless) Escape cancels and focus returns to the control that opened it`, JSON.stringify(await page.evaluate(() => window.__closed)) === '["cancel"]' && (await active()) === "rte-link", [await page.evaluate(() => window.__closed), await active()]);
  await page.evaluate(() => { window.__closed.length = 0; });
  await page.click("#rte-link");
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

// --- the custom element <rte-editor> and <rte-toolbar>, in a real form
for (const [name, type] of engines) {
  const t = await open(type, {}, "", "element");
  const { page } = t;
  const val = (id) => page.evaluate((i) => document.getElementById(i).value, id);
  const form = () => page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("f"))));
  const events = () => page.evaluate(() => window.__events.splice(0).map((e) => e.join(":")));
  check(`${name} (element) both elements are defined and the editors are ready`, await page.evaluate(() => !!customElements.get("rte-editor") && !!customElements.get("rte-toolbar") && window.__events.filter((e) => e[0] === "rte-ready").length === 4), "defined");
  check(`${name} (element) the value attribute and the element's own children are the starting content`, (await val("body")) === "<p>Hello</p>" && (await val("second")) === "<p>from children</p>", [await val("body"), await val("second")]);
  check(`${name} (element) the editing surface is named from the label attribute`, await page.evaluate(() => document.querySelector("#body [data-rte-surface]").getAttribute("aria-label") === "Body"), "label");
  const f0 = await form();
  check(`${name} (element) the editors take part in the form`, f0.body === "<p>Hello</p>" && f0.second === "<p>from children</p>", f0);
  await events();
  await page.click("#body [data-rte-surface]");
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  // The page reports a moved caret as its own `selectionchange`, a task later.
  await page.waitForTimeout(80);
  const moved = await events();
  check(`${name} (element) gaining focus and moving the caret send rte-focus and rte-selection, and no rte-change`, moved.includes("rte-focus:body") && moved.some((e) => e.startsWith("rte-selection:body:ok")) && !moved.some((e) => e.startsWith("rte-change") || e.startsWith("input")), moved);
  await page.keyboard.type("!");
  const ev = await events();
  check(`${name} (element) typing sends rte-change and input, and updates the form`, ev.includes('rte-change:body:<p>Hello!</p>') && ev.includes("input:body") && (await form()).body === "<p>Hello!</p>", [ev, await form()]);
  check(`${name} (element) and the other editor is untouched`, (await val("second")) === "<p>from children</p>", await val("second"));
  await page.click("#second [data-rte-surface]");
  const left = await events();
  check(`${name} (element) leaving an editor whose value changed sends change`, left.includes("change:body"), "change");
  check(`${name} (element) and rte-blur for it, rte-focus for the other`, left.includes("rte-blur:body") && left.includes("rte-focus:second"), left);
  await page.click("#reset");
  await page.waitForTimeout(50);
  check(`${name} (element) a form reset puts the starting content back`, (await val("body")) === "<p>Hello</p>" && (await form()).body === "<p>Hello</p>", await val("body"));
  await events();
  await page.evaluate(() => { document.getElementById("body").value = "<p>Set</p>"; });
  const setQuiet = await events();
  check(`${name} (element) setting value sends no rte-change and no input, as a text field does not`, !setQuiet.some((e) => e.startsWith("rte-change") || e.startsWith("input")), setQuiet);
  check(`${name} (element) setting value replaces the document and the form value`, (await val("body")) === "<p>Set</p>" && (await form()).body === "<p>Set</p>", await form());
  await page.evaluate(() => document.getElementById("body").setAttribute("value", "<p>Attr</p>"));
  check(`${name} (element) changing the value attribute does too`, (await val("body")) === "<p>Attr</p>", await val("body"));
  await page.evaluate(() => document.getElementById("second").setAttribute("readonly", ""));
  check(`${name} (element) readonly makes the surface read-only, and removing it makes it editable again`, await page.evaluate(() => { const e = document.getElementById("second"); const a = e.editor.readOnly && e.querySelector("[data-rte-surface]").getAttribute("contenteditable") === "false"; e.removeAttribute("readonly"); return a && !e.editor.readOnly; }), "readonly");
  check(`${name} (element) a required editor that is empty is invalid, and valid once it has text`, await (async () => {
    const bad = await page.evaluate(() => document.getElementById("req").validity.valueMissing && !document.getElementById("f").checkValidity());
    await page.click("#req [data-rte-surface]");
    await page.keyboard.type("text");
    const good = await page.evaluate(() => !document.getElementById("req").validity.valueMissing);
    return bad && good;
  })(), "required");
  // The toolbar: built from the editor's items, behaving through the headless layer.
  check(`${name} (element) the toolbar draws a control for each item and names it`, await page.evaluate(() => { const b = document.querySelector("rte-toolbar"); const bold = b.querySelector('[data-rte-item="bold"]'); return b.getAttribute("role") === "toolbar" && bold && bold.textContent === "Bold" && b.querySelectorAll("[data-rte-item]").length > 10; }), "toolbar");
  await page.evaluate(() => { document.getElementById("body").value = "<p>one two</p>"; });
  await page.click("#body [data-rte-surface]");
  await page.evaluate(() => { const n = document.querySelector("#body [data-rte-surface] p").firstChild; document.getElementById("body").editor.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('rte-toolbar [data-rte-item="bold"]');
  await page.waitForTimeout(60);
  check(`${name} (element) pressing Bold in the toolbar bolds the selection in its editor`, (await val("body")) === "<p><strong>one</strong> two</p>", await val("body"));
  // Moving an element in the page keeps what it holds. Removing one cleans up.
  await page.evaluate(() => { const e = document.getElementById("body"); document.body.appendChild(e); });
  await page.waitForTimeout(50);
  check(`${name} (element) moving the element keeps its content and it still works`, (await val("body")) === "<p><strong>one</strong> two</p>" && (await page.evaluate(() => !!document.getElementById("body").editor)), await val("body"));
  await page.evaluate(() => document.getElementById("second").remove());
  // disabled: read-only, out of the tab order, not submitted; a disabled fieldset around it does the same.
  const disabledState = await page.evaluate(() => {
    const e = document.getElementById("limited");
    e.setAttribute("disabled", "");
    const s = e.querySelector("[data-rte-surface]");
    const out = { ce: s.getAttribute("contenteditable"), dis: s.getAttribute("aria-disabled"), tab: s.tabIndex, prop: e.disabled, submitted: new FormData(document.getElementById("f")).has("limited") };
    e.removeAttribute("disabled");
    out.back = { ce: s.getAttribute("contenteditable"), dis: s.getAttribute("aria-disabled"), prop: e.disabled, submitted: new FormData(document.getElementById("f")).has("limited") };
    return out;
  });
  check(`${name} (element) disabled makes the surface read-only and unfocusable, is not submitted, and removing it undoes all of that`, disabledState.ce === "false" && disabledState.dis === "true" && disabledState.tab === -1 && disabledState.prop === true && disabledState.submitted === false && disabledState.back.ce === "true" && disabledState.back.dis === null && disabledState.back.prop === false && disabledState.back.submitted === true, disabledState);
  const fieldset = await page.evaluate(async () => {
    const fs = document.createElement("fieldset");
    const el = document.createElement("rte-editor");
    el.setAttribute("label", "F"); el.setAttribute("name", "fs");
    fs.appendChild(el);
    document.getElementById("f").appendChild(fs);
    await el.whenReady();
    fs.disabled = true;
    await new Promise((r) => setTimeout(r, 20));
    const s = el.querySelector("[data-rte-surface]");
    const on = { ce: s.getAttribute("contenteditable"), dis: s.getAttribute("aria-disabled"), prop: el.disabled };
    fs.disabled = false;
    await new Promise((r) => setTimeout(r, 20));
    const off = { ce: s.getAttribute("contenteditable"), dis: s.getAttribute("aria-disabled"), prop: el.disabled };
    fs.remove();
    return { on, off };
  });
  check(`${name} (element) a disabled fieldset disables it, and enabling the fieldset undoes that`, fieldset.on.ce === "false" && fieldset.on.dis === "true" && fieldset.on.prop === true && fieldset.off.ce === "true" && fieldset.off.dis === null && fieldset.off.prop === false, fieldset);
  // Attributes: placeholder, maxlength, spellcheck.
  check(`${name} (element) placeholder and spellcheck attributes reach the editor`, await page.evaluate(() => { const s = document.querySelector("#limited [contenteditable=true]"); return s.getAttribute("aria-placeholder") === "Write something" && s.hasAttribute("data-rte-empty") && s.spellcheck === false; }), "attributes");
  await page.click("#limited [contenteditable=true]");
  await page.keyboard.type("0123456789abcdef");
  check(`${name} (element) maxlength stops typing at the limit`, (await val("limited")) === "<p>0123456789</p>", await val("limited"));
  // Errors and warnings (docs/ERRORS.md): one channel with codes; a listener that throws does not stop the editor.
  const told = await page.evaluate(async () => {
    const seen = [];
    const el = document.createElement("rte-editor");
    el.id = "warned";
    el.setAttribute("content", "paranoid");
    el.options = { onWarning: (w) => seen.push(w.code) };
    document.getElementById("f").appendChild(el);
    await el.whenReady();
    el.options = {};
    window.__ran = [];
    el.editor.on("change", () => { throw new Error("listener"); });
    el.editor.on("change", () => window.__ran.push("second"));
    window.__seen = seen;
    return seen.slice();
  });
  check(`${name} (element) warnings reach options.onWarning with their codes`, ["missing-label", "bad-option", "late-options"].every((c) => told.includes(c)), told);
  await page.click("#warned [contenteditable=true]");
  await page.keyboard.type("q");
  await page.waitForTimeout(40);
  check(`${name} (element) a change listener that throws is reported and the next one still runs`, await page.evaluate(() => window.__ran.includes("second") && window.__seen.includes("listener-failed") && document.getElementById("warned").value === "<p>q</p>"), await page.evaluate(() => [window.__ran, window.__seen]));
  await page.evaluate(() => document.getElementById("warned").remove());
  // content="strict|standard|loose" picks the content profile; a property adds single choices on top; a name that is not a profile is ignored with a warning.
  const profiled = (attr) => page.evaluate(async (a) => {
    const el = document.createElement("rte-editor");
    el.setAttribute("label", "P"); if (a) el.setAttribute("content", a);
    document.getElementById("f").appendChild(el);
    await el.whenReady();
    el.value = '<p><a href="tel:1">t</a><a href="ftp://x/f">f</a><span style="color:red">c</span></p>';
    const out = el.value; el.remove(); return out;
  }, attr);
  const links = (h) => (h.match(/<a /g) ?? []).length;
  const strictOut = await profiled("strict"); const standardOut = await profiled("standard"); const looseOut = await profiled("loose"); const noneOut = await profiled(null);
  check(`${name} (element) content="strict" drops tel links and colors, standard keeps tel, loose keeps ftp too`, links(strictOut) === 0 && !strictOut.includes("color") && links(standardOut) === 1 && standardOut.includes("color") && links(looseOut) === 2, [strictOut, standardOut, looseOut]);
  const layered = await page.evaluate(async () => {
    const el = document.createElement("rte-editor"); el.setAttribute("label", "P"); el.setAttribute("content", "strict");
    el.options = { content: { linkSchemes: ["tel"] } };
    document.getElementById("f").appendChild(el); await el.whenReady();
    el.value = '<p><a href="tel:1">t</a><a href="mailto:a@b.c">m</a><span style="color:red">c</span></p>';
    const out = el.value; el.remove(); return out;
  });
  check(`${name} (element) options.content lays single choices over the attribute's profile`, (layered.match(/<a /g) ?? []).length === 1 && layered.includes("tel:") && !layered.includes("color"), layered);
  check(`${name} (element) with no content attribute the standard profile applies`, noneOut === standardOut, noneOut);
  const warned = await page.evaluate(async () => { const seen = []; const w = console.warn; console.warn = (m) => seen.push(String(m)); const el = document.createElement("rte-editor"); el.setAttribute("label", "P"); el.setAttribute("content", "paranoid"); document.getElementById("f").appendChild(el); await el.whenReady(); console.warn = w; el.remove(); return seen; });
  check(`${name} (element) a content value that is not a profile is warned about and ignored`, warned.some((m) => m.includes("not a content profile")), warned);
  await page.evaluate(() => document.getElementById("limited").setAttribute("placeholder", "Changed"));
  check(`${name} (element) changing the placeholder attribute takes effect`, await page.evaluate(() => document.querySelector("#limited [contenteditable=true]").getAttribute("aria-placeholder") === "Changed"), "changed");
  check(`${name} (element) removing an element leaves no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- the support window (docs/SUPPORT.md): every engine here has what the editor needs, and a browser without it is told so
for (const [name, type] of engines) {
  const t = await open(type);
  const missing = await t.page.evaluate(async () => (await import("/dist/dom/index.js")).missingFeatures());
  check(`${name} support: missingFeatures() finds nothing missing`, Array.isArray(missing) && missing.length === 0, missing);
  const told = await t.page.evaluate(async () => {
    const { Editor } = await import("/dist/dom/index.js");
    const seen = [];
    const kept = InputEvent.prototype.getTargetRanges;
    delete InputEvent.prototype.getTargetRanges;
    const element = document.createElement("div");
    document.body.appendChild(element);
    let started = false;
    try {
      const editor = new Editor({ element, html: "<p>old</p>", onWarning: (w) => seen.push(w) });
      started = editor.getHtml() === "<p>old</p>";
      editor.destroy();
    } finally {
      InputEvent.prototype.getTargetRanges = kept;
      element.remove();
    }
    return { started, codes: seen.map((w) => w.code), message: seen.find((w) => w.code === "unsupported-browser")?.message ?? "" };
  });
  check(`${name} support: an editor in a browser without beforeinput target ranges reports unsupported-browser, names it, and still starts`, told.started && told.codes.join() === "unsupported-browser" && told.message.includes("getTargetRanges"), told);
  check(`${name} support: no page errors`, t.errors.length === 0, t.errors);
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
  check(`${name} (ui) the root, toolbar and content are parts, and every control is a part`, await page.evaluate(() => { const r = document.getElementById("root"); return r.classList.contains("rte-root") && r.getAttribute("data-rte-part") === "root" && !!r.querySelector('[data-rte-part=toolbar]') && !!r.querySelector('[data-rte-part=content]') && [...r.querySelectorAll("[data-rte-item]")].every((e) => e.hasAttribute("data-rte-part")); }), "parts");
  check(`${name} (ui) groups of controls are separated`, (await page.evaluate(() => document.querySelectorAll('#root [data-rte-part=separator]').length)) >= 4, "separators");
  check(`${name} (ui) every button has an icon, a name and a tooltip with its key`, await page.evaluate(() => [...document.querySelectorAll('#root button[data-rte-item]')].every((b) => b.querySelector('[data-rte-part=icon] svg') && b.getAttribute("aria-label") && b.getAttribute("data-rte-tip")) && document.querySelector('#root [data-rte-item=bold]').getAttribute("data-rte-tip") === "Bold (Ctrl+B)"), "icons");
  check(`${name} (ui) the block-type select is named`, (await page.evaluate(() => document.querySelector("#root select[data-rte-item=block]").getAttribute("aria-label"))) === "Block type", "select");
  // Themes: two editors in two themes on one page, and a switch at run time.
  check(`${name} (ui) light and dark themes color their own editor`, (await rootBg("root")) === "rgb(255, 255, 255)" && (await rootBg("second")) === "rgb(16, 21, 29)", [await rootBg("root"), await rootBg("second")]);
  await setStyle("__one", { theme: "dark" });
  check(`${name} (ui) the default icons survive a theme switch`, await page.evaluate(() => [...document.querySelectorAll('#root button[data-rte-item]')].every((b) => b.querySelector("svg"))), "icons after switch");
  check(`${name} (ui) switching theme at run time changes the look without rebuilding`, (await rootBg("root")) === "rgb(16, 21, 29)", await rootBg("root"));
  await setStyle("__one", { theme: "high-contrast" });
  check(`${name} (ui) the high-contrast theme is black and white`, (await rootBg("root")) === "rgb(0, 0, 0)" && (await css("#root [data-rte-part=content]", "color")) === "rgb(255, 255, 255)", await rootBg("root"));
  await setStyle("__one", { theme: "auto" });
  await page.emulateMedia({ colorScheme: "dark" });
  check(`${name} (ui) the auto theme follows the system's dark setting`, (await rootBg("root")) === "rgb(16, 21, 29)", await rootBg("root"));
  await setStyle("__one", { theme: "auto", scheme: "light" });
  check(`${name} (ui) and a chosen scheme beats the system`, (await rootBg("root")) === "rgb(255, 255, 255)", await rootBg("root"));
  await page.emulateMedia({ colorScheme: "light" });
  await setStyle("__one", { theme: "light" });
  // Tokens, density, classes, messages, icons.
  await setStyle("__one", { theme: "light", tokens: { "--rte-bg": "#ffeedd" } });
  check(`${name} (ui) a token beats the preset`, (await rootBg("root")) === "rgb(255, 238, 221)", await rootBg("root"));
  await setStyle("__one", { theme: "light" });
  check(`${name} (ui) and takes itself off again when it is no longer asked for`, (await rootBg("root")) === "rgb(255, 255, 255)", await rootBg("root"));
  const size = async (d) => { await setStyle("__one", { theme: "light", ...(d ? { density: d } : {}) }); return css("#root [data-rte-item=bold]", "height"); };
  check(`${name} (ui) density changes control size: compact 28px, default 32px, comfortable 40px`, [await size("compact"), await size(undefined), await size("comfortable")].join() === "28px,32px,40px", "density");
  await setStyle("__one", { theme: "light", classes: { button: "u-btn u-big", content: "u-body" } });
  check(`${name} (ui) extra classes land on every element of a part`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=button]")].every((b) => b.classList.contains("u-btn") && b.classList.contains("u-big")) && document.querySelector("#root [data-rte-part=content]").classList.contains("u-body")), "classes");
  await setStyle("__one", { theme: "light" });
  check(`${name} (ui) and are taken away again`, await page.evaluate(() => !document.querySelector("#root .u-btn, #root .u-body")), "classes gone");
  await setStyle("__one", { theme: "light", messages: { "item.bold": "Gras" } });
  check(`${name} (ui) messages rename an item for assistive technology and the tooltip`, await page.evaluate(() => { const b = document.querySelector("#root [data-rte-item=bold]"); return b.getAttribute("aria-label") === "Gras" && b.getAttribute("data-rte-tip").startsWith("Gras"); }), "messages");
  await setStyle("__one", { theme: "light", icons: { bold: '<svg viewBox="0 0 24 24" id="custom-bold"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>', italic: '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>' } });
  check(`${name} (ui) a given icon replaces the default`, await page.evaluate(() => !!document.querySelector("#root [data-rte-item=bold] svg#custom-bold")), "custom icon");
  check(`${name} (ui) and an icon that is not plain svg is refused, leaving the words`, await page.evaluate(() => { const b = document.querySelector("#root [data-rte-item=italic]"); return !b.querySelector("svg") && b.textContent === "Italic"; }), "unsafe icon");
  await setStyle("__one", { theme: "light" });
  // Non-color cues, focus, forced colors, reduced motion.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="bold"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) a pressed button has a thicker bottom edge, not only a different color`, (await css('#root [data-rte-item="bold"]', "borderBottomWidth")) === "3px" && (await css('#root [data-rte-item="italic"]', "borderBottomWidth")) === "1px", [await css('#root [data-rte-item="bold"]', "borderBottomWidth"), await css('#root [data-rte-item="italic"]', "borderBottomWidth")]);
  await page.evaluate(() => document.querySelector('#root [data-rte-item="bold"]').focus());
  await page.keyboard.press("ArrowRight");
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor }; });
  check(`${name} (ui) keyboard focus draws a 2px solid ring in the focus color`, ring.style === "solid" && ring.width === "2px" && ring.color === "rgb(23, 64, 139)", ring);
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await page.evaluate(() => { const b = document.querySelector('#root [data-rte-item="bold"]'); const c = getComputedStyle(b); return { bottom: c.borderBottomWidth, style: c.borderBottomStyle }; });
  check(`${name} (ui) in forced colors a pressed button keeps a real border, thicker still`, forced.bottom === "4px" && forced.style === "solid", forced);
  await page.emulateMedia({ forcedColors: "none" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(`${name} (ui) reduced motion turns the button transitions off`, (await css('#root [data-rte-item="italic"]', "transitionDuration")) === "0s", await css('#root [data-rte-item="italic"]', "transitionDuration"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Announcements and the link dialog.
  check(`${name} (ui) pressing a toggle announces it`, await page.evaluate(() => new Promise((resolve) => setTimeout(() => resolve(document.querySelector("#root [role=status]").textContent === "Bold on"), 150))), "announce");
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 4, n, 7); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the link dialog opens with its title, a labelled field, and focus in the field`, await page.evaluate(() => { const d = document.querySelector("#root [data-rte-part=dialog]:not([data-rte-shortcuts])"); const f = d.querySelector("[data-rte-part=field]"); return d.open && d.querySelector("[data-rte-part=dialog-title]").textContent === "Link" && f.labels[0].textContent === "Address" && document.activeElement === f; }), await active());
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) an unsafe address is refused with a message tied to the field`, await page.evaluate(() => { const f = document.querySelector("#root [data-rte-part=field]"); const e = document.querySelector("#root [data-rte-part=field-error]"); return f.getAttribute("aria-invalid") === "true" && f.getAttribute("aria-describedby") === e.id && e.textContent.length > 0 && document.querySelector("#root [data-rte-part=dialog]:not([data-rte-shortcuts])").open; }), "unsafe");
  await page.fill("#root [data-rte-part=field]", "https://x.test");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) a good address closes the dialog and links the selected text`, (await page.evaluate(() => window.__one.editor.getHtml())) === '<p>one <a href="https://x.test">two</a> three</p>' && !(await page.evaluate(() => document.querySelector("#root [data-rte-part=dialog]:not([data-rte-shortcuts])").open)), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) focus goes back to the control that opened it`, (await active()) === "rte-link" || (await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"))) === "link", await active());
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rte-part=content] a").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) opened on an existing link, the dialog shows its address`, (await page.evaluate(() => document.querySelector("#root [data-rte-part=field]").value)) === "https://x.test", await page.evaluate(() => document.querySelector("#root [data-rte-part=field]").value));
  check(`${name} (ui) and the new-tab box is unticked for a link that opens in the same tab`, (await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rte-part=dialog]:not([data-rte-shortcuts])")].find((x) => x.open); const box = d.querySelector('input[name=newTab]'); return box.type === "checkbox" && box.checked === false && box.labels[0].textContent === "Open in a new tab"; })), "checkbox");
  await page.click('#root dialog[open] input[name=newTab]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) ticking it and submitting makes the link open in a new tab`, (await page.evaluate(() => window.__one.editor.getHtml())).includes('<a href="https://x.test" target="_blank" rel="noopener noreferrer">two</a>'), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) reopened, the box is ticked`, await page.evaluate(() => [...document.querySelectorAll("#root dialog")].find((x) => x.open).querySelector("input[name=newTab]").checked), "ticked");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  // Special characters and the shortcuts list.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>price 5</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 7, n, 7); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="symbols"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the special characters menu lists each symbol with its name`, await page.evaluate(() => { const e = document.querySelector('#root [data-rte-menu-item="symbol-euro"]'); return !!e && e.textContent.includes("€") && e.textContent.includes("Euro"); }), "menu");
  await page.click('#root [data-rte-menu-item="symbol-euro"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing one types it at the caret`, await page.evaluate(() => window.__one.editor.getHtml() === "<p>price 5€</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="shortcuts"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the shortcuts dialog lists the editor's keys from its key map`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); const rows = d && [...d.querySelectorAll("tbody tr")].map((r) => r.textContent); return !!d && d.querySelector("[data-rte-part=dialog-title]").textContent === "Keyboard shortcuts" && rows.some((r) => r.startsWith("Bold") && r.includes("Ctrl+B")) && rows.some((r) => r.startsWith("Find and replace")) && d.querySelector("th").scope === "col"; }), "dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  check(`${name} (ui) Escape closes it and focus goes back to its button`, await page.evaluate(() => ![...document.querySelectorAll("#root dialog")].some((x) => x.open) && document.activeElement === document.querySelector('#root [data-rte-item="shortcuts"]')), await active());
  // Indent.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>indent me</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 2, n, 2); });
  await page.waitForTimeout(60);
  check(`${name} (ui) outdent is off until something is indented`, (await page.getAttribute('#root [data-rte-item="outdent"]', "aria-disabled")) === "true", "outdent");
  await page.click('#root [data-rte-item="indent"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the indent button moves the paragraph in by a step and draws it so`, await page.evaluate(() => window.__one.editor.getHtml() === '<p style="margin-left: 2em;">indent me</p>' && document.querySelector("#root [data-rte-part=content] p").style.marginLeft === "2em"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="outdent"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) and outdent takes it back`, await page.evaluate(() => window.__one.editor.getHtml() === "<p>indent me</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  // Text direction.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>مرحبا</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="direction-rtl"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the right-to-left button sets the paragraph's direction and shows as on`, await page.evaluate(() => window.__one.editor.getHtml() === '<p dir="rtl">مرحبا</p>' && document.querySelector("#root [data-rte-part=content] p").dir === "rtl" && document.querySelector('#root [data-rte-item="direction-rtl"]').getAttribute("aria-pressed") === "true" && document.querySelector('#root [data-rte-item="direction-ltr"]').getAttribute("aria-pressed") === "false"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="direction-rtl"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) pressing it again does not toggle it off (it sets it); left to right sets that`, await page.evaluate(() => window.__one.editor.getHtml() === '<p dir="rtl">مرحبا</p>'), await page.evaluate(() => window.__one.editor.getHtml()));
  // The HTML source view.
  const src = '#root [data-rte-part="source"]';
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<h2>Title</h2><p>Some <strong>bold</strong> text</p>"); e.focus(); });
  await page.waitForTimeout(60);
  check(`${name} (ui) the source button is named and starts off`, await page.evaluate(() => { const b = document.querySelector('#root [data-rte-item="source"]'); return b.getAttribute("aria-label") === "HTML source" && !!b.querySelector("svg") && document.querySelector('#root [data-rte-part="source"]').hidden; }), "button");
  await page.click('#root [data-rte-item="source"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) it shows the HTML, a block to a line, in place of the writing area`, await page.evaluate((q) => { const a = document.querySelector(q); return !a.hidden && a.value === "<h2>Title</h2>\n<p>Some <strong>bold</strong> text</p>" && getComputedStyle(document.getElementById("root").querySelector("[data-rte-part=content] > :first-child")).display === "none" && document.activeElement === a && document.querySelector('#root [data-rte-item="source"]').getAttribute("aria-pressed") === "true"; }, src), await page.evaluate((q) => document.querySelector(q).value, src));
  await page.click('#root [data-rte-item="bold"]', { force: true }).catch(() => undefined);
  check(`${name} (ui) the other buttons do nothing while it is open`, await page.evaluate(() => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>"), "guard");
  await page.fill(src, "<h1>New</h1>\n<p>parsed <em>again</em></p>");
  await page.click('#root [data-rte-item="source"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) closing it applies the HTML and returns to the editor`, await page.evaluate((q) => window.__one.editor.getHtml() === "<h1>New</h1><p>parsed <em>again</em></p>" && document.querySelector(q).hidden && document.querySelector("#root [data-rte-part=content]").contains(document.activeElement), src), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} (ui) and it is one undo step`, await page.evaluate(() => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="source"]');
  await page.waitForTimeout(60);
  await page.fill(src, "<p>discard me</p>");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (ui) Escape closes it and throws the changes away`, await page.evaluate((q) => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>" && document.querySelector(q).hidden, src), await page.evaluate(() => window.__one.editor.getHtml()));
  // Find and replace.
  const bar = '#root [data-rte-part="findbar"]';
  const barText = () => page.evaluate((b) => ({ hidden: document.querySelector(b).hidden, count: document.querySelector(b + " [data-rte-part=find-count]").textContent, active: document.activeElement?.name ?? document.activeElement?.tagName }), bar);
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three Two</p>"); e.focus(); });
  await page.waitForTimeout(80);
  check(`${name} (ui) the find bar starts hidden`, (await barText()).hidden === true, await barText());
  await page.keyboard.press("ControlOrMeta+f");
  await page.waitForTimeout(100);
  check(`${name} (ui) the find key opens it with focus in the search box`, (await barText()).hidden === false && (await barText()).active === "find", await barText());
  await page.keyboard.type("two");
  await page.waitForTimeout(80);
  check(`${name} (ui) typing a search counts the matches, ignoring case`, (await barText()).count === "2 matches", await barText());
  const hasHighlights = await page.evaluate(() => !!(globalThis.CSS && CSS.highlights));
  if (hasHighlights) check(`${name} (ui) matches are painted with the highlight registry`, await page.evaluate(() => CSS.highlights.has("rte-find") && [...CSS.highlights.get("rte-find")].length + ([...(CSS.highlights.get("rte-find-current") ?? [])].length) === 2), "highlights");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) Enter goes to the first match, selects it and says which`, (await barText()).count === "1 of 2" && (await page.evaluate(() => { const s = window.__one.editor.selection; return s.anchor.offset === 4 && s.focus.offset === 7; })), await barText());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) and on to the next`, (await barText()).count === "2 of 2", await barText());
  await page.keyboard.press("Shift+Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) Shift+Enter goes back`, (await barText()).count === "1 of 2", await barText());
  await page.click('#root [data-rte-part=findbar] button[aria-label="Match case"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) match case narrows it to one`, (await barText()).count === "1 matches" || (await barText()).count.startsWith("1 "), await barText());
  await page.click('#root [data-rte-part=findbar] button[aria-label="Match case"]');
  await page.fill('#root [data-rte-part=findbar] input[name=replace]', "2");
  await page.click('#root [data-rte-part=findbar] [data-rte-part=action]:nth-of-type(2)');
  await page.waitForTimeout(100);
  check(`${name} (ui) Replace all puts the text in place of every match`, (await page.evaluate(() => window.__one.editor.getHtml())) === "<p>one 2 three 2</p>", await page.evaluate(() => window.__one.editor.getHtml()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  check(`${name} (ui) Escape closes the bar and returns to the editor`, (await barText()).hidden === true && (await page.evaluate(() => document.querySelector("#root [data-rte-part=content]").contains(document.activeElement))), await barText());
  if (hasHighlights) check(`${name} (ui) and the highlights are gone`, await page.evaluate(() => !CSS.highlights.has("rte-find")), "cleared");
  await page.click('#root [data-rte-item="find"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the toolbar button opens it too, and shows as on`, (await barText()).hidden === false && (await page.getAttribute('#root [data-rte-item="find"]', "aria-pressed")) === "true", await barText());
  await page.click('#root [data-rte-item="find"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) and closes it again`, (await barText()).hidden === true, await barText());
  // The status line.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p><p>four</p>"); e.focus(); });
  await page.waitForTimeout(300);
  const statusText = () => page.evaluate(() => document.querySelector("#root [data-rte-part=status]")?.textContent ?? null);
  check(`${name} (ui) the status line counts words and characters`, (await statusText()) === "4 words · 17 characters", await statusText());
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 0, n, 7); });
  await page.waitForTimeout(300);
  check(`${name} (ui) and counts the selection against the whole`, (await statusText()) === "2 of 4 words", await statusText());
  await page.evaluate(() => window.__one.editor.setHtml("<p>solo</p>"));
  await page.waitForTimeout(300);
  check(`${name} (ui) one word is singular`, (await statusText()) === "1 word · 4 characters", await statusText());
  // Tooltips: shown on hover after a pause and at once on keyboard focus; dismissed with Escape; the pointer may move onto them.
  const tip = '#root [data-rte-part="tooltip"]';
  const tipText = () => page.evaluate((t) => { const e = document.querySelector(t); return e.hidden ? null : e.textContent; }, tip);
  // Start from rest: the pointer away from the toolbar, and the focus in the editor.
  await page.mouse.move(5, 400);
  await page.evaluate(() => window.__one.editor.focus());
  await page.waitForTimeout(400);
  check(`${name} (ui) tooltips are a role, hidden until needed, and the controls no longer carry a title`, await page.evaluate((t) => document.querySelector(t).getAttribute("role") === "tooltip" && document.querySelector(t).hidden && ![...document.querySelectorAll("#root [data-rte-item]")].some((e) => e.hasAttribute("title")), tip), "role");
  await page.hover('#root [data-rte-item="italic"]');
  await page.waitForTimeout(150);
  check(`${name} (ui) hovering does not show the tip at once`, (await tipText()) === null, await tipText());
  await page.waitForTimeout(600);
  check(`${name} (ui) it shows after a pause, with the name and the key`, (await tipText()) === "Italic (Ctrl+I)", await tipText());
  check(`${name} (ui) and sits below its control, inside the editor`, await page.evaluate((t) => { const p = document.querySelector(t).getBoundingClientRect(); const c = document.querySelector('#root [data-rte-item="italic"]').getBoundingClientRect(); const r = document.getElementById("root").getBoundingClientRect(); return p.top >= c.bottom && p.left >= r.left && p.right <= r.right + 1; }, tip), "placement");
  await page.mouse.move(5, 300);
  await page.waitForTimeout(400);
  check(`${name} (ui) it goes when the pointer leaves`, (await tipText()) === null, await tipText());
  await page.hover('#root [data-rte-item="italic"]');
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  check(`${name} (ui) Escape puts the tip away without moving the focus or the pointer`, (await tipText()) === null, await tipText());
  await page.evaluate(() => document.querySelector('#root [data-rte-item="bold"]').focus());
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
  check(`${name} (ui) keyboard focus shows the tip at once`, (await tipText()) === "Italic (Ctrl+I)", await tipText());
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
  check(`${name} (ui) and it follows the focus`, (await tipText()) === "Underline (Ctrl+U)", await tipText());
  await page.evaluate(() => window.__one.editor.focus());
  await page.waitForTimeout(60);
  check(`${name} (ui) and goes when the focus leaves the toolbar`, (await tipText()) === null, await tipText());
  // The table menu: a button that opens a list of commands.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>text</p>"); e.focus(); });
  await page.waitForTimeout(60);
  const menu = '#root [data-rte-item="table"] + [data-rte-part="menu"]';
  const trigger = '#root [data-rte-item="table"]';
  check(`${name} (ui) the menu button is named, announces a menu, and starts closed`, await page.evaluate(([t, m]) => { const b = document.querySelector(t); return b.getAttribute("aria-haspopup") === "menu" && b.getAttribute("aria-expanded") === "false" && b.getAttribute("aria-label") === "Table" && document.querySelector(m).hidden; }, [trigger, menu]), "closed");
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) clicking it opens the menu and focus goes to the first entry`, await page.evaluate(([t, m]) => document.querySelector(t).getAttribute("aria-expanded") === "true" && !document.querySelector(m).hidden && document.activeElement.getAttribute("data-rte-menu-item") === "table-insert", [trigger, menu]), await page.evaluate(() => document.activeElement.outerHTML.slice(0, 160)));
  check(`${name} (ui) entries outside a table say they are unavailable but can still be reached`, await page.evaluate(() => { const e = document.querySelector('#root [data-rte-menu-item="table-row-after"]'); return e.getAttribute("aria-disabled") === "true" && e.tabIndex !== undefined && e.getAttribute("role") === "menuitem"; }), "disabled entries");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (ui) Escape closes the menu and focus returns to its button`, await page.evaluate(([t, m]) => document.querySelector(m).hidden && document.activeElement === document.querySelector(t), [trigger, menu]), await active());
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(60);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing "Insert table" from the keyboard inserts a table and returns to the editor`, await page.evaluate(() => window.__one.editor.getHtml().includes("<table>") && document.querySelector("#root [data-rte-part=content]").contains(document.activeElement)), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) inside a table the row entries are available and "Header row" is a checkbox entry`, await page.evaluate(() => { const row = document.querySelector('#root [data-rte-menu-item="table-row-after"]'); const head = document.querySelector('#root [data-rte-menu-item="table-header"]'); return row.getAttribute("aria-disabled") === "false" && head.getAttribute("role") === "menuitemcheckbox" && head.getAttribute("aria-checked") === "false"; }), "enabled entries");
  await page.click('#root [data-rte-menu-item="table-header"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing it turns the header row on, closes the menu and announces it`, await page.evaluate(() => window.__one.editor.getHtml().includes('<th scope="col">') && document.querySelector('#root [data-rte-item="table"] + [data-rte-part="menu"]').hidden && document.querySelector("#root [role=status]").textContent === "Header row on"), await page.evaluate(() => document.querySelector("#root [role=status]").textContent));
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) and now shows it as checked, with a visible check mark`, await page.evaluate(() => { const head = document.querySelector('#root [data-rte-menu-item="table-header"]'); return head.getAttribute("aria-checked") === "true" && getComputedStyle(head, "::before").content.includes("\u2713"); }), "checked");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(60);
  check(`${name} (ui) a click elsewhere closes the menu`, await page.evaluate((m) => document.querySelector(m).hidden, menu), "outside click");
  // Block buttons and the color menus.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="quote"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the quote button wraps the paragraph and shows as on`, await page.evaluate(() => window.__one.editor.getHtml() === "<blockquote><p>one two three</p></blockquote>" && document.querySelector('#root [data-rte-item="quote"]').getAttribute("aria-pressed") === "true"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="quote"]');
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="code-block"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the code block button makes a code block`, await page.evaluate(() => window.__one.editor.getHtml() === "<pre>one two three</pre>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="code-block"]');
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="text-color"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the color menu shows named swatches`, await page.evaluate(() => { const e = document.querySelector('#root [data-rte-menu-item="text-color-red"]'); const sw = e.querySelector("[data-rte-part=swatch]"); return e.textContent.includes("Red") && getComputedStyle(sw).backgroundColor === "rgb(198, 40, 40)" && e.getAttribute("role") === "menuitemcheckbox"; }), "swatch");
  await page.click('#root [data-rte-menu-item="text-color-red"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a color colors the selected text`, await page.evaluate(() => window.__one.editor.getHtml().includes('<span style="color: #c62828;">one</span>')), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="text-color"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) and that color shows as the chosen one`, await page.evaluate(() => document.querySelector('#root [data-rte-menu-item="text-color-red"]').getAttribute("aria-checked") === "true" && document.querySelector('#root [data-rte-menu-item="text-color-blue"]').getAttribute("aria-checked") === "false"), "checked");
  await page.click('#root [data-rte-menu-item="text-color-none"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) Automatic takes the color away`, await page.evaluate(() => !window.__one.editor.getHtml().includes("color")), await page.evaluate(() => window.__one.editor.getHtml()));
  // The image dialog: an address and a description; a bad address is refused with a message, a good one inserts the image without loading it.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 3, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="image"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the image dialog has an address field and a description field, and focus is in the first`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rte-part=dialog]")].find((x) => x.open); const f = d && [...d.querySelectorAll("[data-rte-part=field]")]; return !!d && f.length === 2 && d.querySelector("[data-rte-part=dialog-title]").textContent === "Image" && document.activeElement === f[0]; }), await active());
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) a script address is not accepted`, await page.evaluate(() => !window.__one.editor.getHtml().includes("<img")), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("https://example.test/cat.png");
  await page.keyboard.press("Tab");
  await page.keyboard.type("A cat");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) a good address inserts the image with its description`, await page.evaluate(() => window.__one.editor.getHtml() === '<p>one<img src="https://example.test/cat.png" alt="A cat"> two</p>'), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) and nothing was fetched: the image is held back until the host allows it`, t.outside.length === 0 && (await page.evaluate(() => document.querySelectorAll("#root img[data-rte-remote-src]").length)) === 1 && (await page.evaluate(() => document.querySelectorAll("#root img[src]").length)) === 0, t.outside);
  // Image properties and resizing: a click selects the image and shows a handle; dragging it sets the width; the dialog edits the description and size.
  const pixel = onePixelPng();
  await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p>one<img src="${src}" alt="dot" width="100"> two</p>`); e.focus(); }, pixel);
  await page.waitForTimeout(80);
  check(`${name} (ui) no handle before an image is selected`, (await page.locator("[data-rte-resize-handle]").count()) === 0);
  const imgBox = await page.locator("#root [data-rte-part=content] img").boundingBox();
  await page.mouse.click(imgBox.x + imgBox.width / 2, imgBox.y + imgBox.height / 2);
  await page.waitForTimeout(80);
  check(`${name} (ui) a click selects the image and marks it`, await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 1), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) the marker is not part of the document`, await page.evaluate(() => !window.__one.editor.getHtml().includes("data-rte")));
  check(`${name} (ui) a resize handle shows on its corner`, (await page.locator("[data-rte-resize-handle]").count()) === 1);
  const handle = await page.locator("[data-rte-resize-handle]").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 + 10, { steps: 4 });
  check(`${name} (ui) a guide shows while dragging, and the document is unchanged until release`, (await page.locator("[data-rte-resize-line]").count()) === 1 && (await page.evaluate(() => window.__one.editor.getHtml())).includes('width="100"'));
  await page.mouse.up();
  await page.waitForTimeout(80);
  check(`${name} (ui) releasing sets the new width (one undo step)`, await page.evaluate(() => /<img [^>]*width="16\d"/.test(window.__one.editor.getHtml()) && !window.__one.editor.getHtml().includes("height=")), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) the guide is gone`, (await page.locator("[data-rte-resize-line]").count()) === 0);
  await page.evaluate(() => window.__one.editor.undo());
  await page.waitForTimeout(60);
  check(`${name} (ui) undo restores the old width`, await page.evaluate(() => window.__one.editor.getHtml().includes('width="100"')), await page.evaluate(() => window.__one.editor.getHtml()));
  // Read-only and disabled: a click on the image selects nothing and shows no handle, and the properties command is not offered.
  for (const state of ["readonly", "disabled"]) {
    await page.evaluate((st) => { const e = window.__one.editor; e.setReadOnly(false); e.setDisabled(false); st === "readonly" ? e.setReadOnly(true) : e.setDisabled(true); }, state);
    const before = await page.evaluate(() => window.__one.editor.getHtml());
    const box = await page.locator("#root [data-rte-part=content] img").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(80);
    check(`${name} (ui) ${state}: a click on an image selects nothing and shows no resize handle`, (await page.locator("[data-rte-resize-handle]").count()) === 0 && (await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length)) === 0, state);
    check(`${name} (ui) ${state}: the image properties command is not enabled, and running it changes nothing`, await page.evaluate(() => { const c = window.__one.editor.commands; const ran = c.run("image.update", { width: 7 }); return !c.state("image.update").enabled && ran === false; }) && (await page.evaluate(() => window.__one.editor.getHtml())) === before, state);
  }
  await page.evaluate(() => { const e = window.__one.editor; e.setReadOnly(false); e.setDisabled(false); e.focus(); });
  await page.click('#root [data-rte-item="image-properties"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the properties dialog starts with the image's values`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rte-part=dialog]")].find((x) => x.open); const f = d && [...d.querySelectorAll("[data-rte-part=field]")]; return !!d && f.length === 5 && f[0].value === "dot" && f[1].value === "100" && f[2].value === "" && f[3].value === "" && f[4].value === ""; }));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("A dot");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("40");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) the dialog sets the description and width`, await page.evaluate(() => /<img [^>]*alt="A dot"[^>]*width="40"/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));
  // The keyboard: Shift+Right from just before an image selects it; moving on with the arrow alone does not.
  await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p>one<img src="${src}" alt="dot" width="20"> two</p>`); e.focus(); const n = document.querySelector("#root [data-rte-part=content] p").firstChild; e.selectDom(n, 3, n, 3); }, pixel);
  await page.waitForTimeout(60);
  check(`${name} (ui) a caret beside an image does not select it`, await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 0));
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(80);
  check(`${name} (ui) Shift+Right over an image selects it and shows the handle`, await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 1) && (await page.locator("[data-rte-resize-handle]").count()) === 1, await page.evaluate(() => JSON.stringify(window.__one.editor.engine.selection)));
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
  check(`${name} (ui) the arrow key alone moves past it and drops the selection`, await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 0) && (await page.locator("[data-rte-resize-handle]").count()) === 0);
  // An image can be dragged to another place in the text.
  await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p>first<img src="${src}" alt="dot" width="40"></p><p>second line</p>`); e.focus(); }, pixel);
  await page.waitForTimeout(80);
  const moving = await page.locator("#root [data-rte-part=content] img").boundingBox();
  const target = await page.locator("#root [data-rte-part=content] p").nth(1).boundingBox();
  await page.mouse.click(moving.x + moving.width / 2, moving.y + moving.height / 2);
  await page.waitForTimeout(60);
  await page.mouse.move(moving.x + moving.width / 2, moving.y + moving.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 30, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  check(`${name} (ui) dragging an image moves it to where it is dropped`, await page.evaluate(() => /^<p>first<\/p><p>.*<img [^>]*>.*<\/p>$/.test(window.__one.editor.getHtml()) && !/^<p>first<img/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml().replace(/src="[^"]*"/g, "src=…")));
  // The list style menu: a marker style for the list the caret is in, and where it starts counting.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<ol><li>one</li><li>two</li></ol><p>after</p>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] li").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="list-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-menu-item="list-style-lower-roman"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the list style menu sets the marker`, await page.evaluate(() => window.__one.editor.getHtml() === '<ol style="list-style-type: lower-roman;"><li>one</li><li>two</li></ol><p>after</p>'), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="list-style"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) and that style shows as the chosen one`, await page.evaluate(() => document.querySelector('#root [data-rte-menu-item="list-style-lower-roman"]').getAttribute("aria-checked") === "true"));
  await page.click('#root [data-rte-menu-item="list-start"]');
  await page.waitForTimeout(100);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) the Start at dialog sets the number`, await page.evaluate(() => window.__one.editor.getHtml().startsWith('<ol start="4" style="list-style-type: lower-roman;">')), await page.evaluate(() => window.__one.editor.getHtml()));
  // Position and caption, from the properties dialog.
  await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p><img src="${src}" alt="dot" width="40"></p><p>after</p>`); e.focus(); }, pixel);
  await page.waitForTimeout(60);
  const dotBox = await page.locator("#root [data-rte-part=content] img").boundingBox();
  await page.mouse.click(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="image-properties"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the properties dialog has a position list and a caption field`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rte-part=dialog]")].find((x) => x.open); const sel = d && d.querySelector("select[name=align]"); return !!sel && sel.options.length === 4 && !!d.querySelector("[name=caption]"); }));
  await page.selectOption('#root [data-rte-part=dialog][open] select[name=align]', "center");
  await page.fill('#root [data-rte-part=dialog][open] [name=caption]', "A dot");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) a captioned image is written as a figure`, await page.evaluate(() => /<figure><img [^>]*alt="dot"[^>]*><figcaption>A dot<\/figcaption><\/figure><p>after<\/p>/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) and the caption shows under the picture without being text of the document`, await page.evaluate(() => { const c = document.querySelector("#root [data-rte-part=content] [data-rte-caption]"); return !!c && c.textContent === "A dot" && c.getAttribute("contenteditable") === "false"; }));
  // Typing beside the picture makes it no longer alone in its paragraph, and a caption is kept only for an image alone.
  await page.locator("#root [data-rte-part=content] p").nth(1).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("x");
  check(`${name} (ui) the caret passes the caption; typing next to the picture ends the figure`, await page.evaluate(() => { const h = window.__one.editor.getHtml(); return !h.includes("<figure>") && h.includes("x") && h.includes("<p>after</p>"); }), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p>a<img src="${src}" width="40">b</p>`); e.focus(); }, pixel);
  await page.waitForTimeout(60);
  const inlineBox = await page.locator("#root [data-rte-part=content] img").boundingBox();
  await page.mouse.click(inlineBox.x + inlineBox.width / 2, inlineBox.y + inlineBox.height / 2);
  await page.waitForTimeout(60);
  await page.evaluate(() => window.__one.editor.commands.run("image.update", { align: "right" }));
  await page.waitForTimeout(80);
  check(`${name} (ui) an image beside text floats to the side`, await page.evaluate(() => getComputedStyle(document.querySelector("#root [data-rte-part=content] img")).cssFloat === "right" && /style="float: right;/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>plain text</p>"); e.focus(); });
  await page.waitForTimeout(80);
  check(`${name} (ui) the handle goes when no image is selected`, (await page.locator("[data-rte-resize-handle]").count()) === 0);

  // A menu entry that asks for something opens a dialog.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] td p").firstChild; e.selectDom(n, 0, n, 0); });
  await page.waitForTimeout(60);
  await page.click(trigger);
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-menu-item="table-column-width"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the column width entry opens a dialog with its field focused`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rte-part=dialog]")].find((x) => x.open); return !!d && d.querySelector("[data-rte-part=dialog-title]").textContent === "Column width…" && document.activeElement === d.querySelector("[data-rte-part=field]"); }), await active());
  await page.keyboard.type("30%");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) submitting it sets the width of the column`, await page.evaluate(() => window.__one.editor.getHtml().includes('<col style="width: 30%">') || window.__one.editor.getHtml().includes("<col><col style=\"width: 30%\">")), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) and the column is drawn at that width`, await page.evaluate(() => { const col = document.querySelector("#root [data-rte-part=content] col"); return !!col && col.style.width === "30%"; }), "col");
  // The Cell style menu: color behind, line round, row height.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>"); e.focus(); const n = document.querySelector("#root [data-rte-part=content] td p").firstChild; e.selectDom(n, 0, n, 0); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rte-item="cell-style"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the cell style menu has tinted swatches, line choices and a row height entry`, await page.evaluate(() => { const m = document.querySelector('#root [data-rte-item="cell-style"] + [data-rte-part=menu]'); const sw = m.querySelector('[data-rte-menu-item="cell-fill-green"] [data-rte-part=swatch]'); return !!sw && getComputedStyle(sw).backgroundColor === "rgb(200, 230, 201)" && !!m.querySelector('[data-rte-menu-item="cell-border-dashed"]') && m.querySelector('[data-rte-menu-item="cell-border-default"]').getAttribute("aria-checked") === "true" && !!m.querySelector('[data-rte-menu-item="cell-row-height"]'); }), "menu");
  await page.click('#root [data-rte-menu-item="cell-fill-green"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a fill colors the cell, in the document and on the page`, await page.evaluate(() => window.__one.editor.getHtml().includes('<td style="background-color: #c8e6c9;">a</td>') && getComputedStyle(document.querySelector("#root [data-rte-part=content] td")).backgroundColor === "rgb(200, 230, 201)"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="cell-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-menu-item="cell-border-thick"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a line draws it round the cell`, await page.evaluate(() => { const td = document.querySelector("#root [data-rte-part=content] td"); const c = getComputedStyle(td); return window.__one.editor.getHtml().includes("border: 3px solid currentcolor") && c.borderTopWidth === "3px" && c.borderTopStyle === "solid"; }), "border");
  await page.click('#root [data-rte-item="cell-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-menu-item="cell-border-none"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-item="cell-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rte-menu-item="cell-edge-bottom"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) a line along one edge: no lines, then the bottom one, in the document and on the page`, await page.evaluate(() => { const td = document.querySelector("#root [data-rte-part=content] td"); const c = getComputedStyle(td); return window.__one.editor.getHtml().includes("border-top: none; border-right: none; border-bottom: 1px solid currentcolor; border-left: none") && c.borderBottomStyle === "solid" && c.borderTopStyle === "none"; }), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rte-item="cell-style"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) and the menu shows the bottom line as on and the top as off`, await page.evaluate(() => document.querySelector('#root [data-rte-menu-item="cell-edge-bottom"]').getAttribute("aria-checked") === "true" && document.querySelector('#root [data-rte-menu-item="cell-edge-top"]').getAttribute("aria-checked") === "false"), "edges");
  await page.click('#root [data-rte-menu-item="cell-row-height"]');
  await page.waitForTimeout(100);
  await page.keyboard.type("80");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) the row height dialog sets the least height of the row`, await page.evaluate(() => window.__one.editor.getHtml().includes('<tr style="height: 80px">') && document.querySelector("#root [data-rte-part=content] tr").getBoundingClientRect().height >= 79), await page.evaluate(() => window.__one.editor.getHtml()));
  // The placeholder and the length limit, on a third editor made with those options.
  const third = '#third [data-rte-part=content] > :first-child';
  check(`${name} (ui) an empty editor shows its placeholder: marked empty, said to assistive technology, and drawn`, await page.evaluate((q) => { const e = document.querySelector(q); return e.hasAttribute("data-rte-empty") && e.getAttribute("aria-placeholder") === "Type here" && getComputedStyle(e.firstElementChild, "::before").content === '"Type here"'; }, third), "placeholder");
  await page.click(third);
  await page.keyboard.type("abcdefghijklmnop");
  check(`${name} (ui) typing past maxLength is refused at the limit`, (await page.evaluate(() => window.__three.editor.getHtml())) === "<p>abcdefghijkl</p>", await page.evaluate(() => window.__three.editor.getHtml()));
  check(`${name} (ui) once there is text the placeholder is gone`, await page.evaluate((q) => { const e = document.querySelector(q); return !e.hasAttribute("data-rte-empty") && getComputedStyle(e.firstElementChild, "::before").content === "none"; }, third), "gone");
  check(`${name} (ui) spellcheck can be switched off`, (await page.evaluate((q) => document.querySelector(q).spellcheck, third)) === false, "spellcheck");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  check(`${name} (ui) deleting everything brings the placeholder back`, await page.evaluate((q) => document.querySelector(q).hasAttribute("data-rte-empty"), third), "back");
  // Cleaning up.
  // The selection toolbar and the context menu (the second editor has both switched on).
  {
    const bar = "#second [data-rte-part=floating]";
    const para = "#second [data-rte-part=content] p";
    const pick = (from, to) => page.evaluate(([a, b, q]) => { const e = window.__two.editor; e.focus(); const n = document.querySelector(q).lastChild; e.selectDom(n, a, n, b); }, [from, to, para]);
    const shown = () => page.evaluate((q) => { const b = document.querySelector(q); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; }, bar);
    check(`${name} (ui) the selection toolbar is not there until text is selected`, !(await shown()), "shown");
    await pick(2, 9);
    await page.waitForTimeout(250);
    check(`${name} (ui) selecting text shows a named toolbar of formatting controls over it`, await page.evaluate((q) => { const b = document.querySelector(q); const ids = [...b.querySelectorAll("[data-rte-item]")].map((x) => x.getAttribute("data-rte-item")); return b.getAttribute("role") === "toolbar" && !!b.getAttribute("aria-label") && ["bold", "italic", "underline", "link"].every((i) => ids.includes(i)) && [...b.querySelectorAll("button")].every((x) => x.getAttribute("aria-label")); }, bar), "toolbar");
    check(`${name} (ui) the selection toolbar sits over the selected text and inside the editor`, await page.evaluate(([q, p]) => { const b = document.querySelector(q).getBoundingClientRect(); const r = document.getElementById("second").getBoundingClientRect(); const n = document.querySelector(p).firstChild; const range = document.createRange(); range.setStart(n, 2); range.setEnd(n, 9); const s = range.getBoundingClientRect(); return b.bottom <= s.top + 1 && b.left >= r.left - 1 && b.right <= r.right + 1; }, [bar, para]), "placement");
    await page.click(`${bar} [data-rte-item=bold]`);
    check(`${name} (ui) a control in the selection toolbar formats the selection and shows it as on, and the selection stays`, await page.evaluate(([q, p]) => { const e = window.__two.editor; return e.getHtml().includes("<strong>") && document.querySelector(q + " [data-rte-item=bold]").getAttribute("aria-pressed") === "true" && document.querySelector(p + " strong") !== null && e.snapshot.selection.anchor.offset !== e.snapshot.selection.focus.offset; }, [bar, para]), await page.evaluate(() => window.__two.editor.getHtml()));
    check(`${name} (ui) after using the selection toolbar the focus is back in the editor`, await page.evaluate(() => document.getElementById("second").contains(document.activeElement) && document.activeElement.isContentEditable), "focus");
    await page.keyboard.press("Alt+F10");
    check(`${name} (ui) Alt+F10 moves the focus into the selection toolbar`, await page.evaluate((q) => document.querySelector(q).contains(document.activeElement), bar), "focus");
    // The first Escape dismisses the control's tooltip (shown because the focus arrived by keyboard); the next one closes the bar.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    check(`${name} (ui) Escape in the selection toolbar hides it and returns the focus to the editor`, !(await shown()) && (await page.evaluate(() => document.activeElement.isContentEditable)), "escape");
    await pick(3, 3);
    await page.waitForTimeout(250);
    check(`${name} (ui) a caret without a selection shows no selection toolbar`, !(await shown()), "shown");
    await pick(1, 6);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(250);
    check(`${name} (ui) moving the focus away from the editor hides the selection toolbar`, !(await shown()), "shown");

    // the context menu
    const menu = "#second [data-rte-context]";
    await pick(0, 0);
    await page.click(para, { button: "right" });
    await page.waitForTimeout(150);
    check(`${name} (ui) a right click opens a menu of commands at the pointer, and the browser's own menu is not used`, await page.evaluate((q) => { const m = document.querySelector(q); const names = [...m.querySelectorAll("[data-rte-menu-item]")].map((x) => x.querySelector("[data-rte-part=label]").textContent); return m.getAttribute("role") === "menu" && !m.hidden && names.includes("Undo") && names.includes("Bold") && !!m.getAttribute("aria-labelledby"); }, menu), "menu");
    check(`${name} (ui) the context menu stays inside the window`, await page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, menu), "bounds");
    check(`${name} (ui) the first entry of the context menu has the focus`, await page.evaluate((q) => document.querySelector(q).contains(document.activeElement), menu), "focus");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    check(`${name} (ui) Escape closes the context menu and returns the focus to the editor`, await page.evaluate((q) => document.querySelector(q).hidden && document.activeElement.isContentEditable, menu), "escape");
    await pick(2, 9);
    await page.click(para, { button: "right" });
    await page.waitForTimeout(150);
    await page.click(`${menu} [data-rte-menu-item=italic]`);
    check(`${name} (ui) choosing an entry runs its command on the selection, closes the menu and returns the focus`, await page.evaluate(([q]) => window.__two.editor.getHtml().includes("<em>") && document.querySelector(q).hidden && document.activeElement.isContentEditable, [menu]), await page.evaluate(() => window.__two.editor.getHtml()));
    await pick(0, 0);
    await page.click(para, { button: "right", modifiers: ["Shift"] });
    await page.waitForTimeout(150);
    check(`${name} (ui) Shift with the right button does not open the menu, which leaves the browser's own`, await page.evaluate((q) => document.querySelector(q).hidden, menu), "opened");
    await page.keyboard.press("Escape");
    // The link dialog, opened from each of the two surfaces: it applies to the selected text and the focus comes back to the editor.
    const field = "#second [data-rte-part=dialog]:not([data-rte-shortcuts]) [data-rte-part=field]";
    const fresh = () => page.evaluate(() => { const e = window.__two.editor; e.setHtml("<p>one two three four five six seven</p>"); });
    await fresh();
    await pick(4, 7);
    await page.waitForTimeout(250);
    await page.click(`${bar} [data-rte-item=link]`);
    await page.waitForTimeout(100);
    await page.fill(field, "https://x.test/a");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    check(`${name} (ui) the link dialog opened from the selection toolbar links the selected text and returns the focus to the editor`, await page.evaluate(() => window.__two.editor.getHtml().includes('<a href="https://x.test/a">two</a>') && document.activeElement.isContentEditable), await page.evaluate(() => window.__two.editor.getHtml() + " " + document.activeElement.tagName));
    await fresh();
    await pick(8, 13);
    await page.click(para, { button: "right" });
    await page.waitForTimeout(150);
    await page.click(`${menu} [data-rte-menu-item=link]`);
    await page.waitForTimeout(100);
    await page.fill(field, "https://x.test/b");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    check(`${name} (ui) the link dialog opened from the context menu links the selected text and returns the focus to the editor`, await page.evaluate(() => window.__two.editor.getHtml().includes('<a href="https://x.test/b">three</a>') && document.activeElement.isContentEditable), await page.evaluate(() => window.__two.editor.getHtml() + " " + document.activeElement.tagName));
    // The key for a context menu, with a real key press.
    await pick(2, 2);
    await page.keyboard.press("Shift+F10");
    await page.waitForTimeout(150);
    const byKey = await page.evaluate((q) => !document.querySelector(q).hidden, menu);
    if (name === "chromium") check(`${name} (ui) Shift+F10 opens the context menu at the caret`, byKey, "closed");
    else console.log(`note: ${name} sends no context menu event for a Shift+F10 key press from the test driver (opened: ${byKey}); left to the hand-testing script`);
    await page.keyboard.press("Escape");
    // Dragging a selection does not show the bar until the button is released.
    await fresh();
    const box = await page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; }, para);
    await page.mouse.move(box.x + 4, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y, { steps: 6 });
    await page.waitForTimeout(250);
    const during = await shown();
    await page.mouse.up();
    await page.waitForTimeout(250);
    check(`${name} (ui) the selection toolbar waits for the pointer to be released when text is selected by dragging`, !during && (await shown()), JSON.stringify([during, await shown()]));
  }
  // <rte-ui>: the interface around an <rte-editor>, by attributes.
  {
    const q = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
    const host = "#fourth rte-editor";
    check(`${name} (ui element) <rte-ui> builds the interface inside the editor element, with one toolbar and the surface in the content`, (await q(`${host} > [data-rte-part=toolbar] [data-rte-item=bold]`)) === 1 && (await q(`${host} > [data-rte-part=content] [contenteditable=true]`)) === 1 && (await page.evaluate((h) => document.querySelector(h).classList.contains("rte-root"), host)), "built");
    check(`${name} (ui element) the editor element's value is still the document`, await page.evaluate((h) => document.querySelector(h).value === "<p>An editor made from custom elements, with its interface.</p>", host), await page.evaluate((h) => document.querySelector(h).value, host));
    await page.evaluate((h) => { const e = document.querySelector(h).editor; e.focus(); const n = document.querySelector(h + " [data-rte-part=content] p").lastChild; e.selectDom(n, 3, n, 9); }, host);
    await page.waitForTimeout(250);
    check(`${name} (ui element) the selection-toolbar attribute turns the selection toolbar on`, await page.evaluate((h) => { const b = document.querySelector(h + " [data-rte-part=floating]"); return !!b && !b.hidden; }, host), "shown");
    await page.evaluate(() => document.getElementById("fourth").setAttribute("theme", "dark"));
    check(`${name} (ui element) changing the theme attribute restyles without rebuilding`, await page.evaluate((h) => document.querySelector(h).getAttribute("data-rte-theme") === "dark" && document.querySelectorAll(h + " [data-rte-part=toolbar]").length === 1, host), "theme");
    await page.evaluate(() => document.getElementById("fourth").removeAttribute("selection-toolbar"));
    check(`${name} (ui element) removing the attribute rebuilds the interface without that part and keeps the document`, (await q(`${host} [data-rte-part=floating]`)) === 0 && (await q(`${host} [data-rte-part=toolbar]`)) === 1 && (await q(`${host} [data-rte-part=content] [contenteditable=true]`)) === 1 && (await q(`${host} [data-rte-part=content]`)) === 1 && (await page.evaluate((h) => document.querySelector(h).value.includes("custom elements"), host)), "rebuilt");
    await page.evaluate(() => { const r = document.getElementById("fourth"); const p = r.parentNode; r.remove(); p.appendChild(r); });
    await page.waitForTimeout(150);
    check(`${name} (ui element) moving the element in the page leaves one interface`, (await q(`${host} [data-rte-part=toolbar]`)) === 1 && (await q(`${host} [data-rte-part=content] [contenteditable=true]`)) === 1, `${await q(`${host} [data-rte-part=toolbar]`)}`);
    await page.evaluate(() => document.getElementById("fourth").remove());
  }
  await page.evaluate(() => window.__two.ui.destroy());
  check(`${name} (ui) destroying an interface removes what it added and leaves the other one alone`, await page.evaluate(() => { const r = document.getElementById("second"); return !r.classList.contains("rte-root") && !r.hasAttribute("data-rte-theme") && !r.querySelector("[data-rte-part=toolbar]") && document.getElementById("root").classList.contains("rte-root"); }), "destroy");
  check(`${name} (ui) no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- what the security page promises: no storage, no cookies, no network of its own, whatever a person does
const WATCH = `
  window.__touched = [];
  const note = (what) => window.__touched.push(what);
  for (const name of ["getItem", "setItem", "removeItem", "clear", "key"]) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function (...args) { note("Storage." + name); return original.apply(this, args); };
  }
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  Object.defineProperty(document, "cookie", { configurable: true, get() { note("document.cookie read"); return cookie.get.call(this); }, set(v) { note("document.cookie write"); cookie.set.call(this, v); } });
  for (const name of ["open", "databases", "deleteDatabase"]) {
    if (window.indexedDB) { const original = IDBFactory.prototype[name]; IDBFactory.prototype[name] = function (...args) { note("indexedDB." + name); return original.apply(this, args); }; }
  }
  const fetchOriginal = window.fetch; window.fetch = function (...args) { note("fetch " + String(args[0]).slice(0, 60)); return fetchOriginal.apply(this, args); };
  const open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (...args) { note("XMLHttpRequest " + String(args[1]).slice(0, 60)); return open.apply(this, args); };
  if (navigator.sendBeacon) { const b = navigator.sendBeacon; navigator.sendBeacon = function (...args) { note("sendBeacon"); return b.apply(this, args); }; }
  for (const name of ["WebSocket", "EventSource", "Worker", "SharedWorker"]) {
    const Original = window[name];
    if (Original) window[name] = new Proxy(Original, { construct(target, args) { note("new " + name); return Reflect.construct(target, args); } });
  }
  if (window.caches) { const o = CacheStorage.prototype.open; CacheStorage.prototype.open = function (...args) { note("caches.open"); return o.apply(this, args); }; }
`;
for (const [name, type] of engines) {
  for (const demo of [false, "headless", "element", "ui"]) {
    const t = await open(type, name === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}, "", demo === "headless" ? "headless" : demo, WATCH);
    const { page } = t;
    const label = `${name} (privacy, ${demo || "editor"})`;
    // Use it the way a person would: type, format, undo, paste, find, view the source, open and close menus and dialogs.
    const editable = demo === "element" ? "#body [contenteditable=true]" : demo === "ui" ? "#root [contenteditable=true]" : demo === "headless" ? "#ed" : "#ed";
    await page.click(editable).catch(() => undefined);
    await page.keyboard.type("Some words to work with");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.press("ControlOrMeta+z");
    await page.evaluate(() => navigator.clipboard?.writeText?.("pasted text").catch?.(() => undefined)).catch(() => undefined);
    await page.keyboard.press("ControlOrMeta+v").catch(() => undefined);
    if (demo === "ui") {
      await page.keyboard.press("ControlOrMeta+f");
      await page.keyboard.type("words");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      for (const id of ["source", "table", "symbols", "text-color", "link", "image", "shortcuts"]) {
        await page.click(`#root [data-rte-item="${id}"]`).catch(() => undefined);
        await page.keyboard.press("Escape");
      }
    }
    await page.waitForTimeout(300);
    const touched = await page.evaluate(() => window.__touched);
    check(`${label} uses no storage, cookies or network of its own`, touched.length === 0, touched);
    check(`${label} makes no request beyond the page's own files`, t.outside.length === 0, t.outside);
    await t.browser.close();
  }
}

// --- the watch above must actually see these things, or the checks above would pass for nothing
for (const [name, type] of engines) {
  const t = await open(type, {}, "", false, WATCH);
  await t.page.evaluate(() => { try { localStorage.setItem("a", "b"); } catch {} try { document.cookie = "a=b"; } catch {} try { indexedDB.open("x"); } catch {} fetch("data:text/plain,x").catch(() => undefined); });
  const seen = await t.page.evaluate(() => window.__touched);
  check(`${name} (privacy) the watch sees storage, cookie, database and fetch use`, ["Storage.setItem", "document.cookie write", "indexedDB.open", "fetch data:text/plain,x"].every((x) => seen.includes(x)), seen);
  await t.browser.close();
}

// --- an audit of the styled interface for the things automated checks catch: names, ids, references and roles
for (const [name, type] of engines) {
  const t = await open(type, {}, "", "ui");
  const { page } = t;
  // Open everything that can be opened, so the audit sees it all.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>text</p>"); e.focus(); });
  await page.click('#root [data-rte-item="find"]');
  await page.click('#root [data-rte-item="source"]');
  await page.click('#root [data-rte-item="source"]');
  const audit = await page.evaluate(() => {
    const root = document.getElementById("root");
    const problems = [];
    const nameOf = (el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      // A referenced element is named the same way: by its own aria-label first, then its text.
      if (labelledby) return labelledby.split(/\s+/).map((id) => { const r = document.getElementById(id); return r ? (r.getAttribute("aria-label") || r.textContent || "") : ""; }).join(" ").trim();
      return (el.getAttribute("aria-label") || (el.labels && [...el.labels].map((l) => l.textContent).join(" ")) || el.textContent || el.getAttribute("title") || "").trim();
    };
    for (const el of root.querySelectorAll("button, input, select, textarea, dialog, [role=menu], [role=toolbar], [role=search], [role=textbox]")) {
      if (el.type === "hidden") continue;
      if (!nameOf(el)) problems.push(`no name: ${el.tagName.toLowerCase()}[${el.getAttribute("data-rte-item") ?? el.getAttribute("data-rte-part") ?? el.getAttribute("role")}]`);
    }
    const ids = new Map();
    for (const el of root.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id ${id}`);
    for (const attr of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
      for (const el of root.querySelectorAll(`[${attr}]`)) for (const id of el.getAttribute(attr).split(/\s+/)) if (id && !document.getElementById(id)) problems.push(`${attr} points at a missing id ${id}`);
    }
    // Roving focus: exactly one tab stop in the toolbar.
    const stops = [...root.querySelectorAll("[data-rte-part=toolbar] [data-rte-item]")].filter((e) => e.tabIndex === 0).length;
    if (stops !== 1) problems.push(`toolbar has ${stops} tab stops`);
    for (const el of root.querySelectorAll("[role=menuitem], [role=menuitemcheckbox]")) if (!el.closest("[role=menu]")) problems.push("a menu item outside a menu");
    for (const el of root.querySelectorAll("[aria-pressed]")) if (!["true", "false", "mixed"].includes(el.getAttribute("aria-pressed"))) problems.push("bad aria-pressed");
    if (!root.querySelector("[role=status]")) problems.push("no live region");
    if (!document.querySelector("#root [role=textbox][aria-multiline=true]")) problems.push("the writing area is not a multiline textbox");
    return problems;
  });
  check(`${name} (audit) names, ids, references and roles are in order`, audit.length === 0, audit);
  await t.browser.close();
}

// --- a narrow screen (a phone): nothing sticks out sideways, menus and dialogs stay on the screen, and a tap leaves no tooltip behind
for (const [name, type] of engines) {
  const touch = name !== "firefox";
  const t = await open(type, { viewport: { width: 390, height: 844 }, ...(touch ? { hasTouch: true } : {}) }, "", "ui");
  const { page } = t;
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  check(`${name} (narrow) the page does not scroll sideways`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
  check(`${name} (narrow) the toolbar wraps onto more rows and every control is on the screen`, await page.evaluate(() => { const bar = document.querySelector("#root [data-rte-part=toolbar]"); const items = [...bar.querySelectorAll("[data-rte-item]")]; return bar.getBoundingClientRect().height > 80 && items.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }); }), "toolbar");
  check(`${name} (narrow) every control is at least 24px square (the smallest target WCAG allows)`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=toolbar] button[data-rte-item]")].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })), "targets");
  for (const id of ["text-color", "highlight", "symbols", "table", "find"]) {
    if (id === "find") {
      // A mouse or focus left on the last button would keep its tooltip up, which can sit over the next row.
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(100);
      await tap('#root [data-rte-item="find"]');
      await page.waitForTimeout(150);
      check(`${name} (narrow) the find bar fits the screen`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=findbar] *")].every((e) => e.getBoundingClientRect().right <= innerWidth + 1)), "findbar");
      break;
    }
    await tap(`#root [data-rte-item="${id}"]`);
    await page.waitForTimeout(150);
    check(`${name} (narrow) the ${id} menu opens inside the screen`, await page.evaluate((id) => { const m = document.querySelector(`#root [data-rte-item="${id}"] + [data-rte-part=menu]`).getBoundingClientRect(); return !document.querySelector(`#root [data-rte-item="${id}"] + [data-rte-part=menu]`).hidden && m.left >= 0 && m.right <= innerWidth; }, id), await page.evaluate((id) => JSON.stringify(document.querySelector(`#root [data-rte-item="${id}"] + [data-rte-part=menu]`).getBoundingClientRect()), id));
    await page.keyboard.press("Escape");
  }
  await tap('#root [data-rte-item="image"]');
  await page.waitForTimeout(150);
  check(`${name} (narrow) a dialog fits the screen`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "dialog");
  await page.keyboard.press("Escape");
  if (touch) {
    await tap('#root [data-rte-item="bold"]');
    await page.waitForTimeout(800);
    check(`${name} (narrow) tapping a button leaves no tooltip over it`, await page.evaluate(() => document.querySelector("#root [data-rte-part=tooltip]").hidden), "tip");
  }
  if (touch) {
    // A finger brings up grips on the cell's right and bottom edges, which a finger can hold where a thin edge could not be.
    await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></tbody></table><p>z</p>"); });
    await page.waitForTimeout(80);
    await page.tap("#root [data-rte-part=content] td");
    await page.waitForTimeout(100);
    const grip = (kind) => page.evaluate((k) => { const g = document.querySelector(`[data-rte-grip="${k}"]`); if (!g) return null; const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width }; }, kind);
    check(`${name} (narrow) a touch on a table cell shows the width and height grips, big enough for a finger`, !!(await grip("width")) && !!(await grip("height")) && (await grip("width")).w >= 22, [await grip("width"), await grip("height")]);
    if (name === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
      const g = await grip("width");
      const before = await page.evaluate(() => document.querySelector("#root [data-rte-part=content] td").getBoundingClientRect().width);
      await touch("touchStart", g.x, g.y);
      for (let i = 1; i <= 5; i++) await touch("touchMove", g.x + i * 8, g.y);
      await touch("touchEnd", 0, 0);
      await page.waitForTimeout(100);
      check(`${name} (narrow) dragging the width grip with a finger sets the column width`, await page.evaluate(() => /<col style="width: \d+px">/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));
      const h = await grip("height");
      await touch("touchStart", h.x, h.y);
      for (let i = 1; i <= 5; i++) await touch("touchMove", h.x, h.y + i * 6);
      await touch("touchEnd", 0, 0);
      await page.waitForTimeout(100);
      check(`${name} (narrow) dragging the height grip with a finger sets the row height`, await page.evaluate(() => /<tr style="height: \d+px">/.test(window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));
      void before;
      // The same with an image: a tap selects it, and its corner handle follows a finger.
      await page.evaluate((src) => { window.__one.editor.setHtml(`<p>a<img src="${src}" alt="dot" width="60">b</p>`); }, onePixelPng());
      await page.waitForTimeout(80);
      await page.tap("#root [data-rte-part=content] img");
      await page.waitForTimeout(100);
      const corner = await page.evaluate(() => { const g = document.querySelector("[data-rte-resize-handle]"); if (!g) return null; const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      check(`${name} (narrow) a tap on an image selects it and shows the resize handle`, !!corner, corner);
      // The browser's own handles and Copy menu come with a selection that has something in it: under a finger the page holds only a caret.
      check(`${name} (narrow) a tap on an image leaves the page with a caret, not a selection, while the image stays picked`, await page.evaluate(() => { const s = getSelection(); return s.isCollapsed && document.querySelectorAll("#root img[data-rte-image-selected]").length === 1; }), await page.evaluate(() => [getSelection().isCollapsed, getSelection().toString()]));
      if (corner) {
        await touch("touchStart", corner.x, corner.y);
        for (let i = 1; i <= 5; i++) await touch("touchMove", corner.x + i * 8, corner.y + i * 8);
        await touch("touchEnd", 0, 0);
        await page.waitForTimeout(100);
        check(`${name} (narrow) dragging the handle with a finger resizes the image`, await page.evaluate(() => { const m = /width="(\d+)"/.exec(window.__one.editor.getHtml()); return !!m && Number(m[1]) > 60; }), await page.evaluate(() => window.__one.editor.getHtml().replace(/src="[^"]*"/, "src=…")));
        // A tap beside the picture is an ordinary tap: the picture is let go and the caret goes where the finger was.
        await page.tap("#root [data-rte-part=content] p");
        await page.waitForTimeout(100);
        check(`${name} (narrow) a tap beside the image lets it go`, await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 0 && document.querySelectorAll("[data-rte-resize-handle]").length === 0), await page.evaluate(() => [document.querySelectorAll("#root img[data-rte-image-selected]").length]));
      }
    }
  }
  check(`${name} (narrow) no page errors`, t.errors.length === 0, t.errors);
  await t.browser.close();
}

// --- a phone turned on its side, and a long press: the layout follows the new size, the selection is kept, and the browser keeps the long press
// (the emulation turns the window, it does not rotate a device: the real rotation is in the hand-testing script)
for (const [name, type] of engines) {
  const touch = name !== "firefox";
  const t = await open(type, { viewport: { width: 390, height: 844 }, ...(touch ? { hasTouch: true } : {}) }, "", "ui");
  const { page } = t;
  const para = "#second [data-rte-part=content] p";
  const bar = "#second [data-rte-part=floating]";
  const pick = () => page.evaluate((q) => { const e = window.__two.editor; e.focus(); const n = document.querySelector(q).lastChild; e.selectDom(n, 2, n, 9); }, para);
  const state = () => page.evaluate(([q, b]) => {
    const e = window.__two.editor.snapshot.selection;
    const items = [...document.querySelectorAll("#root [data-rte-part=toolbar] [data-rte-item]")].filter((x) => x.getBoundingClientRect().width > 0);
    const floating = document.querySelector(b);
    const f = floating && !floating.hidden ? floating.getBoundingClientRect() : null;
    return {
      sideways: document.documentElement.scrollWidth > innerWidth + 1,
      offscreen: items.filter((x) => { const r = x.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length,
      selection: e ? [e.anchor.offset, e.focus.offset] : null,
      floatingInside: f ? f.left >= -1 && f.right <= innerWidth + 1 : "none",
    };
  }, [para, bar]);
  await pick();
  await page.waitForTimeout(250);
  const upright = await state();
  for (const [label, size] of [["landscape", { width: 844, height: 390 }], ["portrait again", { width: 390, height: 844 }]]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    const now = await state();
    check(`${name} (rotate) ${label}: the page does not scroll sideways and every toolbar control is on the screen`, !now.sideways && now.offscreen === 0, now);
    check(`${name} (rotate) ${label}: the selection is kept`, JSON.stringify(now.selection) === JSON.stringify(upright.selection) && now.selection !== null, [upright.selection, now.selection]);
    check(`${name} (rotate) ${label}: the selection toolbar, if shown, is inside the screen from side to side`, now.floatingInside === "none" || now.floatingInside === true, now);
  }
  // A touch long press makes a context menu event; the editor's own menu stays out of it, so the browser's handles and menu are left alone.
  await pick();
  const longPress = await page.evaluate((q) => {
    const target = document.querySelector(q);
    const event = new PointerEvent("contextmenu", { bubbles: true, cancelable: true, pointerType: "touch", clientX: 40, clientY: 40 });
    target.dispatchEvent(event);
    const menu = document.querySelector("#second [data-rte-part=menu]:not([hidden])");
    return { prevented: event.defaultPrevented, menuOpen: !!menu };
  }, para);
  check(`${name} (rotate) a touch long press is left to the browser: no editor menu, the event is not cancelled`, !longPress.prevented && !longPress.menuOpen, longPress);
  // Letting go of a selection handle makes the browser ask for a context menu and say "mouse"; the finger that touched last decides.
  const handleMenu = await page.evaluate((q) => {
    const el = document.querySelector(q);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 40 }));
    el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 40 }));
    const event = new PointerEvent("contextmenu", { bubbles: true, cancelable: true, pointerType: "mouse", clientX: 40, clientY: 40 });
    el.dispatchEvent(event);
    return { prevented: event.defaultPrevented, menuOpen: !!document.querySelector("#second [data-rte-part=menu]:not([hidden])") };
  }, para);
  check(`${name} (rotate) a context menu asked for after a finger touch is left to the browser, whatever pointer it names`, !handleMenu.prevented && !handleMenu.menuOpen, handleMenu);
  // A phone's keyboard reports its typing as a key press (key code 229) even while a finger is only selecting words: that must not bring the editor's own bar over the browser's.
  await page.evaluate((q) => {
    const el = document.querySelector(q);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 40 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 40 }));
    const key = new KeyboardEvent("keydown", { bubbles: true, key: "Unidentified", keyCode: 229 });
    el.dispatchEvent(key);
  }, para);
  await pick();
  await page.waitForTimeout(300);
  check(`${name} (rotate) after a touch and a phone-keyboard key press, selecting words shows no editor bar over the browser's menu`, (await state()).floatingInside === "none", await state());
  // A suggestion from the keyboard's bar replaces the word just typed; one undo puts the word back as it was typed, with the words before it.
  await page.evaluate(() => { const e = window.__two.editor; e.setHtml("<p>one two</p>"); e.focus(); const n = document.querySelector("#second [data-rte-part=content] p").firstChild; e.selectDom(n, 7, n, 7); });
  await page.keyboard.type(" teh");
  // (The caret stays where typing left it, as it does when the bar is used; a synthetic event carries no target range, so the text goes in at the caret.)
  await page.evaluate((q) => {
    document.querySelector(q).dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: "X" }));
  }, para);
  const replaced = await page.evaluate(() => window.__two.editor.getHtml());
  await page.evaluate(() => window.__two.editor.undo());
  const undone = await page.evaluate(() => window.__two.editor.getHtml());
  check(`${name} (rotate) a suggestion replaces the word, and one undo puts back the word as typed, keeping the words before it`, replaced.includes("one two tehX") && undone.includes("one two teh") && !undone.includes("tehX"), [replaced, undone]);
  // A keyboard's suggestion arrives as a delete and a type a moment apart; one undo puts the word back as typed.
  await page.evaluate(() => { const e = window.__two.editor; e.setHtml("<p>one two</p>"); e.focus(); const n = document.querySelector("#second [data-rte-part=content] p").firstChild; e.selectDom(n, 7, n, 7); });
  await page.keyboard.type(" naurd");
  const suggested = await page.evaluate((q) => {
    const e = window.__two.editor; const el = document.querySelector(q); const n = el.firstChild;
    e.selectDom(n, 10, n, 13);
    el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }));
    document.querySelector(q).dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "ture" }));
    const after = e.getHtml();
    e.undo();
    return [after, e.getHtml()];
  }, para);
  check(`${name} (rotate) a keyboard suggestion (a delete, then a type) is one undo step that puts the word back`, suggested[0].includes("one two nature") && suggested[1].includes("one two naurd"), suggested);
  check(`${name} (rotate) no page errors`, t.errors.length === 0, t.errors);
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
  // A big table: typing in one cell must not redraw the whole table.
  const measureTable = (rows, cols) => t.page.evaluate(([r, c]) => {
    const cell = (i, j) => `<td>Cell ${i}-${j} with <strong>bold</strong> and <em>italic</em> words</td>`;
    const html = `<table><tbody>${Array.from({ length: r }, (_, i) => `<tr>${Array.from({ length: c }, (_, j) => cell(i, j)).join("")}</tr>`).join("")}</tbody></table><p>after</p>`;
    const el = document.getElementById("ed");
    const time = (fn) => { const s = performance.now(); fn(); el.getBoundingClientRect(); return performance.now() - s; };
    const p95 = (xs) => xs.slice().sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];
    const out = { set: time(() => window.__editor.setHtml(html)) };
    const tagged = [...el.querySelectorAll("td")];
    tagged.forEach((td) => { td.__kept = true; });
    const tableEl = el.querySelector("table");
    const xs = [];
    for (let i = 0; i < 20; i++) {
      window.__conf.select({ start: `tr:nth-child(${Math.floor(r / 2)}) td:nth-child(${Math.floor(c / 2)}) p`, so: 3, eo: 3 });
      xs.push(time(() => el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "x", bubbles: true, cancelable: true }))));
    }
    out.type = p95(xs);
    out.sameTable = el.querySelector("table") === tableEl;
    out.redrawn = [...el.querySelectorAll("td")].filter((td) => !td.__kept).length;
    return out;
  }, [rows, cols]);
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
    let paragraphType = 0;
    for (const [n, commandBudget, setBudget] of [[1000, 10, 40], [5000, 30, Infinity]]) {
      const r = await measure(n);
      if (n === 1000) paragraphType = r.typeMiddle;
      const worst = Math.max(r.typeMiddle, r.typeTop, r.enterTop, r.joinTop, r.pasteTop);
      console.log(`speed${label} ${n} paragraphs: set ${r.set.toFixed(1)} ms warm, ${r.setCold.toFixed(1)} ms cold; p95 per command: type ${r.typeMiddle.toFixed(1)} (top ${r.typeTop.toFixed(1)}), Enter ${r.enterTop.toFixed(1)}, join ${r.joinTop.toFixed(1)}, paste ${r.pasteTop.toFixed(1)} ms`);
      if (rate === 1) {
        check(`speed: ${n} paragraphs, every command within ${commandBudget} ms (p95)`, worst <= commandBudget * scale, r);
        check(`speed: ${n} paragraphs, set content within ${setBudget} ms`, r.set <= setBudget * scale, r);
      }
    }
    for (const [rows, cols] of [[100, 50], [200, 100]]) {
      const big = await measureTable(rows, cols);
      console.log(`speed${label} table of ${rows * cols} cells: set ${big.set.toFixed(1)} ms, type in one cell p95 ${big.type.toFixed(1)} ms, other cells redrawn ${big.redrawn - 1}`);
      if (rate === 1) check(`speed: typing in a cell of a ${rows * cols}-cell table redraws that cell only`, big.sameTable && big.redrawn === 1, big);
    }
    const table = await measureTable(50, 10);
    console.log(`speed${label} table of 500 cells: set ${table.set.toFixed(1)} ms, type in one cell p95 ${table.type.toFixed(1)} ms`);
    // Against typing in an ordinary document measured a moment ago on the same machine, so a slow runner does not fail it: drawing the whole
    // table again made this about nine times typing in a paragraph, and drawing one cell about three times.
    if (rate === 1) check("speed: typing in a cell of a 500-cell table within 12 ms, or 7 times typing in a paragraph (p95)", table.type <= Math.max(12 * scale, 7 * paragraphType), { ...table, paragraphType });
    if (rate === 1) check("speed: typing in a cell keeps the table and every other cell as drawn", table.sameTable && table.redrawn === 1, table);
  }
  await t.browser.close();
}

// --- languages (docs/LOCALIZATION.md): message packs loaded when wanted, plural forms, numbers, and a mirrored right-to-left interface.
// The packs are test fixtures (packages/rte-ui/demo/test-packs), not shipped translations.
for (const [name, type] of engines) {
  const browser = await type.launch();
  const context = await browser.newContext();
  await context.route("**/*", (route) => (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(new URL("/ui/demo/languages.html", base).href);
  await page.waitForFunction("window.__langReady===true");
  const attrs = (sel, ...names) => page.evaluate(([s, n]) => { const e = document.querySelector(s); return e ? n.map((a) => e.getAttribute(a)) : null; }, [sel, names]);
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; }, sel);
  const status = (id) => page.evaluate((i) => document.querySelector(`#${i} [data-rte-part=status]`).textContent, id);

  // Arabic, loaded after the interface was built: words, language and direction on the interface, not on the writing area.
  check(`${name} (lang) a pack loaded later puts its language and direction on the toolbar`, JSON.stringify(await attrs("#ar [data-rte-part=toolbar]", "lang", "dir", "aria-label")) === JSON.stringify(["ar", "rtl", "التنسيق"]), await attrs("#ar [data-rte-part=toolbar]", "lang", "dir", "aria-label"));
  check(`${name} (lang) and leaves the writing area in the page's language and direction`, await page.evaluate(() => { const c = document.querySelector("#ar [data-rte-part=content]"); return !c.hasAttribute("dir") && !c.hasAttribute("lang") && getComputedStyle(window.__ar.editor.element).direction === "ltr"; }), "content");
  check(`${name} (lang) a control is named, and its tip given, in the pack's words`, JSON.stringify(await attrs("#ar [data-rte-part=toolbar] [data-rte-item=bold]", "aria-label", "data-rte-tip")) === JSON.stringify(["غامق", "غامق (Ctrl+B)"]), await attrs("#ar [data-rte-part=toolbar] [data-rte-item=bold]", "aria-label", "data-rte-tip"));
  check(`${name} (lang) a select's choices are in the pack's words`, (await page.evaluate(() => document.querySelector('#ar select[data-rte-item=block] option[value="1"]').textContent)) === "عنوان 1", "select");
  // Mirrored: the first control (undo) is at the right, the toolbar runs leftwards, and the arrow keys follow what is seen.
  const undo = await rect("#ar [data-rte-part=toolbar] [data-rte-item=undo]");
  const bold = await rect("#ar [data-rte-part=toolbar] [data-rte-item=bold]");
  check(`${name} (lang) a right-to-left toolbar starts at the right`, undo.left > bold.right, { undo, bold });
  await page.evaluate(() => document.querySelector("#ar [data-rte-part=toolbar] [data-rte-item=undo]").focus());
  await page.keyboard.press("ArrowLeft");
  check(`${name} (lang) ArrowLeft moves to the next control in a right-to-left toolbar`, (await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"))) === "redo", await page.evaluate(() => document.activeElement.getAttribute("data-rte-item")));
  await page.keyboard.press("ArrowRight");
  check(`${name} (lang) and ArrowRight back`, (await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"))) === "undo", "back");
  // The tooltip lines up with its control's right edge.
  await page.evaluate(() => document.querySelector("#ar [data-rte-part=toolbar] [data-rte-item=bold]").focus());
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(80);
  const tipFor = await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"));
  const tip = await rect("#ar [data-rte-part=tooltip]");
  const control = await rect(`#ar [data-rte-part=toolbar] [data-rte-item="${tipFor}"]`);
  check(`${name} (lang) a tooltip lines up with the right edge of its control`, !!tip && Math.abs(tip.right - control.right) <= 1 && tip.top >= control.bottom, { tip, control });
  await page.keyboard.press("Escape");
  // A menu opens under its button from the right, with the room for the check mark on the right.
  await page.click("#ar [data-rte-part=toolbar] [data-rte-item=table]");
  await page.waitForTimeout(80);
  const menu = await rect("#ar [data-rte-part=toolbar] [data-rte-item=table] + [data-rte-part=menu]");
  const host = await rect("#ar [data-rte-part=toolbar] [data-rte-item=table]");
  check(`${name} (lang) a menu opens from its button's right edge`, !!menu && Math.abs(menu.right - host.right) <= 1, { menu, host });
  check(`${name} (lang) a menu entry keeps the room for its check mark on the right`, await page.evaluate(() => { const s = getComputedStyle(document.querySelector("#ar [data-rte-menu-item=table-header]")); return parseFloat(s.paddingRight) > parseFloat(s.paddingLeft); }), "padding");
  await page.keyboard.press("Escape");
  // The context menu opens to the left of the pointer.
  const para = await rect("#ar [contenteditable=true] p");
  const at = { x: Math.round(para.left + 300), y: Math.round(para.top + 5) };
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.waitForTimeout(150);
  const ctx = await rect("#ar [data-rte-context]");
  check(`${name} (lang) the context menu opens to the left of the pointer, in the pack's words`, !!ctx && Math.abs(ctx.right - at.x) <= 1 && (await page.evaluate(() => document.querySelector("#ar [data-rte-context] [data-rte-menu-item=bold] [data-rte-part=label]").textContent)) === "غامق", { ctx, at });
  await page.keyboard.press("Escape");
  // A dialog: its words, its direction, and a problem that names the field in the pack's words.
  await page.evaluate(() => { const n = document.querySelector("#ar [contenteditable=true] p").firstChild; window.__ar.editor.selectDom(n, 0, n, 2); });
  await page.click("#ar [data-rte-part=toolbar] [data-rte-item=link]");
  await page.waitForTimeout(80);
  const dialog = "#ar dialog[open]";
  check(`${name} (lang) a dialog is in the pack's words and direction`, await page.evaluate((d) => { const e = document.querySelector(d); return e.getAttribute("dir") === "rtl" && e.querySelector("[data-rte-part=dialog-title]").textContent === "رابط" && e.querySelector("[data-rte-part=field-label]").textContent === "العنوان" && [...e.querySelectorAll("[data-rte-part=action]")].map((b) => b.textContent).join() === "إلغاء,موافق"; }, dialog), "dialog");
  await page.click(`${dialog} [data-rte-part=action][data-primary]`);
  check(`${name} (lang) a field's problem names the field in the pack's words`, (await page.evaluate((d) => document.querySelector(`${d} [data-rte-part=field-error]`).textContent, dialog)) === "العنوان مطلوب.", await page.evaluate((d) => document.querySelector(`${d} [data-rte-part=field-error]`)?.textContent, dialog));
  await page.keyboard.press("Escape");
  // The keyboard shortcuts list names each command in the pack's words.
  await page.click("#ar [data-rte-part=toolbar] [data-rte-item=shortcuts]");
  await page.waitForTimeout(80);
  check(`${name} (lang) the keyboard shortcuts list is in the pack's words`, await page.evaluate(() => { const d = document.querySelector("#ar dialog[data-rte-shortcuts]"); const cells = [...d.querySelectorAll("td")].map((c) => c.textContent); return d.querySelector("h2").textContent === "اختصارات لوحة المفاتيح" && cells.includes("غامق") && cells.includes("تراجع"); }), "shortcuts");
  await page.keyboard.press("Escape");
  // Plural forms: Arabic has six. Each count below falls in a different one, and the number is written the language's way.
  const forms = { 0: "zero", 1: "one", 2: "two", 3: "few", 11: "many", 100: "other" };
  for (const [n, form] of Object.entries(forms)) {
    await page.evaluate((k) => window.__ar.editor.setHtml(k === 0 ? "<p></p>" : `<p>${Array.from({ length: k }, () => "ب").join(" ")}</p>`), Number(n));
    await page.waitForTimeout(250);
    const want = await page.evaluate(([k, f]) => window.__packs.ar.messages["status.words"][f].replace("{count}", new Intl.NumberFormat("ar").format(k)), [Number(n), form]);
    const got = (await status("ar")).split(" · ")[0];
    check(`${name} (lang) ${n} words take the Arabic "${form}" form`, got === want, { got, want });
  }
  // Back to no pack: English again, and the interface takes the page's direction.
  await page.evaluate(() => window.__ar.ui.setStyle({ theme: "light" }));
  check(`${name} (lang) taking the pack away says English again and lets go of the language and direction`, JSON.stringify(await attrs("#ar [data-rte-part=toolbar]", "lang", "dir", "aria-label")) === JSON.stringify([null, null, "Formatting"]) && (await attrs("#ar [data-rte-part=toolbar] [data-rte-item=bold]", "aria-label"))[0] === "Bold", await attrs("#ar [data-rte-part=toolbar]", "lang", "dir", "aria-label"));
  // A pack that lacks a word says it in English.
  await page.evaluate(() => window.__ar.ui.setStyle({ theme: "light", locale: "ar", dir: "rtl", messages: { "item.bold": "غامق" } }));
  check(`${name} (lang) a word a pack lacks is said in English`, JSON.stringify([(await attrs("#ar [data-rte-part=toolbar] [data-rte-item=bold]", "aria-label"))[0], (await attrs("#ar [data-rte-part=toolbar] [data-rte-item=italic]", "aria-label"))[0]]) === JSON.stringify(["غامق", "Italic"]), "fallback");

  // German, given when the editor was made: two plural forms, German numbers, and the writing area's own words.
  check(`${name} (lang) a pack given at the start names the toolbar`, JSON.stringify(await attrs("#de [data-rte-part=toolbar]", "lang", "dir", "aria-label")) === JSON.stringify(["de", "ltr", "Formatierung"]), await attrs("#de [data-rte-part=toolbar]", "lang", "dir", "aria-label"));
  check(`${name} (lang) the writing area names a task's checkbox in the editor's words`, (await page.evaluate(() => document.querySelector("#de [data-rte-check]")?.getAttribute("aria-label"))) === "Erledigt", "task");
  await page.evaluate(() => { window.__de.editor.setHtml("<p>Ein Satz.</p>"); window.__de.editor.focus(); window.__de.editor.engine.commands.run("footnote.insert"); });
  await page.waitForTimeout(50);
  check(`${name} (lang) and a footnote and the list of notes`, JSON.stringify(await page.evaluate(() => [document.querySelector("#de sup[data-rte-note]")?.getAttribute("aria-label"), document.querySelector("#de [data-rte-notes]")?.getAttribute("aria-label")])) === JSON.stringify(["Fußnote 1", "Anmerkungen"]), await page.evaluate(() => [document.querySelector("#de sup[data-rte-note]")?.getAttribute("aria-label"), document.querySelector("#de [data-rte-notes]")?.getAttribute("aria-label")]));
  for (const [html, want] of [["<p>Wort</p>", "1 Wort · 4 Zeichen"], ["<p>zwei Wörter</p>", "2 Wörter · 11 Zeichen"], [`<p>${"a ".repeat(1234)}</p>`, "1.234 Wörter · 2.467 Zeichen"]]) {
    await page.evaluate((h) => window.__de.editor.setHtml(h), html);
    await page.waitForTimeout(250);
    check(`${name} (lang) the German status line says "${want}"`, (await status("de")) === want, await status("de"));
  }

  // A right-to-left page and no pack: the interface is mirrored by the page's direction alone, in English.
  const pageUndo = await rect("#page [data-rte-part=toolbar] [data-rte-item=undo]");
  const pageBold = await rect("#page [data-rte-part=toolbar] [data-rte-item=bold]");
  check(`${name} (lang) on a right-to-left page the toolbar is mirrored with no pack and no dir of its own`, pageUndo.left > pageBold.right && (await attrs("#page [data-rte-part=toolbar]", "dir"))[0] === null && (await attrs("#page [data-rte-part=toolbar] [data-rte-item=bold]", "aria-label"))[0] === "Bold", { pageUndo, pageBold });
  await page.evaluate(() => document.querySelector("#page [data-rte-part=toolbar] [data-rte-item=undo]").focus());
  await page.keyboard.press("ArrowLeft");
  check(`${name} (lang) and ArrowLeft moves to the next control`, (await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"))) === "redo", "page keys");
  check(`${name} (lang) the languages page raised no errors`, errors.length === 0, errors);
  await browser.close();
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
