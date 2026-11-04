// An item with no text that holds a nested list shows its marker, unless it is a bare wrapper (no marker, on purpose).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { deleteBackward, splitBlock } from "../edit.ts";
import type { Engine } from "../engine.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { caret, containerPaths } from "../path.ts";
import { lists } from "./index.ts";

const make = (html: string): Engine => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  e.use(lists());
  return e;
};
const html = (e: Engine) => exportHtml(e.document);

test("Enter at the end of an item with a nested list gives a new item that shows its marker", () => {
  const e = make("<ul><li>a<ul><li>b</li></ul></li></ul>");
  e.setSelection(caret({ path: [0, 0], offset: 1 }));
  e.apply("split", (d, s) => splitBlock(d, s, e.behaviors));
  assert.equal(html(e), "<ul><li>a</li><li><ul><li>b</li></ul></li></ul>");
  assert.ok(!html(e).includes("list-style-type: none"));
});

test("an item that loses all its text keeps its marker", () => {
  const e = make("<ul><li>a<ul><li>b</li></ul></li></ul>");
  e.setSelection(caret({ path: [0, 0], offset: 1 }));
  e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors));
  assert.equal(html(e), "<ul><li><ul><li>b</li></ul></li></ul>");
});

test("Backspace in the empty item takes the marker away and leaves the nested list where it is", () => {
  const e = make("<ul><li>a</li><li><ul><li>b</li></ul></li></ul>");
  e.setSelection(caret({ path: containerPaths(e.document)[1] as number[], offset: 0 }));
  e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors));
  assert.equal(html(e), '<ul><li>a</li><li style="list-style-type: none;"><ul><li>b</li></ul></li></ul>');
});

test("a bare wrapper survives a round trip, and so does a marked one", () => {
  const bare = '<ul><li style="list-style-type: none;"><ul><li>b</li></ul></li></ul>';
  assert.equal(exportHtml(importHtml(bare)), bare);
  const marked = "<ul><li><ul><li>b</li></ul></li></ul>";
  assert.equal(exportHtml(importHtml(marked)), marked);
});

test("indenting the first item nests it under a bare wrapper", () => {
  const e = make("<ul><li>a</li></ul>");
  e.setSelection(caret({ path: containerPaths(e.document)[0] as number[], offset: 0 }));
  e.commands.run("list.indent");
  assert.equal(html(e), '<ul><li style="list-style-type: none;"><ul><li>a</li></ul></li></ul>');
});

test("Shift+Tab on the empty item moves it out a level with its nested list, and at the left margin it stays", () => {
  const e = make("<ul><li>a<ul><li>x</li><li><ul><li>b</li></ul></li></ul></li></ul>");
  const at = (n: number) => e.setSelection(caret({ path: containerPaths(e.document)[n] as number[], offset: 0 }));
  at(2);
  e.commands.run("list.outdent");
  assert.equal(html(e), "<ul><li>a<ul><li>x</li></ul></li><li><ul><li>b</li></ul></li></ul>");
  at(2);
  e.commands.run("list.outdent");
  assert.equal(html(e), "<ul><li>a<ul><li>x</li></ul></li><li><ul><li>b</li></ul></li></ul>", "already at the left margin");
});
