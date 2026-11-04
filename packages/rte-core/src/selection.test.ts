// Rules for the caret and selection that do not need a browser. docs/SELECTION.md lists all of them; the browser ones are checked in
// tools/browser-checks (the checks starting "selection:").
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { deleteBackward, deleteForward, endAtBlockEnd } from "./edit.ts";
import type { Engine } from "./engine.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { lists } from "./lists/index.ts";
import { caret } from "./path.ts";

const make = (html: string): Engine => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  e.use(lists());
  return e;
};
const html = (e: Engine) => exportHtml(e.document);
const at = (e: Engine, path: number[], offset: number) => e.setSelection(caret({ path, offset }));

test("rule: Delete at the end of a block before a rule removes the rule, and the text after it stays after", () => {
  const e = make("<p>one</p><hr><p>two</p>");
  at(e, [0], 3);
  e.apply("delete", deleteForward);
  assert.equal(html(e), "<p>one</p><p>two</p>");
  assert.deepEqual(e.selection, caret({ path: [0], offset: 3 }));
});

test("rule: Backspace at the start of a block after a rule removes the rule; the caret stays in that block", () => {
  const e = make("<p>one</p><hr><p>two</p>");
  at(e, [2], 0);
  e.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(e), "<p>one</p><p>two</p>");
  assert.deepEqual(e.selection, caret({ path: [1], offset: 0 }));
});

test("rule: a rule at the very start goes with Backspace, and one at the very end with Delete", () => {
  const first = make("<hr><p>two</p>");
  at(first, [1], 0);
  first.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(first), "<p>two</p>");
  assert.deepEqual(first.selection, caret({ path: [0], offset: 0 }));
  const last = make("<p>one</p><hr>");
  at(last, [0], 3);
  last.apply("delete", deleteForward);
  assert.equal(html(last), "<p>one</p>");
});

test("rule: with two rules in a row, each press removes one, nearest first", () => {
  const e = make("<p>a</p><hr><hr><p>b</p>");
  at(e, [3], 0);
  e.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(e), "<p>a</p><hr><p>b</p>");
  e.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(e), "<p>a</p><p>b</p>");
  e.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(e), "<p>ab</p>");
});

test("rule: a rule after a list or a quote is removed before the text after it moves", () => {
  const list = make("<ul><li>a</li></ul><hr><p>b</p>");
  at(list, [2], 0);
  list.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(list), "<ul><li>a</li></ul><p>b</p>");
  const quote = make("<blockquote><p>q</p><hr><p>r</p></blockquote>");
  at(quote, [0, 2], 0);
  quote.apply("delete", (d, s) => deleteBackward(d, s));
  assert.equal(html(quote), "<blockquote><p>q</p><p>r</p></blockquote>");
});

test("rule: a selection of whole blocks that runs on to the start of the next block ends at the end of the last one", () => {
  const e = make("<p>one two</p><p>next</p><ul><li>a</li><li>b</li></ul>");
  const run = (a: number[], b: number[]) => endAtBlockEnd(e.document, { anchor: { path: a, offset: 0 }, focus: { path: b, offset: 0 } });
  assert.deepEqual(run([0], [1]), { anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 7 } });
  assert.deepEqual(run([2, 0], [2, 1]), { anchor: { path: [2, 0], offset: 0 }, focus: { path: [2, 0], offset: 1 } });
  // Backwards, the anchor is the one that moves.
  assert.deepEqual(run([1], [0]), { anchor: { path: [0], offset: 7 }, focus: { path: [0], offset: 0 } });
});

test("rule: a selection that does not start at a block start, or ends inside a block, is left alone", () => {
  const e = make("<p>one two</p><p>next</p>");
  const sel = { anchor: { path: [0], offset: 2 }, focus: { path: [1], offset: 0 } };
  assert.equal(endAtBlockEnd(e.document, sel), sel);
  const inside = { anchor: { path: [0], offset: 0 }, focus: { path: [1], offset: 2 } };
  assert.equal(endAtBlockEnd(e.document, inside), inside);
  const point = caret({ path: [0], offset: 0 });
  assert.equal(endAtBlockEnd(e.document, point), point);
});
