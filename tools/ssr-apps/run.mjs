// Drives one server-rendered app in Chromium, Firefox and WebKit: the HTML a server sends, then the page after the browser has hydrated it.
//   RTE_PLAYWRIGHT=<node_modules> tools/ssr-apps/run.sh <app>        (builds and serves the app in a container; see run.sh)
// Every app page sets window.__ssr = { ready: true, editor } once the editor exists on the client.
import { createRequire } from "node:module";

const [app, base] = process.argv.slice(2);
const require = createRequire(`${process.env.RTE_PLAYWRIGHT}/`);
const { chromium, firefox, webkit } = require("playwright");
const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];

let passes = 0;
let failures = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else { failures++; console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`); }
};

// ---- what the server sends, before any script runs -----------------------------------------------------------------------------------
const html = await (await fetch(base)).text();
const surface = /<div[^>]*aria-label="Body"[^>]*data-rte-surface|<div[^>]*data-rte-surface[^>]*aria-label="Body"/.test(html);
check(`${app} server HTML has the named surface`, surface, html.slice(0, 300));
check(`${app} server HTML has no live editing surface or content`, !/contenteditable|>[^<]*one two three/.test(html), html.slice(0, 300));

// ---- the page in each engine ---------------------------------------------------------------------------------------------------------
for (const [engine, type] of engines) {
  const name = `${engine} ${app}`;
  const browser = await type.launch();
  const context = await browser.newContext();
  const outside = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(base) || /^(data:|blob:|about:)/.test(url)) return route.continue();
    outside.push(url.slice(0, 80));
    return route.abort();
  });
  const page = await context.newPage();
  // A hydration mismatch is reported by the frameworks as an error or a warning on the console, so both count.
  const said = [];
  page.on("pageerror", (e) => said.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") said.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  await page.goto(base);
  const ready = await page.waitForFunction("window.__ssr && window.__ssr.ready === true", null, { timeout: 15000 }).then(() => true, () => false);
  check(`${name} the editor is made on the client`, ready, { said, outside });
  if (!ready) { await browser.close(); continue; }

  const live = page.locator("[contenteditable=true][aria-label=Body]");
  check(`${name} one live editing surface after hydrating`, (await live.count()) === 1, await live.count());
  check(`${name} the surface kept its name`, (await live.getAttribute("aria-label")) === "Body", null);
  check(`${name} the content arrived`, (await live.innerText()).includes("one two three"), await live.innerText());
  await live.click();
  await page.keyboard.type("hello");
  check(`${name} typing reaches the document`, (await live.innerText()).includes("hello"), await live.innerText());
  check(`${name} says nothing on the console (no warning, no mismatch)`, said.length === 0, said);
  check(`${name} asked for nothing outside the app`, outside.length === 0, outside);
  await browser.close();
}
console.log(`${app}: ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
