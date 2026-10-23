import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { insertText } from "./edit.ts";
import { Engine } from "./engine.ts";
import { exportHtml } from "./export.ts";
import { importBlocks, importHtml } from "./import.ts";
import { Keymap } from "./keymap.ts";
import { lists } from "./lists/index.ts";
import { shout } from "./mentions.sample.ts";
import { caret, type Selection } from "./path.ts";
import type { Plugin } from "./plugin.ts";

const engine = (html: string, options: { indentOnTab?: boolean; readOnly?: boolean; platform?: "apple" | "other" } = {}) => {
  const { indentOnTab, ...rest } = options;
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined, ...rest });
  e.use(lists(indentOnTab === undefined ? {} : { indentOnTab }));
  return e;
};
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const html = (e: Engine) => exportHtml(e.document);
const range = (a: number, b: number): Selection => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });

test("the snapshot is one object until something changes, and changes are counted", () => {
  const e = engine("<p>abc</p>");
  const first = e.snapshot;
  assert.equal(e.snapshot, first);
  e.setSelection(caret({ path: [0], offset: 2 }));
  assert.notEqual(e.snapshot, first);
  assert.equal(e.snapshot.version, first.version + 1);
  // The same selection again, built a different way, is not a change.
  const now = e.snapshot;
  e.setSelection(caret({ path: [0], offset: 2 }));
  assert.equal(e.snapshot, now);
  e.setFocused(true);
  e.setReadOnly(true);
  assert.deepEqual([e.snapshot.focused, e.snapshot.readOnly], [true, true]);
  e.setFocused(true);
  e.setReadOnly(true);
  assert.equal(e.snapshot.version, now.version + 2);
});

test("subscribers hear once per turn, with the state before and after; state read straight after a change is current", async () => {
  const e = engine("<p>abc</p>");
  const heard: number[] = [];
  e.subscribe((snap, prev) => heard.push(snap.version - prev.version));
  e.setSelection(caret({ path: [0], offset: 1 }));
  e.apply("type", (doc, sel) => e.commands.has("x") ? { doc, selection: sel } : { doc, selection: caret({ path: [0], offset: 2 }) });
  e.setFocused(true);
  assert.equal(e.snapshot.selection.focus.offset, 2, "readable at once");
  assert.deepEqual(heard, []);
  await tick();
  assert.deepEqual(heard, [3], "three changes, one call");
});

test("select() only calls back when what was selected changed", async () => {
  const e = engine("<p>abc</p>");
  const seen: number[] = [];
  e.select((s) => s.selection.focus.offset, (v) => seen.push(v));
  e.setFocused(true);
  await tick();
  e.setSelection(caret({ path: [0], offset: 3 }));
  await tick();
  e.setSelection(caret({ path: [0], offset: 3 }));
  await tick();
  assert.deepEqual(seen, [3]);
});

test("a command's state is the same object until it changes, and its subscribers hear only real changes", async () => {
  const e = engine("<p>one two three</p>");
  e.setSelection(caret({ path: [0], offset: 3 }));
  const calls: boolean[] = [];
  e.commands.subscribe("format.bold", (s) => calls.push(s.active));
  const before = e.commands.state("format.bold");
  assert.deepEqual([before.enabled, before.active], [true, false]);
  // Typing moves the caret and changes the document on every key, but bold's state is the same each time.
  for (let i = 0; i < 20; i++) {
    e.apply("type", (doc, sel) => insertText(doc, sel, "x"));
    await tick();
  }
  assert.deepEqual(calls, [], "bold was never woken");
  assert.equal(e.commands.state("format.bold"), before, "and its state is the very same object");
  // Selecting text does not change what bold reports; making the text bold does: one notification.
  e.setSelection(range(0, 3));
  await tick();
  assert.deepEqual(calls, []);
  e.commands.run("format.bold");
  await tick();
  assert.deepEqual(calls, [true]);
  assert.equal(e.commands.state("format.bold").active, true);
});

test("stored marks: bold chosen at a caret is what the next typed text takes, and only there", async () => {
  const e = engine("<p>one two</p>");
  e.setSelection(caret({ path: [0], offset: 3 }));
  assert.equal(e.commands.run("format.bold"), true);
  assert.equal(e.commands.state("format.bold").active, true, "reported as on at once");
  e.apply("type", (doc, sel) => insertText(doc, sel, "X", e.storedMarks));
  e.apply("type", (doc, sel) => insertText(doc, sel, "Y", e.storedMarks));
  assert.equal(exportHtml(e.document), "<p>one<strong>XY</strong> two</p>", "both letters, because the second follows the first");
  // Choosing and then moving away forgets the choice.
  e.setSelection(caret({ path: [0], offset: 0 }));
  e.commands.run("format.italic");
  e.setSelection(caret({ path: [0], offset: 1 }));
  e.setSelection(caret({ path: [0], offset: 0 }));
  assert.equal(e.commands.state("format.italic").active, false);
  // Choosing twice undoes the choice; and bold in bold text can be switched off for the next letter.
  e.commands.run("format.italic");
  e.commands.run("format.italic");
  assert.equal(e.storedMarks?.length, 0);
  e.setSelection(caret({ path: [0], offset: 5 }));
  assert.equal(e.commands.state("format.bold").active, true);
  e.commands.run("format.bold");
  e.apply("type", (doc, sel) => insertText(doc, sel, "z", e.storedMarks));
  assert.equal(exportHtml(e.document), "<p>one<strong>XY</strong>z two</p>", "bold switched off for the next letter");
});

test("stored marks are forgotten by undo, by a new document and by read-only, and need a caret", () => {
  const e = engine("<p>one two</p>");
  e.setSelection(range(0, 3));
  e.commands.run("format.bold");
  assert.equal(e.storedMarks, undefined, "a range is made bold, nothing is stored");
  e.setSelection(caret({ path: [0], offset: 3 }));
  e.commands.run("format.italic");
  e.undo();
  assert.equal(e.storedMarks, undefined);
  e.commands.run("format.italic");
  e.setDocument(importHtml("<p>x</p>"));
  assert.equal(e.storedMarks, undefined);
  e.setReadOnly(true);
  assert.equal(e.commands.run("format.bold"), false);
});

test("read-only: every editing command is disabled and does nothing, undo included; copy-like commands stay on", () => {
  const e = engine("<p>abc</p>", { readOnly: true });
  e.setSelection(range(0, 3));
  for (const name of ["format.bold", "block.heading", "list.bulleted", "link.set"]) {
    assert.equal(e.commands.state(name).enabled, false, name);
    assert.equal(e.commands.run(name, name === "block.heading" ? 1 : { href: "https://x.test" }), false);
  }
  assert.equal(e.apply("type", (doc, sel) => ({ doc: importHtml("<p>x</p>"), selection: sel })), false);
  assert.equal(html(e), "<p>abc</p>");
});

test("commands: bold, headings, alignment, links, lists and history, through their names", () => {
  const e = engine("<p>one two</p>");
  e.setSelection(range(0, 3));
  assert.equal(e.commands.run("format.bold"), true);
  assert.equal(html(e), "<p><strong>one</strong> two</p>");
  assert.equal(e.commands.state("format.bold").active, true);
  assert.equal(e.commands.run("block.heading", 2), true);
  assert.equal(html(e), "<h2><strong>one</strong> two</h2>");
  assert.equal(e.commands.state("block.heading").value, 2);
  assert.equal(e.commands.run("block.align", "center"), true);
  assert.equal(e.commands.state("block.align").value, "center");
  assert.equal(e.commands.run("link.set", { href: "https://x.test" }), true);
  assert.equal(e.commands.state("link.set").value, "https://x.test");
  assert.equal(e.commands.run("link.set", { href: "javascript:alert(1)" }), false);
  assert.equal(e.commands.run("link.remove"), true);
  assert.equal(e.commands.run("block.paragraph"), true);
  assert.equal(e.commands.run("list.numbered"), true);
  assert.equal(e.commands.state("list.numbered").active, true);
  assert.equal(e.commands.state("list.bulleted").active, false);
  assert.equal(e.commands.run("list.indent"), true);
  assert.equal(e.commands.run("history.undo"), true);
  assert.equal(e.commands.state("history.redo").enabled, true);
  assert.equal(e.commands.run("nope.nothing"), false);
});

test("Tab runs list.indent only in a list; elsewhere it is left to the browser", () => {
  const e = engine("<p>a</p><ul><li>x</li><li>y</li></ul>");
  const tab = { key: "Tab", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(e.handleKey(tab), false);
  e.setSelection(caret({ path: [1, 1], offset: 1 }));
  assert.equal(e.handleKey(tab), true);
  assert.equal(html(e), "<p>a</p><ul><li>x<ul><li>y</li></ul></li></ul>");
  assert.equal(e.handleKey({ ...tab, shiftKey: true }), true);
  assert.equal(html(e), "<p>a</p><ul><li>x</li><li>y</li></ul>");
  const off = engine("<ul><li>x</li><li>y</li></ul>", { indentOnTab: false });
  off.setSelection(caret({ path: [0, 1], offset: 1 }));
  assert.equal(off.handleKey(tab), false);
});

test("keys: Mod means Command on Apple platforms and Control elsewhere; conflicts warn; the host can rebind", () => {
  const mac = engine("<p>abc</p>", { platform: "apple" });
  const win = engine("<p>abc</p>", { platform: "other" });
  mac.setSelection(range(0, 3));
  win.setSelection(range(0, 3));
  const key = (k: string, mods: object) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  assert.equal(mac.handleKey(key("b", { ctrlKey: true })), false);
  assert.equal(mac.handleKey(key("b", { metaKey: true })), true);
  assert.equal(win.handleKey(key("b", { metaKey: true })), false);
  assert.equal(win.handleKey(key("b", { ctrlKey: true })), true);
  assert.equal(mac.keymap.shortcutFor("format.bold"), "⌘B");
  assert.equal(win.keymap.shortcutFor("history.redo"), "Ctrl+Shift+Z");
  const warnings: string[] = [];
  const map = new Keymap("other", (m) => warnings.push(m));
  map.add({ key: "Mod-k", command: "a" }, "plugin one");
  map.add({ key: "Ctrl-K", command: "b" }, "plugin two");
  assert.equal(map.list().length, 1);
  assert.match(warnings.join(), /already bound to a/);
  map.override({ key: "Mod-k", command: "b" });
  assert.equal(map.list()[0]?.command, "b");
  map.override({ key: "Mod-k", command: null });
  assert.equal(map.list().length, 0);
});

test("a plugin gets the editor and a toolkit, can be removed again, and must name an API version that matches", () => {
  const e = engine("<p>quiet words</p>");
  const remove = e.use(shout);
  e.setSelection(range(0, 5));
  assert.equal(e.commands.state("acme.shout").enabled, true);
  assert.equal(e.commands.run("acme.shout"), true);
  assert.equal(html(e), "<p>QUIET words</p>");
  assert.equal(e.keymap.list().some((b) => b.command === "acme.shout"), true);
  assert.throws(() => e.use(shout), /already registered/);
  remove();
  assert.equal(e.commands.has("acme.shout"), false);
  assert.equal(e.keymap.list().some((b) => b.command === "acme.shout"), false);
  assert.throws(() => e.use({ id: "old.one", api: ">=2", setup: () => undefined }), /needs plugin API/);
  assert.throws(() => e.use({ id: "bad.one", api: "latest", setup: () => undefined }), /needs plugin API/);
});

test("the sample plugin uses only type imports, so it does not need the editor at run time", () => {
  const source = readFileSync(new URL("./mentions.sample.ts", import.meta.url), "utf8");
  const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
  assert.ok(imports.length > 0);
  for (const line of imports) assert.match(line, /^import type /, line);
  assert.ok(!/\brequire\(|\bimport\(/.test(source));
});

test("removing a plugin takes away only what it added to the importer", () => {
  const e = createEngine({ onWarning: () => undefined });
  const mark = (id: string, tag: string) => ({
    id, api: "1",
    setup: (host: Parameters<Plugin["setup"]>[0]) => host.importOptions({
      recognizers: [{ element: (el) => (el.tag === tag ? [{ listItem: { type: "ul" as const, level: 1, listId: id, content: [] } }] : undefined) }],
    }),
  });
  const removeA = e.use(mark("acme.a", "a-item"));
  e.use(mark("acme.b", "b-item"));
  assert.equal(e.importOptions.recognizers.length, 2);
  removeA();
  assert.equal(e.importOptions.recognizers.length, 1);
  const html = (tag: string) => exportHtml({ blocks: importBlocks(`<${tag}>x</${tag}>`, e.importOptions) });
  assert.match(html("b-item"), /<ul>/, "the second plugin still recognizes its markup");
  assert.doesNotMatch(html("a-item"), /<ul>/);
  // An SVG cleaner belongs to the plugin that set it.
  const cleaner = (url: string): string => url;
  const removeS = e.use({ id: "acme.s", api: "1", setup: (host) => host.importOptions({ sanitizeSvg: cleaner }) });
  assert.throws(() => e.use({ id: "acme.s2", api: "1", setup: (host) => host.importOptions({ sanitizeSvg: cleaner }) }), /already set/);
  removeS();
  assert.equal(e.importOptions.sanitizeSvg, undefined);
});

test("shortcuts for aria-keyshortcuts use the names assistive technology expects", () => {
  assert.equal(engine("<p>a</p>", { platform: "other" }).keymap.ariaShortcut("format.bold"), "Control+B");
  assert.equal(engine("<p>a</p>", { platform: "apple" }).keymap.ariaShortcut("history.redo"), "Meta+Shift+Z");
  assert.equal(engine("<p>a</p>").keymap.ariaShortcut("nope"), undefined);
});
