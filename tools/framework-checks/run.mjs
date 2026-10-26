// Drives the wrappers, built against real React, Vue, Svelte, Angular and jQuery, in Chromium, Firefox and WebKit.
//   RTE_PLAYWRIGHT=<node_modules> RTE_PACK=<binary> tools/framework-checks/run.sh
import { createRequire } from "node:module";

const base = process.argv[2];
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
const apps = ["react", "vue", "svelte", "angular", "jquery"];

let failures = 0;
let passes = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else {
    failures++;
    console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`);
  }
};

for (const [engine, type] of engines) {
  const browser = await type.launch();
  for (const app of apps) {
    const name = `${engine} ${app}`;
    const context = await browser.newContext();
    const outside = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(url)) return route.continue();
      outside.push(url.slice(0, 80));
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(new URL(`/frameworks/dist/${app}.html`, base).href);
    await page.waitForFunction("window.__fw && window.__fw.ready === true");

    const surfaces = await page.locator("[contenteditable=true]").count();
    check(`${name} one live editing surface`, surfaces === 1, surfaces);
    check(`${name} surface has its name`, (await page.locator("[contenteditable=true]").getAttribute("aria-label")) === "Body", null);
    check(`${name} editor is ready`, await page.evaluate(() => window.__fw.readies >= 1 && !!window.__fw.editor), null);

    // Typing changes the document but not the bold button's state, so the button must not redraw.
    await page.locator("[contenteditable=true]").click();
    await page.keyboard.press("End");
    const before = await page.evaluate(() => window.__fw.commits());
    await page.keyboard.type("abcdefghijklmnopqrstuvwxy");
    const html = await page.evaluate(() => window.__fw.editor.getHtml());
    check(`${name} typing reaches the document`, html === "<p>one two threeabcdefghijklmnopqrstuvwxy</p>", html);
    const changes = await page.evaluate(() => window.__fw.changes.length);
    check(`${name} onChange reports edits`, changes >= 1, changes);
    check(`${name} and what it reports is the html`, await page.evaluate(() => window.__fw.changes.every((c) => typeof c === "string" && c.startsWith("<p>")) && window.__fw.changes.at(-1).includes("abcdefghijklmnopqrstuvwxy")), await page.evaluate(() => window.__fw.changes.slice(-2)));
    check(`${name} typing does not redraw the bold button`, (await page.evaluate(() => window.__fw.commits())) === before, { before, after: await page.evaluate(() => window.__fw.commits()) });

    // Selecting text does not change what bold reports, so nothing redraws; running bold turns it on, which redraws once.
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForTimeout(100);
    check(`${name} bold is available`, await page.locator("#bold").isEnabled(), null);
    check(`${name} selecting does not redraw the bold button`, (await page.evaluate(() => window.__fw.commits())) === before, await page.evaluate(() => window.__fw.commits()));
    await page.locator("#bold").click();
    await page.waitForTimeout(100);
    check(`${name} bold shows as on`, (await page.locator("#bold").getAttribute("aria-pressed")) === "true", null);
    check(`${name} one redraw for turning it on`, (await page.evaluate(() => window.__fw.commits())) === before + 1, await page.evaluate(() => window.__fw.commits()));
    check(`${name} bold reached the document`, (await page.evaluate(() => window.__fw.editor.getHtml())).includes("<strong>"), null);
    if (app === "svelte") check(`${name} Svelte's own derived store agrees`, await page.evaluate(() => window.__fw.extra.active() === true && window.__fw.extra.blocks() === 1), null);

    await page.evaluate(() => window.__fw.destroy());
    await page.waitForTimeout(50);
    const left = await page.locator("[contenteditable=true]").count();
    check(`${name} nothing left after teardown`, left === 0, left);
    const noisy = errors.filter((e) => !/Download the React DevTools/.test(e));
    check(`${name} no page errors`, noisy.length === 0, noisy);
    check(`${name} no outside requests`, outside.length === 0, outside);
    await context.close();
  }
  await browser.close();
}
// --- the examples in the READMEs, run as written (see readme.mjs)
const watchLogs = `window.__logs = []; for (const k of ["log", "error", "warn"]) { const o = console[k]; console[k] = (...a) => { window.__logs.push(k + ": " + a.map(String).join(" ")); o.apply(console, a); }; }`;
const examples = {
  "rte-core": async (page, name) => {
    await typeAtEnd(page, name, "[contenteditable=true]", "x");
    check(`${name} the surface is named Body and typing reaches the subscriber`, (await page.getAttribute("[contenteditable=true]", "aria-label")) === "Body" && (await logs(page)).some((l) => l.startsWith("log:") && l.includes("x")), await logs(page));
  },
  "rte-headless": async (page, name) => {
    check(`${name} the toolbar is named, has one tab stop, and has the buttons`, await page.evaluate(() => { const bar = document.querySelector("[role=toolbar]"); return bar.getAttribute("aria-label") === "Formatting" && [...bar.querySelectorAll("button")].filter((b) => b.tabIndex === 0).length === 1 && bar.querySelectorAll("button").length > 5; }), "toolbar");
    await boldSelection(page, name, '[data-rk-item="bold"]');
  },
  "rte-element": async (page, name) => {
    await typeAtEnd(page, name, "rk-editor [contenteditable=true]", "x");
    check(`${name} the element is defined and its change event carries the html`, (await page.evaluate(() => !!customElements.get("rk-editor"))) && (await logs(page)).some((l) => l.startsWith("log:") && l.includes("<p>") && l.includes("x")), await logs(page));
  },
  "rte-icons": async (page, name) => {
    check(`${name} the button shows the icon and the count of icons is logged`, (await page.evaluate(() => !!document.querySelector("button svg"))) && (await logs(page)).some((l) => /^log: \d+ icons/.test(l) && Number(l.split(" ")[1]) >= 20), await logs(page));
  },
  "rte-ui": async (page, name) => {
    await styledInterface(page, name, "rgb(255, 255, 255)", "light");
  },
  "rte-themes": async (page, name) => {
    await styledInterface(page, name, "rgb(16, 21, 29)", "dark");
  },
  "rte-react": async (page, name) => { await framework(page, name); },
  "rte-vue": async (page, name) => { await framework(page, name); },
  "rte-svelte": async (page, name) => { await framework(page, name); },
  "rte-angular": async (page, name) => { await framework(page, name); },
  "rte-jquery": async (page, name) => {
    await typeAtEnd(page, name, "rk-editor [contenteditable=true]", "x");
    check(`${name} the plugin builds the editor and rk:change hands over the html`, (await logs(page)).some((l) => l.startsWith("log:") && l.includes("<p>Hello") && l.includes("x")), await logs(page));
  },
};
const logs = (page) => page.evaluate(() => window.__logs);
async function typeAtEnd(page, name, selector, text) {
  await page.locator(selector).first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
  await page.waitForTimeout(100);
}
async function boldSelection(page, name, button) {
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.waitForTimeout(80);
  await page.click(button);
  await page.waitForTimeout(100);
  check(`${name} the Bold button bolds the selection`, await page.evaluate(() => document.querySelector("[contenteditable=true]").innerHTML.includes("<strong>")), await page.evaluate(() => document.querySelector("[contenteditable=true]").innerHTML));
}
async function styledInterface(page, name, background, theme) {
  await typeAtEnd(page, name, "[contenteditable=true]", "x");
  check(`${name} the interface is built with the ${theme} theme and typing is reported`, await page.evaluate(([bg, t]) => { const root = document.querySelector(".rk-root"); return !!root && root.getAttribute("data-rk-theme") === t && getComputedStyle(root).backgroundColor === bg && !!root.querySelector("[role=toolbar]"); }, [background, theme]) && (await logs(page)).some((l) => l.startsWith("log:") && l.includes("x")), await logs(page));
}
async function framework(page, name) {
  await typeAtEnd(page, name, "[contenteditable=true]", "x");
  check(`${name} the editor is named Body and typing is reported`, (await page.getAttribute("[contenteditable=true]", "aria-label")) === "Body" && (await logs(page)).some((l) => l.startsWith("log:") && l.includes("Hello") && l.includes("x")), await logs(page));
  await page.keyboard.press("ControlOrMeta+a");
  await page.waitForTimeout(80);
  await page.locator("button", { hasText: "Bold" }).click();
  await page.waitForTimeout(100);
  check(`${name} the Bold button runs the command and shows it on`, (await page.locator("button", { hasText: "Bold" }).getAttribute("aria-pressed")) === "true" && (await page.evaluate(() => document.querySelector("[contenteditable=true]").innerHTML.includes("<strong>"))), await page.evaluate(() => document.querySelector("[contenteditable=true]").innerHTML));
}
for (const [engine, type] of engines) {
  const browser = await type.launch();
  for (const [pkg, test] of Object.entries(examples)) {
    const name = `${engine} README ${pkg}`;
    const context = await browser.newContext({ permissions: [] });
    await context.addInitScript(watchLogs);
    const outside = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(url)) return route.continue();
      outside.push(url.slice(0, 80));
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(new URL(`/frameworks/dist/readme-${pkg}.html`, base).href);
    await page.waitForTimeout(400);
    await test(page, name);
    const problems = [...errors, ...(await logs(page)).filter((l) => l.startsWith("error:"))];
    check(`${name} runs without an error`, problems.length === 0, problems);
    check(`${name} asks for nothing from outside`, outside.length === 0, outside);
    await context.close();
  }
  await browser.close();
}

// --- Angular forms: the value accessor against the real @angular/forms, with a reactive control and an ngModel
for (const [engine, type] of engines) {
  const browser = await type.launch();
  const name = `${engine} angular forms`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.goto(new URL("/frameworks/dist/angular-forms.html", base).href);
  await page.waitForFunction("window.__fw && window.__fw.ready === true");
  await page.waitForTimeout(100);
  const surface = (label) => page.locator(`[role=textbox][aria-label="${label}"]`);
  const html = (label) => surface(label).evaluate((el) => el.innerHTML.replace(/ data-rte(-[a-z]+)?="[^"]*"/g, ""));
  check(`${name} the control's value is the starting document`, (await html("Control")).includes("control"), await html("Control"));
  check(`${name} the model's value is the starting document`, (await html("Model")).includes("model"), await html("Model"));
  check(`${name} setting the starting document did not count as a change`, await page.evaluate(() => window.__fw.values.length === 0 && window.__fw.control.dirty === false), await page.evaluate(() => window.__fw.values));
  check(`${name} the control is not touched before the editor is left`, await page.evaluate(() => window.__fw.control.touched === false), null);
  await surface("Control").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("xyz");
  await page.waitForTimeout(100);
  check(`${name} typing reaches the control as html, and the control is dirty`, await page.evaluate(() => window.__fw.control.value.includes("controlxyz") && window.__fw.control.value.startsWith("<p>") && window.__fw.control.dirty), await page.evaluate(() => window.__fw.control.value));
  await page.evaluate(() => window.__fw.control.setValue("<p>from code</p>"));
  await page.waitForTimeout(100);
  check(`${name} setting the control writes the editor, without echoing a change`, (await html("Control")).includes("from code") && (await page.evaluate(() => window.__fw.values.at(-1))) === "<p>from code</p>", await html("Control"));
  const seen = await page.evaluate(() => window.__fw.values.length);
  await page.waitForTimeout(100);
  check(`${name} and nothing more arrives afterwards`, (await page.evaluate(() => window.__fw.values.length)) === seen, seen);
  await page.evaluate(() => window.__fw.control.disable());
  await page.waitForTimeout(100);
  check(`${name} a disabled control makes the editor read-only`, (await surface("Control").getAttribute("contenteditable")) === "false", null);
  await page.evaluate(() => window.__fw.control.enable());
  await page.waitForTimeout(100);
  check(`${name} and enabling it makes it editable again`, (await surface("Control").getAttribute("contenteditable")) === "true", null);
  await page.evaluate(() => window.__fw.control.markAsUntouched());
  await surface("Control").click();
  await page.waitForTimeout(50);
  await surface("Model").click();
  check(`${name} leaving the editor touches the control`, await page.evaluate(() => window.__fw.control.touched === true), null);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("m");
  await page.waitForTimeout(100);
  check(`${name} ngModel follows typing`, await page.evaluate(() => window.__fw.model().includes("modelm")), await page.evaluate(() => window.__fw.model()));
  await page.evaluate(() => window.__fw.model.set("<p>set model</p>"));
  await page.waitForTimeout(150);
  check(`${name} and writes the editor when the model is set`, (await html("Model")).includes("set model"), await html("Model"));
  await page.evaluate(() => window.__fw.destroy());
  await page.waitForTimeout(50);
  check(`${name} nothing left after teardown`, (await page.locator("[contenteditable=true]").count()) === 0, null);
  check(`${name} no page errors`, errors.length === 0, errors);
  await browser.close();
}

console.log(`framework checks: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
