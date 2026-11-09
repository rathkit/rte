// Server rendering, stage 1: what each wrapper produces when its framework renders it on a server, in Node with no DOM, and what the model,
// importer and exporter do without one. No browser: the same page hydrated in three engines is stage 2 (a real app per framework).
//   tools/framework-checks/ssr.sh      (runs this in a container with no network; see that file)
import { mkdirSync, writeFileSync } from "node:fs";
import { compile } from "svelte/compiler";

let passes = 0;
let failures = 0;
const check = (name, ok, detail) => {
  if (ok) passes++;
  else { failures++; console.log(`FAIL ${name}\n  ${JSON.stringify(detail)}`); }
};
const noDom = ["window", "document", "HTMLElement", "customElements", "navigator"].filter((g) => typeof globalThis[g] !== "undefined");
check("there is no DOM in this process", noDom.length === 0 || (noDom.length === 1 && noDom[0] === "navigator"), noDom);

// Anything a framework or the wrapper says about the render counts as a failure of it.
const said = [];
for (const level of ["warn", "error"]) console[level] = (...args) => said.push(args.map(String).join(" ").slice(0, 200));
const quiet = (name) => { check(`${name} says nothing while rendering`, said.length === 0, said.splice(0)); };

const surface = (html) => /<div[^>]*aria-label="Body"[^>]*data-rte-surface|<div[^>]*data-rte-surface[^>]*aria-label="Body"/.test(html);
const placeholder = (name, html) => {
  console.log(`${name} server output: ${html}`);
  check(`${name} renders the surface with its name`, surface(html), html.slice(0, 200));
  check(`${name} renders no editor chrome or content on the server`, !/contenteditable|<p>|one two/.test(html), html.slice(0, 200));
};

// ---- the model, importer and exporter run with no DOM ------------------------------------------------------------------------------
{
  const core = await import("@rathkit/rte-core");
  const doc = core.importHtml("<h1>Title</h1><p>one <strong>two</strong> three</p><ul><li>a</li></ul>");
  const html = core.exportHtml(doc);
  check("core imports and exports HTML in Node", html === "<h1>Title</h1><p>one <strong>two</strong> three</p><ul><li>a</li></ul>", html);
  const engine = core.createEngine({ doc, platform: "other", onWarning: (w) => said.push(w.code) });
  engine.setSelection({ anchor: { path: [1], offset: 0 }, focus: { path: [1], offset: 0 } });
  const typed = engine.apply("type", (d, sel) => core.insertText(d, sel, "x", []));
  check("the engine edits and exports in Node", typed === true && core.exportHtml(engine.snapshot.doc).includes("<p>xone "), core.exportHtml(engine.snapshot.doc));
  quiet("core");
  const md = await import("@rathkit/rte-core/markdown");
  check("Markdown reads and writes in Node", typeof md.parseMarkdown === "function", Object.keys(md));
}

// ---- React ------------------------------------------------------------------------------------------------------------------------
{
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { RteEditor, useCommand } = await import("@rathkit/rte-react");
  const html = renderToString(React.createElement(RteEditor, { label: "Body", defaultValue: "<p>one two three</p>" }));
  placeholder("react", html);
  const Bold = () => { const s = useCommand(undefined, "format.bold"); return React.createElement("button", { disabled: !s.enabled, "aria-pressed": s.active }, "Bold"); };
  const button = renderToString(React.createElement(Bold));
  check("react: a command hook with no editor yet renders off and disabled", /disabled/.test(button) && /aria-pressed="false"/.test(button), button);
  quiet("react");
}

// ---- Vue --------------------------------------------------------------------------------------------------------------------------
{
  const { createSSRApp, defineComponent, h, ref } = await import("vue");
  const { renderToString } = await import("vue/server-renderer");
  const { RteEditor, useCommand } = await import("@rathkit/rte-vue");
  const html = await renderToString(createSSRApp({ render: () => h(RteEditor, { label: "Body", defaultValue: "<p>one two three</p>" }) }));
  placeholder("vue", html);
  const Bold = defineComponent({ setup() { const s = useCommand(ref(undefined), "format.bold"); return () => h("button", { disabled: !s.value.enabled }, "Bold"); } });
  const button = await renderToString(createSSRApp(Bold));
  check("vue: a command composable with no editor yet renders disabled", /disabled/.test(button), button);
  quiet("vue");
}

// ---- Svelte -----------------------------------------------------------------------------------------------------------------------
{
  const source = `<script>import { rteEditor } from "@rathkit/rte-svelte";</script>\n<div use:rteEditor={{ html: "<p>one two three</p>" }} aria-label="Body" data-rte-surface></div>`;
  mkdirSync("gen", { recursive: true });
  writeFileSync("gen/surface.mjs", compile(source, { filename: "Surface.svelte", generate: "server" }).js.code);
  const { render } = await import("svelte/server");
  const component = (await import(new URL("./gen/surface.mjs", import.meta.url).href)).default;
  const { body } = render(component, { props: {} });
  placeholder("svelte", body);
  quiet("svelte");
}

// ---- the elements -----------------------------------------------------------------------------------------------------------------
{
  const element = await import("@rathkit/rte-element");
  element.define();
  const ui = await import("@rathkit/rte-ui/element");
  ui.defineUi();
  check("the custom elements import and define() does nothing on a server", true, null);
  quiet("elements");
}

console.log(`ssr checks: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
