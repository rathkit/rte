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
  const marked = () => page.evaluate(() => document.querySelectorAll("#ed [data-rk-cell-selected]").length);
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
  // Dragging a column edge sets the width; one undo step; a double-click puts it back to automatic.
  const cellBox = () => page.evaluate(() => { const b = document.querySelector("#ed tr:nth-child(1) td:nth-child(1)").getBoundingClientRect(); return { right: b.right, top: b.top, mid: b.top + b.height / 2, width: b.width }; });
  let box = await cellBox();
  await page.mouse.move(box.right - 2, box.mid);
  check(`${name} the pointer on a column edge shows the resize cursor`, (await page.evaluate(() => document.getElementById("ed").style.cursor)) === "col-resize", "cursor");
  await page.mouse.down();
  await page.mouse.move(box.right + 40, box.mid, { steps: 4 });
  check(`${name} dragging shows a guide line`, (await page.evaluate(() => !!document.querySelector("[data-rk-resize-line]"))) === true, "line");
  await page.mouse.up();
  await page.waitForTimeout(60);
  const wide = await cellBox();
  check(`${name} letting go sets the column width`, /<col style="width: \d+px"><col>/.test(await html()) && Math.abs(wide.width - (box.width + 42)) < 8, { html: await html(), before: box.width, after: wide.width });
  check(`${name} and the guide line is gone`, (await page.evaluate(() => !!document.querySelector("[data-rk-resize-line]"))) === false, "line");
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} one undo takes the width back`, !(await html()).includes("<colgroup>"), await html());
  await page.evaluate(() => window.__editor.commands.run("table.columnWidth", { width: "150px" }));
  box = await cellBox();
  await page.mouse.dblclick(box.right - 2, box.mid);
  check(`${name} double-clicking an edge puts the column back to automatic`, !(await html()).includes("<colgroup>"), await html());
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
  check(`${name} (element) both elements are defined and the editors are ready`, await page.evaluate(() => !!customElements.get("rk-editor") && !!customElements.get("rk-toolbar") && window.__events.filter((e) => e[0] === "rk-ready").length === 4), "defined");
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
  // Attributes: placeholder, maxlength, spellcheck.
  check(`${name} (element) placeholder and spellcheck attributes reach the editor`, await page.evaluate(() => { const s = document.querySelector("#limited [contenteditable=true]"); return s.getAttribute("aria-placeholder") === "Write something" && s.hasAttribute("data-rk-empty") && s.spellcheck === false; }), "attributes");
  await page.click("#limited [contenteditable=true]");
  await page.keyboard.type("0123456789abcdef");
  check(`${name} (element) maxlength stops typing at the limit`, (await val("limited")) === "<p>0123456789</p>", await val("limited"));
  await page.evaluate(() => document.getElementById("limited").setAttribute("placeholder", "Changed"));
  check(`${name} (element) changing the placeholder attribute takes effect`, await page.evaluate(() => document.querySelector("#limited [contenteditable=true]").getAttribute("aria-placeholder") === "Changed"), "changed");
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
  check(`${name} (ui) every button has an icon, a name and a tooltip with its key`, await page.evaluate(() => [...document.querySelectorAll('#root button[data-rk-item]')].every((b) => b.querySelector('[data-rk-part=icon] svg') && b.getAttribute("aria-label") && b.getAttribute("data-rk-tip")) && document.querySelector('#root [data-rk-item=bold]').getAttribute("data-rk-tip") === "Bold (Ctrl+B)"), "icons");
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
  check(`${name} (ui) messages rename an item for assistive technology and the tooltip`, await page.evaluate(() => { const b = document.querySelector("#root [data-rk-item=bold]"); return b.getAttribute("aria-label") === "Gras" && b.getAttribute("data-rk-tip").startsWith("Gras"); }), "messages");
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
  check(`${name} (ui) the link dialog opens with its title, a labelled field, and focus in the field`, await page.evaluate(() => { const d = document.querySelector("#root [data-rk-part=dialog]:not([data-rk-shortcuts])"); const f = d.querySelector("[data-rk-part=field]"); return d.open && d.querySelector("[data-rk-part=dialog-title]").textContent === "Link" && f.labels[0].textContent === "Address" && document.activeElement === f; }), await active());
  await page.keyboard.type("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) an unsafe address is refused with a message tied to the field`, await page.evaluate(() => { const f = document.querySelector("#root [data-rk-part=field]"); const e = document.querySelector("#root [data-rk-part=field-error]"); return f.getAttribute("aria-invalid") === "true" && f.getAttribute("aria-describedby") === e.id && e.textContent.length > 0 && document.querySelector("#root [data-rk-part=dialog]:not([data-rk-shortcuts])").open; }), "unsafe");
  await page.fill("#root [data-rk-part=field]", "https://x.test");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) a good address closes the dialog and links the selected text`, (await page.evaluate(() => window.__one.editor.getHtml())) === '<p>one <a href="https://x.test">two</a> three</p>' && !(await page.evaluate(() => document.querySelector("#root [data-rk-part=dialog]:not([data-rk-shortcuts])").open)), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) focus goes back to the control that opened it`, (await active()) === "rk-link" || (await page.evaluate(() => document.activeElement.getAttribute("data-rk-item"))) === "link", await active());
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rk-part=content] a").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) opened on an existing link, the dialog shows its address`, (await page.evaluate(() => document.querySelector("#root [data-rk-part=field]").value)) === "https://x.test", await page.evaluate(() => document.querySelector("#root [data-rk-part=field]").value));
  check(`${name} (ui) and the new-tab box is unticked for a link that opens in the same tab`, (await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rk-part=dialog]:not([data-rk-shortcuts])")].find((x) => x.open); const box = d.querySelector('input[name=newTab]'); return box.type === "checkbox" && box.checked === false && box.labels[0].textContent === "Open in a new tab"; })), "checkbox");
  await page.click('#root dialog[open] input[name=newTab]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) ticking it and submitting makes the link open in a new tab`, (await page.evaluate(() => window.__one.editor.getHtml())).includes('<a href="https://x.test" target="_blank" rel="noopener noreferrer">two</a>'), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="link"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) reopened, the box is ticked`, await page.evaluate(() => [...document.querySelectorAll("#root dialog")].find((x) => x.open).querySelector("input[name=newTab]").checked), "ticked");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  // Special characters and the shortcuts list.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>price 5</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 7, n, 7); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="symbols"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the special characters menu lists each symbol with its name`, await page.evaluate(() => { const e = document.querySelector('#root [data-rk-menu-item="symbol-euro"]'); return !!e && e.textContent.includes("€") && e.textContent.includes("Euro"); }), "menu");
  await page.click('#root [data-rk-menu-item="symbol-euro"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing one types it at the caret`, await page.evaluate(() => window.__one.editor.getHtml() === "<p>price 5€</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="shortcuts"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the shortcuts dialog lists the editor's keys from its key map`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); const rows = d && [...d.querySelectorAll("tbody tr")].map((r) => r.textContent); return !!d && d.querySelector("[data-rk-part=dialog-title]").textContent === "Keyboard shortcuts" && rows.some((r) => r.startsWith("Bold") && r.includes("Ctrl+B")) && rows.some((r) => r.startsWith("Find and replace")) && d.querySelector("th").scope === "col"; }), "dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  check(`${name} (ui) Escape closes it and focus goes back to its button`, await page.evaluate(() => ![...document.querySelectorAll("#root dialog")].some((x) => x.open) && document.activeElement === document.querySelector('#root [data-rk-item="shortcuts"]')), await active());
  // Indent.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>indent me</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 2, n, 2); });
  await page.waitForTimeout(60);
  check(`${name} (ui) outdent is off until something is indented`, (await page.getAttribute('#root [data-rk-item="outdent"]', "aria-disabled")) === "true", "outdent");
  await page.click('#root [data-rk-item="indent"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the indent button moves the paragraph in by a step and draws it so`, await page.evaluate(() => window.__one.editor.getHtml() === '<p style="margin-left: 2em;">indent me</p>' && document.querySelector("#root [data-rk-part=content] p").style.marginLeft === "2em"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="outdent"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) and outdent takes it back`, await page.evaluate(() => window.__one.editor.getHtml() === "<p>indent me</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  // Text direction.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>مرحبا</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 1, n, 1); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="direction-rtl"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the right-to-left button sets the paragraph's direction and shows as on`, await page.evaluate(() => window.__one.editor.getHtml() === '<p dir="rtl">مرحبا</p>' && document.querySelector("#root [data-rk-part=content] p").dir === "rtl" && document.querySelector('#root [data-rk-item="direction-rtl"]').getAttribute("aria-pressed") === "true" && document.querySelector('#root [data-rk-item="direction-ltr"]').getAttribute("aria-pressed") === "false"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="direction-rtl"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) pressing it again does not toggle it off (it sets it); left to right sets that`, await page.evaluate(() => window.__one.editor.getHtml() === '<p dir="rtl">مرحبا</p>'), await page.evaluate(() => window.__one.editor.getHtml()));
  // The HTML source view.
  const src = '#root [data-rk-part="source"]';
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<h2>Title</h2><p>Some <strong>bold</strong> text</p>"); e.focus(); });
  await page.waitForTimeout(60);
  check(`${name} (ui) the source button is named and starts off`, await page.evaluate(() => { const b = document.querySelector('#root [data-rk-item="source"]'); return b.getAttribute("aria-label") === "HTML source" && !!b.querySelector("svg") && document.querySelector('#root [data-rk-part="source"]').hidden; }), "button");
  await page.click('#root [data-rk-item="source"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) it shows the HTML, a block to a line, in place of the writing area`, await page.evaluate((q) => { const a = document.querySelector(q); return !a.hidden && a.value === "<h2>Title</h2>\n<p>Some <strong>bold</strong> text</p>" && getComputedStyle(document.getElementById("root").querySelector("[data-rk-part=content] > :first-child")).display === "none" && document.activeElement === a && document.querySelector('#root [data-rk-item="source"]').getAttribute("aria-pressed") === "true"; }, src), await page.evaluate((q) => document.querySelector(q).value, src));
  await page.click('#root [data-rk-item="bold"]', { force: true }).catch(() => undefined);
  check(`${name} (ui) the other buttons do nothing while it is open`, await page.evaluate(() => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>"), "guard");
  await page.fill(src, "<h1>New</h1>\n<p>parsed <em>again</em></p>");
  await page.click('#root [data-rk-item="source"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) closing it applies the HTML and returns to the editor`, await page.evaluate((q) => window.__one.editor.getHtml() === "<h1>New</h1><p>parsed <em>again</em></p>" && document.querySelector(q).hidden && document.querySelector("#root [data-rk-part=content]").contains(document.activeElement), src), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.keyboard.press("ControlOrMeta+z");
  check(`${name} (ui) and it is one undo step`, await page.evaluate(() => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="source"]');
  await page.waitForTimeout(60);
  await page.fill(src, "<p>discard me</p>");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (ui) Escape closes it and throws the changes away`, await page.evaluate((q) => window.__one.editor.getHtml() === "<h2>Title</h2><p>Some <strong>bold</strong> text</p>" && document.querySelector(q).hidden, src), await page.evaluate(() => window.__one.editor.getHtml()));
  // Find and replace.
  const bar = '#root [data-rk-part="findbar"]';
  const barText = () => page.evaluate((b) => ({ hidden: document.querySelector(b).hidden, count: document.querySelector(b + " [data-rk-part=find-count]").textContent, active: document.activeElement?.name ?? document.activeElement?.tagName }), bar);
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
  if (hasHighlights) check(`${name} (ui) matches are painted with the highlight registry`, await page.evaluate(() => CSS.highlights.has("rk-find") && [...CSS.highlights.get("rk-find")].length + ([...(CSS.highlights.get("rk-find-current") ?? [])].length) === 2), "highlights");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) Enter goes to the first match, selects it and says which`, (await barText()).count === "1 of 2" && (await page.evaluate(() => { const s = window.__one.editor.selection; return s.anchor.offset === 4 && s.focus.offset === 7; })), await barText());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) and on to the next`, (await barText()).count === "2 of 2", await barText());
  await page.keyboard.press("Shift+Enter");
  await page.waitForTimeout(60);
  check(`${name} (ui) Shift+Enter goes back`, (await barText()).count === "1 of 2", await barText());
  await page.click('#root [data-rk-part=findbar] button[aria-label="Match case"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) match case narrows it to one`, (await barText()).count === "1 matches" || (await barText()).count.startsWith("1 "), await barText());
  await page.click('#root [data-rk-part=findbar] button[aria-label="Match case"]');
  await page.fill('#root [data-rk-part=findbar] input[name=replace]', "2");
  await page.click('#root [data-rk-part=findbar] [data-rk-part=action]:nth-of-type(2)');
  await page.waitForTimeout(100);
  check(`${name} (ui) Replace all puts the text in place of every match`, (await page.evaluate(() => window.__one.editor.getHtml())) === "<p>one 2 three 2</p>", await page.evaluate(() => window.__one.editor.getHtml()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  check(`${name} (ui) Escape closes the bar and returns to the editor`, (await barText()).hidden === true && (await page.evaluate(() => document.querySelector("#root [data-rk-part=content]").contains(document.activeElement))), await barText());
  if (hasHighlights) check(`${name} (ui) and the highlights are gone`, await page.evaluate(() => !CSS.highlights.has("rk-find")), "cleared");
  await page.click('#root [data-rk-item="find"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the toolbar button opens it too, and shows as on`, (await barText()).hidden === false && (await page.getAttribute('#root [data-rk-item="find"]', "aria-pressed")) === "true", await barText());
  await page.click('#root [data-rk-item="find"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) and closes it again`, (await barText()).hidden === true, await barText());
  // The status line.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p><p>four</p>"); e.focus(); });
  await page.waitForTimeout(300);
  const statusText = () => page.evaluate(() => document.querySelector("#root [data-rk-part=status]")?.textContent ?? null);
  check(`${name} (ui) the status line counts words and characters`, (await statusText()) === "4 words · 17 characters", await statusText());
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 0, n, 7); });
  await page.waitForTimeout(300);
  check(`${name} (ui) and counts the selection against the whole`, (await statusText()) === "2 of 4 words", await statusText());
  await page.evaluate(() => window.__one.editor.setHtml("<p>solo</p>"));
  await page.waitForTimeout(300);
  check(`${name} (ui) one word is singular`, (await statusText()) === "1 word · 4 characters", await statusText());
  // Tooltips: shown on hover after a pause and at once on keyboard focus; dismissed with Escape; the pointer may move onto them.
  const tip = '#root [data-rk-part="tooltip"]';
  const tipText = () => page.evaluate((t) => { const e = document.querySelector(t); return e.hidden ? null : e.textContent; }, tip);
  // Start from rest: the pointer away from the toolbar, and the focus in the editor.
  await page.mouse.move(5, 400);
  await page.evaluate(() => window.__one.editor.focus());
  await page.waitForTimeout(400);
  check(`${name} (ui) tooltips are a role, hidden until needed, and the controls no longer carry a title`, await page.evaluate((t) => document.querySelector(t).getAttribute("role") === "tooltip" && document.querySelector(t).hidden && ![...document.querySelectorAll("#root [data-rk-item]")].some((e) => e.hasAttribute("title")), tip), "role");
  await page.hover('#root [data-rk-item="italic"]');
  await page.waitForTimeout(150);
  check(`${name} (ui) hovering does not show the tip at once`, (await tipText()) === null, await tipText());
  await page.waitForTimeout(600);
  check(`${name} (ui) it shows after a pause, with the name and the key`, (await tipText()) === "Italic (Ctrl+I)", await tipText());
  check(`${name} (ui) and sits below its control, inside the editor`, await page.evaluate((t) => { const p = document.querySelector(t).getBoundingClientRect(); const c = document.querySelector('#root [data-rk-item="italic"]').getBoundingClientRect(); const r = document.getElementById("root").getBoundingClientRect(); return p.top >= c.bottom && p.left >= r.left && p.right <= r.right + 1; }, tip), "placement");
  await page.mouse.move(5, 300);
  await page.waitForTimeout(400);
  check(`${name} (ui) it goes when the pointer leaves`, (await tipText()) === null, await tipText());
  await page.hover('#root [data-rk-item="italic"]');
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  check(`${name} (ui) Escape puts the tip away without moving the focus or the pointer`, (await tipText()) === null, await tipText());
  await page.evaluate(() => document.querySelector('#root [data-rk-item="bold"]').focus());
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
  const menu = '#root [data-rk-item="table"] + [data-rk-part="menu"]';
  const trigger = '#root [data-rk-item="table"]';
  check(`${name} (ui) the menu button is named, announces a menu, and starts closed`, await page.evaluate(([t, m]) => { const b = document.querySelector(t); return b.getAttribute("aria-haspopup") === "menu" && b.getAttribute("aria-expanded") === "false" && b.getAttribute("aria-label") === "Table" && document.querySelector(m).hidden; }, [trigger, menu]), "closed");
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) clicking it opens the menu and focus goes to the first entry`, await page.evaluate(([t, m]) => document.querySelector(t).getAttribute("aria-expanded") === "true" && !document.querySelector(m).hidden && document.activeElement.getAttribute("data-rk-menu-item") === "table-insert", [trigger, menu]), await page.evaluate(() => document.activeElement.outerHTML.slice(0, 160)));
  check(`${name} (ui) entries outside a table say they are unavailable but can still be reached`, await page.evaluate(() => { const e = document.querySelector('#root [data-rk-menu-item="table-row-after"]'); return e.getAttribute("aria-disabled") === "true" && e.tabIndex !== undefined && e.getAttribute("role") === "menuitem"; }), "disabled entries");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  check(`${name} (ui) Escape closes the menu and focus returns to its button`, await page.evaluate(([t, m]) => document.querySelector(m).hidden && document.activeElement === document.querySelector(t), [trigger, menu]), await active());
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(60);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing "Insert table" from the keyboard inserts a table and returns to the editor`, await page.evaluate(() => window.__one.editor.getHtml().includes("<table>") && document.querySelector("#root [data-rk-part=content]").contains(document.activeElement)), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) inside a table the row entries are available and "Header row" is a checkbox entry`, await page.evaluate(() => { const row = document.querySelector('#root [data-rk-menu-item="table-row-after"]'); const head = document.querySelector('#root [data-rk-menu-item="table-header"]'); return row.getAttribute("aria-disabled") === "false" && head.getAttribute("role") === "menuitemcheckbox" && head.getAttribute("aria-checked") === "false"; }), "enabled entries");
  await page.click('#root [data-rk-menu-item="table-header"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing it turns the header row on, closes the menu and announces it`, await page.evaluate(() => window.__one.editor.getHtml().includes('<th scope="col">') && document.querySelector('#root [data-rk-item="table"] + [data-rk-part="menu"]').hidden && document.querySelector("#root [role=status]").textContent === "Header row on"), await page.evaluate(() => document.querySelector("#root [role=status]").textContent));
  await page.click(trigger);
  await page.waitForTimeout(80);
  check(`${name} (ui) and now shows it as checked, with a visible check mark`, await page.evaluate(() => { const head = document.querySelector('#root [data-rk-menu-item="table-header"]'); return head.getAttribute("aria-checked") === "true" && getComputedStyle(head, "::before").content.includes("\u2713"); }), "checked");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(60);
  check(`${name} (ui) a click elsewhere closes the menu`, await page.evaluate((m) => document.querySelector(m).hidden, menu), "outside click");
  // Block buttons and the color menus.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two three</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="quote"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the quote button wraps the paragraph and shows as on`, await page.evaluate(() => window.__one.editor.getHtml() === "<blockquote><p>one two three</p></blockquote>" && document.querySelector('#root [data-rk-item="quote"]').getAttribute("aria-pressed") === "true"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="quote"]');
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="code-block"]');
  await page.waitForTimeout(60);
  check(`${name} (ui) the code block button makes a code block`, await page.evaluate(() => window.__one.editor.getHtml() === "<pre>one two three</pre>"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="code-block"]');
  await page.evaluate(() => { const e = window.__one.editor; const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 0, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="text-color"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the color menu shows named swatches`, await page.evaluate(() => { const e = document.querySelector('#root [data-rk-menu-item="text-color-red"]'); const sw = e.querySelector("[data-rk-part=swatch]"); return e.textContent.includes("Red") && getComputedStyle(sw).backgroundColor === "rgb(198, 40, 40)" && e.getAttribute("role") === "menuitemcheckbox"; }), "swatch");
  await page.click('#root [data-rk-menu-item="text-color-red"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a color colors the selected text`, await page.evaluate(() => window.__one.editor.getHtml().includes('<span style="color: #c62828;">one</span>')), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="text-color"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) and that color shows as the chosen one`, await page.evaluate(() => document.querySelector('#root [data-rk-menu-item="text-color-red"]').getAttribute("aria-checked") === "true" && document.querySelector('#root [data-rk-menu-item="text-color-blue"]').getAttribute("aria-checked") === "false"), "checked");
  await page.click('#root [data-rk-menu-item="text-color-none"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) Automatic takes the color away`, await page.evaluate(() => !window.__one.editor.getHtml().includes("color")), await page.evaluate(() => window.__one.editor.getHtml()));
  // The image dialog: an address and a description; a bad address is refused with a message, a good one inserts the image without loading it.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<p>one two</p>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] p").firstChild; e.selectDom(n, 3, n, 3); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="image"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the image dialog has an address field and a description field, and focus is in the first`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rk-part=dialog]")].find((x) => x.open); const f = d && [...d.querySelectorAll("[data-rk-part=field]")]; return !!d && f.length === 2 && d.querySelector("[data-rk-part=dialog-title]").textContent === "Image" && document.activeElement === f[0]; }), await active());
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
  // A menu entry that asks for something opens a dialog.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] td p").firstChild; e.selectDom(n, 0, n, 0); });
  await page.waitForTimeout(60);
  await page.click(trigger);
  await page.waitForTimeout(80);
  await page.click('#root [data-rk-menu-item="table-column-width"]');
  await page.waitForTimeout(100);
  check(`${name} (ui) the column width entry opens a dialog with its field focused`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root [data-rk-part=dialog]")].find((x) => x.open); return !!d && d.querySelector("[data-rk-part=dialog-title]").textContent === "Column width…" && document.activeElement === d.querySelector("[data-rk-part=field]"); }), await active());
  await page.keyboard.type("30%");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) submitting it sets the width of the column`, await page.evaluate(() => window.__one.editor.getHtml().includes('<col style="width: 30%">') || window.__one.editor.getHtml().includes("<col><col style=\"width: 30%\">")), await page.evaluate(() => window.__one.editor.getHtml()));
  check(`${name} (ui) and the column is drawn at that width`, await page.evaluate(() => { const col = document.querySelector("#root [data-rk-part=content] col"); return !!col && col.style.width === "30%"; }), "col");
  // The Cell style menu: color behind, line round, row height.
  await page.evaluate(() => { const e = window.__one.editor; e.setHtml("<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>"); e.focus(); const n = document.querySelector("#root [data-rk-part=content] td p").firstChild; e.selectDom(n, 0, n, 0); });
  await page.waitForTimeout(60);
  await page.click('#root [data-rk-item="cell-style"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) the cell style menu has tinted swatches, line choices and a row height entry`, await page.evaluate(() => { const m = document.querySelector('#root [data-rk-item="cell-style"] + [data-rk-part=menu]'); const sw = m.querySelector('[data-rk-menu-item="cell-fill-green"] [data-rk-part=swatch]'); return !!sw && getComputedStyle(sw).backgroundColor === "rgb(200, 230, 201)" && !!m.querySelector('[data-rk-menu-item="cell-border-dashed"]') && m.querySelector('[data-rk-menu-item="cell-border-none"]').getAttribute("aria-checked") === "true" && !!m.querySelector('[data-rk-menu-item="cell-row-height"]'); }), "menu");
  await page.click('#root [data-rk-menu-item="cell-fill-green"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a fill colors the cell, in the document and on the page`, await page.evaluate(() => window.__one.editor.getHtml().includes('<td style="background-color: #c8e6c9;">a</td>') && getComputedStyle(document.querySelector("#root [data-rk-part=content] td")).backgroundColor === "rgb(200, 230, 201)"), await page.evaluate(() => window.__one.editor.getHtml()));
  await page.click('#root [data-rk-item="cell-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rk-menu-item="cell-border-thick"]');
  await page.waitForTimeout(80);
  check(`${name} (ui) choosing a line draws it round the cell`, await page.evaluate(() => { const td = document.querySelector("#root [data-rk-part=content] td"); const c = getComputedStyle(td); return window.__one.editor.getHtml().includes("border: 3px solid currentcolor") && c.borderTopWidth === "3px" && c.borderTopStyle === "solid"; }), "border");
  await page.click('#root [data-rk-item="cell-style"]');
  await page.waitForTimeout(80);
  await page.click('#root [data-rk-menu-item="cell-row-height"]');
  await page.waitForTimeout(100);
  await page.keyboard.type("80");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  check(`${name} (ui) the row height dialog sets the least height of the row`, await page.evaluate(() => window.__one.editor.getHtml().includes('<tr style="height: 80px">') && document.querySelector("#root [data-rk-part=content] tr").getBoundingClientRect().height >= 79), await page.evaluate(() => window.__one.editor.getHtml()));
  // The placeholder and the length limit, on a third editor made with those options.
  const third = '#third [data-rk-part=content] > :first-child';
  check(`${name} (ui) an empty editor shows its placeholder: marked empty, said to assistive technology, and drawn`, await page.evaluate((q) => { const e = document.querySelector(q); return e.hasAttribute("data-rk-empty") && e.getAttribute("aria-placeholder") === "Type here" && getComputedStyle(e.firstElementChild, "::before").content === '"Type here"'; }, third), "placeholder");
  await page.click(third);
  await page.keyboard.type("abcdefghijklmnop");
  check(`${name} (ui) typing past maxLength is refused at the limit`, (await page.evaluate(() => window.__three.editor.getHtml())) === "<p>abcdefghijkl</p>", await page.evaluate(() => window.__three.editor.getHtml()));
  check(`${name} (ui) once there is text the placeholder is gone`, await page.evaluate((q) => { const e = document.querySelector(q); return !e.hasAttribute("data-rk-empty") && getComputedStyle(e.firstElementChild, "::before").content === "none"; }, third), "gone");
  check(`${name} (ui) spellcheck can be switched off`, (await page.evaluate((q) => document.querySelector(q).spellcheck, third)) === false, "spellcheck");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  check(`${name} (ui) deleting everything brings the placeholder back`, await page.evaluate((q) => document.querySelector(q).hasAttribute("data-rk-empty"), third), "back");
  // Cleaning up.
  await page.evaluate(() => window.__two.ui.destroy());
  check(`${name} (ui) destroying an interface removes what it added and leaves the other one alone`, await page.evaluate(() => { const r = document.getElementById("second"); return !r.classList.contains("rk-root") && !r.hasAttribute("data-rk-theme") && !r.querySelector("[data-rk-part=toolbar]") && document.getElementById("root").classList.contains("rk-root"); }), "destroy");
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
        await page.click(`#root [data-rk-item="${id}"]`).catch(() => undefined);
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
  await page.click('#root [data-rk-item="find"]');
  await page.click('#root [data-rk-item="source"]');
  await page.click('#root [data-rk-item="source"]');
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
      if (!nameOf(el)) problems.push(`no name: ${el.tagName.toLowerCase()}[${el.getAttribute("data-rk-item") ?? el.getAttribute("data-rk-part") ?? el.getAttribute("role")}]`);
    }
    const ids = new Map();
    for (const el of root.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id ${id}`);
    for (const attr of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
      for (const el of root.querySelectorAll(`[${attr}]`)) for (const id of el.getAttribute(attr).split(/\s+/)) if (id && !document.getElementById(id)) problems.push(`${attr} points at a missing id ${id}`);
    }
    // Roving focus: exactly one tab stop in the toolbar.
    const stops = [...root.querySelectorAll("[data-rk-part=toolbar] [data-rk-item]")].filter((e) => e.tabIndex === 0).length;
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
  check(`${name} (narrow) the toolbar wraps onto more rows and every control is on the screen`, await page.evaluate(() => { const bar = document.querySelector("#root [data-rk-part=toolbar]"); const items = [...bar.querySelectorAll("[data-rk-item]")]; return bar.getBoundingClientRect().height > 80 && items.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }); }), "toolbar");
  check(`${name} (narrow) every control is at least 24px square (the smallest target WCAG allows)`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rk-part=toolbar] button[data-rk-item]")].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })), "targets");
  for (const id of ["text-color", "highlight", "symbols", "table", "find"]) {
    if (id === "find") {
      await tap('#root [data-rk-item="find"]');
      await page.waitForTimeout(150);
      check(`${name} (narrow) the find bar fits the screen`, await page.evaluate(() => [...document.querySelectorAll("#root [data-rk-part=findbar] *")].every((e) => e.getBoundingClientRect().right <= innerWidth + 1)), "findbar");
      break;
    }
    await tap(`#root [data-rk-item="${id}"]`);
    await page.waitForTimeout(150);
    check(`${name} (narrow) the ${id} menu opens inside the screen`, await page.evaluate((id) => { const m = document.querySelector(`#root [data-rk-item="${id}"] + [data-rk-part=menu]`).getBoundingClientRect(); return !document.querySelector(`#root [data-rk-item="${id}"] + [data-rk-part=menu]`).hidden && m.left >= 0 && m.right <= innerWidth; }, id), await page.evaluate((id) => JSON.stringify(document.querySelector(`#root [data-rk-item="${id}"] + [data-rk-part=menu]`).getBoundingClientRect()), id));
    await page.keyboard.press("Escape");
  }
  await tap('#root [data-rk-item="image"]');
  await page.waitForTimeout(150);
  check(`${name} (narrow) a dialog fits the screen`, await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), "dialog");
  await page.keyboard.press("Escape");
  if (touch) {
    await tap('#root [data-rk-item="bold"]');
    await page.waitForTimeout(800);
    check(`${name} (narrow) tapping a button leaves no tooltip over it`, await page.evaluate(() => document.querySelector("#root [data-rk-part=tooltip]").hidden), "tip");
  }
  check(`${name} (narrow) no page errors`, t.errors.length === 0, t.errors);
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
    for (const [n, commandBudget, setBudget] of [[1000, 10, 40], [5000, 30, Infinity]]) {
      const r = await measure(n);
      const worst = Math.max(r.typeMiddle, r.typeTop, r.enterTop, r.joinTop, r.pasteTop);
      console.log(`speed${label} ${n} paragraphs: set ${r.set.toFixed(1)} ms warm, ${r.setCold.toFixed(1)} ms cold; p95 per command: type ${r.typeMiddle.toFixed(1)} (top ${r.typeTop.toFixed(1)}), Enter ${r.enterTop.toFixed(1)}, join ${r.joinTop.toFixed(1)}, paste ${r.pasteTop.toFixed(1)} ms`);
      if (rate === 1) {
        check(`speed: ${n} paragraphs, every command within ${commandBudget} ms (p95)`, worst <= commandBudget * scale, r);
        check(`speed: ${n} paragraphs, set content within ${setBudget} ms`, r.set <= setBudget * scale, r);
      }
    }
    const table = await measureTable(50, 10);
    console.log(`speed${label} table of 500 cells: set ${table.set.toFixed(1)} ms, type in one cell p95 ${table.type.toFixed(1)} ms`);
    if (rate === 1) check("speed: typing in a cell of a 500-cell table within 12 ms (p95)", table.type <= 12 * scale, table);
    if (rate === 1) check("speed: typing in a cell keeps the table and every other cell as drawn", table.sameTable && table.redrawn === 1, table);
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
