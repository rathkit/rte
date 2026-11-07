// The error and warning model (docs/ERRORS.md): content never throws, problems go to one channel with a code, and a plugin that
// fails is isolated. Each plugin hook has a test with a plugin that throws; each kind of bad content has one that is malformed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { insertText, splitBlock } from "./edit.ts";
import type { Engine } from "./engine.ts";
import { exportHtml } from "./export.ts";
import { importBlocks, importHtml } from "./import.ts";
import { parseMarkdown } from "./markdown/parse.ts";
import { caret } from "./path.ts";
import { pasteBlocks } from "./paste.ts";
import type { Plugin } from "./plugin.ts";
import { contentPolicy } from "./policy.ts";
import { WARNING_CODES, type Warning } from "./warning.ts";

const boom = (): never => { throw new Error("boom"); };
const make = (html = "<p>abc</p>", extra: Partial<Parameters<typeof createEngine>[0]> = {}): { e: Engine; told: Warning[] } => {
  const told: Warning[] = [];
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (w) => told.push(w), ...extra });
  return { e, told };
};
const bad = (setup: Plugin["setup"], id = "acme.bad"): Plugin => ({ id, api: "1", setup });

test("a plugin that throws while starting is left out with everything it had added, and reported", () => {
  const { e, told } = make();
  const remove = e.use(bad((host) => {
    host.command({ name: "acme.thing", label: "Thing", run: () => true });
    host.keybinding({ key: "Mod-Alt-9", command: "acme.thing" });
    host.normalize((d, s) => ({ doc: d, selection: s }));
    boom();
  }));
  assert.equal(e.commands.has("acme.thing"), false, "its command was taken away");
  assert.equal(told.length, 1);
  assert.equal(told[0]?.code, "plugin-failed");
  assert.equal(told[0]?.plugin, "acme.bad");
  assert.match(told[0]?.message ?? "", /acme\.bad failed to start and was left out: boom/);
  assert.doesNotThrow(remove);
  // The same id can be tried again, and the editor still works.
  e.use(bad(() => undefined));
  e.setSelection(caret({ path: [0], offset: 3 }));
  assert.equal(e.apply("type", (d, s) => insertText(d, s, "d", [])), true);
  assert.equal(exportHtml(e.document), "<p>abcd</p>");
});

test("a command that throws does nothing and says so; a state that throws disables it", () => {
  const { e, told } = make();
  e.use(bad((host) => {
    host.command({ name: "acme.run", label: "Run", run: boom });
    host.command({ name: "acme.state", label: "State", run: () => true, state: boom });
  }));
  assert.equal(e.commands.run("acme.run"), false);
  assert.equal(e.commands.state("acme.state").enabled, false);
  assert.deepEqual(told.map((w) => w.code), ["plugin-failed", "plugin-failed"]);
  assert.match(told[0]?.message ?? "", /acme\.bad failed in the command acme\.run; it was skipped: boom/);
});

test("a paste handler, a paste transform and a file handler that throw are skipped", async () => {
  const { e, told } = make();
  e.use(bad((host) => {
    host.pasteHandler(boom);
    host.pasteTransform(boom);
    host.pasteTransform(() => Promise.reject(new Error("later")));
    host.fileHandler(() => { throw new Error("files"); });
    host.fileHandler(() => Promise.reject(new Error("files later")));
  }));
  const blocks = pasteBlocks({ text: "hello" }, e.pasteHandlers, e.importOptions);
  assert.equal(exportHtml({ blocks }), "<p>hello</p>", "the default paste still happened");
  let result: unknown = blocks;
  for (const transform of e.pasteTransforms) result = result instanceof Promise ? await result.then(transform) : await transform(result as never);
  assert.equal(result, blocks, "the blocks went through unchanged");
  for (const handler of e.fileHandlers) assert.equal(await handler([]), undefined);
  assert.equal(told.filter((w) => w.code === "plugin-failed").length, 5);
});

test("a normalizer that throws does not undo the edit", () => {
  const { e, told } = make();
  e.use(bad((host) => host.normalize(boom)));
  e.setSelection(caret({ path: [0], offset: 3 }));
  assert.equal(e.apply("type", (d, s) => insertText(d, s, "!", [])), true);
  assert.equal(exportHtml(e.document), "<p>abc!</p>");
  assert.equal(told[0]?.code, "plugin-failed");
});

test("a text trigger and a copy formatter that throw are skipped", () => {
  const { e, told } = make();
  e.use(bad((host) => {
    host.textTrigger(boom);
    host.copyFormat(boom);
  }));
  assert.equal(e.triggerText(" "), undefined);
  assert.equal(e.copyFormatters.length, 1);
  assert.equal(e.copyFormatters[0]?.([]), undefined);
  assert.equal(told.length, 2);
});

test("a container behavior that throws falls back to the editor's own", () => {
  const { e, told } = make("<p>abc</p>");
  e.use(bad((host) => host.behavior("li", { split: boom, backspaceAtStart: boom, insertBlocks: boom })));
  assert.equal(e.behaviors.li?.split?.({ blocks: [] }, { path: [0], offset: 0 }), undefined);
  assert.equal(e.behaviors.li?.backspaceAtStart?.({ blocks: [] }, { path: [0], offset: 0 }), undefined);
  assert.equal(e.apply("split", (d, s) => splitBlock(d, s, e.behaviors)), true);
  assert.equal(told.length, 2);
});

test("a recognizer and an SVG cleaner that throw do not stop content from loading", () => {
  const { e, told } = make();
  e.use(bad((host) => host.importOptions({ recognizers: [{ element: boom, listItemStyle: boom }], sanitizeSvg: boom })));
  const html = '<ul><li>a</li></ul><p>b<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></p>';
  const out = exportHtml({ blocks: importBlocks(html, e.importOptions) });
  assert.equal(out, "<ul><li>a</li></ul><p>b</p>");
  assert.ok(told.length >= 2 && told.every((w) => w.code === "plugin-failed" && w.plugin === "acme.bad"));
});

test("a listener that throws is reported, and the listeners after it still run", async () => {
  const { e, told } = make();
  const seen: string[] = [];
  e.subscribe(boom);
  e.subscribe(() => seen.push("second"));
  e.select((s) => s.version, boom);
  e.setSelection(caret({ path: [0], offset: 2 }));
  e.apply("type", (d, s) => insertText(d, s, "x", []));
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  assert.deepEqual(seen, ["second"]);
  assert.ok(told.length >= 2 && told.every((w) => w.code === "listener-failed"));
});

test("a warning handler that throws does not take the editor down", () => {
  const e = createEngine({ onWarning: boom, platform: "other" });
  assert.doesNotThrow(() => e.use(bad(boom)));
  assert.doesNotThrow(() => e.report({ code: "plugin-message", message: "x" }));
});

test("with no handler, warnings go to the console with their code", () => {
  const seen: string[] = [];
  const original = console.warn;
  console.warn = (m: unknown) => { seen.push(String(m)); };
  try {
    createEngine({ platform: "other" }).use(bad(boom));
  } finally { console.warn = original; }
  assert.match(seen[0] ?? "", /^\[rte\] plugin-failed: acme\.bad failed to start/);
});

test("a plugin that cannot be added at all (same id, an API it does not support) throws from use(), which is the caller's own mistake", () => {
  const { e } = make();
  e.use(bad(() => undefined));
  assert.throws(() => e.use(bad(() => undefined)), /already registered/);
  assert.throws(() => e.use({ id: "acme.old", api: ">=2", setup: () => undefined }), /needs plugin API/);
});

test("plugin warnings carry the code plugin-message", () => {
  const { e, told } = make();
  e.use(bad((host) => host.editor.warn("heads up")));
  assert.deepEqual(told.map((w) => [w.code, w.message]), [["plugin-message", "heads up"]]);
});

// ---- content never throws -----------------------------------------------------------------------------------------

/** A small deterministic generator, so a failure can be run again. */
function random(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const PIECES = [
  "<", ">", "</", "/>", "<p>", "</p>", "<div", "<b>", "</i>", "<ul>", "<li>", "</ul>", "<ol start=", "<table>", "<tr>", "<td colspan=", "</table>", "<a href=", "<img src=",
  '"', "'", "=", "&", "&#", "&#x", "&amp", "&#xFFFFFFF;", "&#0;", "&nbsp;", "\u0000", "\ud800", "\udfff", "‮", "﻿", "<!--", "-->", "--!>", "<![CDATA[", "<!", "<?",
  "<script>", "</script", "<style>", "<pre>", "<code>", "<blockquote>", "<h1>", "<h7>", "<br/>", "<hr>", "<sup data-note=", "<section class=footnotes>", "<dl>", "<dt>", "<dd>",
  "text", " ", "\n", "\t", "x".repeat(300), "9".repeat(30), "-1", "javascript:", "data:image/png;base64,", "style=", "color:red;", "position:", "((((", "))))", "\\",
];
function garbage(next: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PIECES[Math.floor(next() * PIECES.length)] as string;
  return out;
}

test("malformed markup never throws, loading or pasting, and always gives a document", () => {
  const next = random(20260518);
  for (let i = 0; i < 3000; i++) {
    const html = garbage(next, 1 + Math.floor(next() * 40));
    const label = JSON.stringify(html);
    let doc: unknown;
    assert.doesNotThrow(() => { doc = importHtml(html); }, label);
    assert.ok((doc as unknown as { blocks: unknown[] }).blocks.length > 0, label);
    assert.doesNotThrow(() => exportHtml(doc as never), label);
    assert.doesNotThrow(() => pasteBlocks({ html, text: html }), label);
    assert.doesNotThrow(() => parseMarkdown(html), label);
  }
});

test("truncated real markup never throws, however short the cut", () => {
  const sample = '<h1 style="color:red">T</h1><ul><li>a<ul><li>b</li></ul></li></ul><table><tr><td colspan="2" style="border:1px solid red">c</td></tr></table><p><a href="https://x">l</a><img src="https://x/y.png" width="3"><sup data-note="n1">1</sup></p><blockquote><pre>code</pre></blockquote><dl><dt>t</dt><dd>d</dd></dl>';
  for (let n = 0; n <= sample.length; n++) {
    assert.doesNotThrow(() => exportHtml(importHtml(sample.slice(0, n))), `cut at ${n}`);
    assert.doesNotThrow(() => exportHtml(importHtml(sample.slice(n))), `from ${n}`);
  }
});

test("setting content through the editor's own commands never throws either", () => {
  const { e } = make();
  const next = random(7);
  for (let i = 0; i < 200; i++) assert.doesNotThrow(() => e.commands.run("document.setHtml", { html: garbage(next, 20) }));
  assert.doesNotThrow(() => e.commands.run("document.setHtml", { html: 42 as never }));
  assert.doesNotThrow(() => e.commands.run("document.setHtml", { html: undefined as never }));
});

test("something that goes wrong inside the reader leaves the content out and is reported, never thrown", () => {
  const told: Warning[] = [];
  const { e } = make("<p>x</p>", { onWarning: (w) => told.push(w) });
  const hostile = { element: () => { throw new Error("inside"); } };
  // A recognizer given straight to the importer (not through a plugin) is not isolated, so the reader's own net catches it.
  const out = importBlocks("<p>a</p>", { recognizers: [hostile], ...(e.importOptions.onError ? { onError: e.importOptions.onError } : {}) });
  assert.deepEqual(out, []);
  assert.equal(told[0]?.code, "content-unreadable");
  assert.match(told[0]?.message ?? "", /inside/);
});

// ---- bad options --------------------------------------------------------------------------------------------------

test("a content option that cannot be used is reported (bad-option) and the profile's value is used", () => {
  const told: string[] = [];
  const policy = contentPolicy(
    { profile: "paranoid" as never, maxDepth: -3, maxInputLength: 1.5, linkSchemes: ["javascript:", 5] as never, styles: "everything" as never, pasteRelativeImages: "yes" as never },
    (m) => told.push(m),
  );
  assert.equal(told.length, 6, told.join("\n"));
  assert.equal(policy.maxDepth, 100);
  assert.equal(policy.styles, "allowlist");
  assert.deepEqual(policy.linkSchemes, ["http", "https", "mailto", "tel"]);
  const { told: warnings } = make("<p>x</p>", { content: { maxDepth: 0 } });
  assert.equal(warnings[0]?.code, "bad-option");
  // Good values are used, and zero is a good limit for data images.
  assert.equal(contentPolicy({ maxDataImageLength: 0 }).maxDataImageLength, 0);
});

// ---- the page -----------------------------------------------------------------------------------------------------

test("docs/ERRORS.md lists exactly the warning codes", () => {
  const page = readFileSync(new URL("../../../docs/ERRORS.md", import.meta.url), "utf8");
  const start = page.indexOf("\n## Warning codes\n");
  assert.notEqual(start, -1);
  const end = page.indexOf("\n## ", start + 1);
  const rows = page.slice(start, end === -1 ? undefined : end).split("\n").filter((l) => l.startsWith("|")).slice(2);
  const codes = rows.map((row) => (row.split("|")[1] ?? "").trim().replaceAll("`", ""));
  assert.deepEqual([...codes].sort(), [...WARNING_CODES].sort());
});
