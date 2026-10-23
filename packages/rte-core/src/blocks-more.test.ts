import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { lists } from "./lists/plugin.ts";
import { caret, containerPaths, type Path } from "./path.ts";

const make = (html: string) => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (m) => { throw new Error(m); } });
  e.use(lists());
  return e;
};
const html = (e: ReturnType<typeof make>) => exportHtml(e.document);
const sel = (e: ReturnType<typeof make>, from: [Path, number], to: [Path, number] = from) => e.setSelection({ anchor: { path: from[0], offset: from[1] }, focus: { path: to[0], offset: to[1] } });

test("code block: paragraphs and headings become code (marks dropped), and back to paragraphs", () => {
  const e = make("<p>one <strong>two</strong></p><h2>three</h2><p>four</p>");
  sel(e, [[0], 0], [[1], 2]);
  assert.equal(e.commands.state("block.code").active, false);
  e.commands.run("block.code");
  assert.equal(html(e), "<pre>one two</pre><pre>three</pre><p>four</p>");
  assert.equal(e.commands.state("block.code").active, true);
  e.commands.run("block.code");
  assert.equal(html(e), "<p>one two</p><p>three</p><p>four</p>");
  e.undo();
  assert.equal(html(e), "<pre>one two</pre><pre>three</pre><p>four</p>");
});

test("quote: wraps the selected blocks, lifts them out again, and keeps the rest of the quote", () => {
  const e = make("<p>a</p><p>b</p><p>c</p><p>d</p>");
  sel(e, [[1], 0], [[2], 1]);
  e.commands.run("block.quote");
  assert.equal(html(e), "<p>a</p><blockquote><p>b</p><p>c</p></blockquote><p>d</p>");
  assert.deepEqual(e.selection.anchor.path, [1, 0]);
  assert.deepEqual(e.selection.focus.path, [1, 1]);
  assert.equal(e.commands.state("block.quote").active, true);
  sel(e, [[1, 1], 0]);
  e.commands.run("block.quote");
  assert.equal(html(e), "<p>a</p><blockquote><p>b</p></blockquote><p>c</p><p>d</p>", "only the selected block leaves");
  sel(e, [[1, 0], 0]);
  e.commands.run("block.quote");
  assert.equal(html(e), "<p>a</p><p>b</p><p>c</p><p>d</p>");
});

test("quote takes lists with it, works inside a table cell, and does nothing across different parents", () => {
  const e = make("<p>a</p><ul><li>x</li><li>y</li></ul>");
  sel(e, [[0], 0], [[1, 1], 0]);
  e.commands.run("block.quote");
  assert.equal(html(e), "<blockquote><p>a</p><ul><li>x</li><li>y</li></ul></blockquote>");
  const cell = make("<table><tbody><tr><td><p>in</p><p>cell</p></td><td>x</td></tr></tbody></table>");
  sel(cell, [[0, 0, 0, 0], 0]);
  cell.commands.run("block.quote");
  assert.equal(html(cell), "<table><tbody><tr><td><blockquote><p>in</p></blockquote><p>cell</p></td><td>x</td></tr></tbody></table>");
  const mixed = make("<blockquote><p>q</p></blockquote><p>p</p>");
  sel(mixed, [[0, 0], 0], [[1], 1]);
  assert.equal(mixed.commands.run("block.quote"), false);
});

test("horizontal rule: after the block, or in place of an empty paragraph, with the caret in a paragraph after it", () => {
  const e = make("<p>one</p><p>two</p>");
  sel(e, [[0], 1]);
  e.commands.run("block.rule");
  assert.equal(html(e), "<p>one</p><hr><p></p><p>two</p>");
  assert.deepEqual(e.selection.focus.path, [2]);
  const empty = make("<p>one</p><p></p>");
  sel(empty, [[1], 0]);
  empty.commands.run("block.rule");
  assert.equal(html(empty), "<p>one</p><hr><p></p>");
  assert.deepEqual(empty.selection.focus.path, [2]);
});

test("colors: set on a range, replaced, read back, taken away, and chosen for the next text at a caret", () => {
  const e = make("<p>one two</p>");
  sel(e, [[0], 0], [[0], 3]);
  e.commands.run("format.color", "#C62828");
  assert.equal(html(e), '<p><span style="color: #c62828;">one</span> two</p>');
  assert.equal(e.commands.state("format.color").value, "#c62828");
  assert.equal(e.commands.state("format.color").active, true);
  e.commands.run("format.color", "blue");
  assert.equal(html(e), '<p><span style="color: blue;">one</span> two</p>');
  e.commands.run("format.background", "yellow");
  assert.match(html(e), /background-color: yellow/);
  e.commands.run("format.color", "");
  assert.doesNotMatch(html(e), /color: blue/);
  assert.equal(e.commands.run("format.color", "url(x)"), false, "not a color");
  assert.equal(e.commands.run("format.color", "red; x"), false);
  sel(e, [[0], 7]);
  e.commands.run("format.color", "green");
  assert.equal(e.commands.state("format.color").value, "green", "reported at once");
});

test("clear formatting removes marks but keeps links, for a range and for the next text at a caret", () => {
  const e = make('<p><strong>b</strong> <em>i</em> <a href="https://x.test">l</a> <span style="color: red;">c</span></p>');
  sel(e, [[0], 0], [[0], 7]);
  e.commands.run("format.clear");
  assert.equal(html(e), '<p>b i <a href="https://x.test">l</a> c</p>');
  const caretCase = make("<p><strong>bold</strong></p>");
  sel(caretCase, [[0], 4]);
  assert.equal(caretCase.commands.state("format.bold").active, true);
  caretCase.commands.run("format.clear");
  assert.equal(caretCase.commands.state("format.bold").active, false);
});
