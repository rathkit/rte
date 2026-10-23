// Drives the wrappers, built against real React, Vue, Svelte and jQuery, in Chromium, Firefox and WebKit.
//   RTE_PLAYWRIGHT=<node_modules> RTE_PACK=<binary> tools/framework-checks/run.sh
import { createRequire } from "node:module";

const base = process.argv[2];
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
const apps = ["react", "vue", "svelte", "jquery"];

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
    check(`${name} typing does not redraw the bold button`, (await page.evaluate(() => window.__fw.commits())) === before, { before, after: await page.evaluate(() => window.__fw.commits()) });

    // A selection makes bold available (one redraw); running it turns it on (one more).
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForFunction(() => !document.getElementById("bold").disabled, null, { timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(50);
    check(`${name} a selection enables bold`, await page.locator("#bold").isEnabled(), null);
    check(`${name} one redraw for that`, (await page.evaluate(() => window.__fw.commits())) === before + 1, await page.evaluate(() => window.__fw.commits()));
    await page.locator("#bold").click();
    check(`${name} bold shows as on`, (await page.locator("#bold").getAttribute("aria-pressed")) === "true", null);
    check(`${name} one more redraw`, (await page.evaluate(() => window.__fw.commits())) === before + 2, await page.evaluate(() => window.__fw.commits()));
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
console.log(`framework checks: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
