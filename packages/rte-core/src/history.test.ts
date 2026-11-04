// The rules of undo and redo, one test each. docs/HISTORY.md lists them in words; a rule changed here changes there.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { deleteBackward, insertText } from "./edit.ts";
import type { Engine } from "./engine.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { lists } from "./lists/index.ts";
import { footnotes } from "./footnotes/index.ts";
import { caret } from "./path.ts";

const make = (html: string, options: { readOnly?: boolean; maxLength?: number } = {}): Engine => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined, ...options });
  e.use(lists());
  e.use(footnotes());
  return e;
};
const html = (e: Engine) => exportHtml(e.document);
const at = (e: Engine, offset: number, path = [0]) => e.setSelection(caret({ path, offset }));
const type = (e: Engine, text: string) => e.apply("type", (d, s) => insertText(d, s, text, []));
const back = (e: Engine) => e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors));

test("rule 1: typing in a row is one step, and so is deleting in a row", () => {
  const e = make("<p></p>");
  for (const c of "hello") type(e, c);
  assert.equal(html(e), "<p>hello</p>");
  back(e);
  back(e);
  assert.equal(html(e), "<p>hel</p>");
  e.undo();
  assert.equal(html(e), "<p>hello</p>");
  e.undo();
  assert.equal(html(e), "<p></p>");
  assert.equal(e.canUndo, false);
});

test("rule 2: moving the caret ends the step, so typing somewhere else is a step of its own", () => {
  const e = make("<p>one two</p>");
  at(e, 3);
  type(e, "A");
  type(e, "B");
  at(e, 9);
  type(e, "C");
  assert.equal(html(e), "<p>oneAB twoC</p>");
  e.undo();
  assert.equal(html(e), "<p>oneAB two</p>");
  e.undo();
  assert.equal(html(e), "<p>one two</p>");
});

test("rule 2: the same goes for choosing a mark for the next letter", () => {
  const e = make("<p>ab</p>");
  at(e, 2);
  type(e, "c");
  e.setStoredMarks([{ type: "bold" }]);
  e.apply("type", (d, s) => insertText(d, s, "d", e.storedMarks));
  assert.equal(html(e), "<p>abc<strong>d</strong></p>");
  e.undo();
  assert.equal(html(e), "<p>abc</p>");
});

test("rule 3: a command is one step of its own, and typing after it is another", () => {
  const e = make("<p>abc</p>");
  at(e, 3);
  type(e, "d");
  e.commands.run("block.quote");
  type(e, "e");
  type(e, "f");
  e.undo();
  assert.equal(html(e), "<blockquote><p>abcd</p></blockquote>");
  e.undo();
  assert.equal(html(e), "<p>abcd</p>");
  e.undo();
  assert.equal(html(e), "<p>abc</p>");
});

test("rule 4: undo puts the caret back where it was before the step, redo where the step left it", () => {
  const e = make("<p>abc</p>");
  at(e, 1);
  type(e, "X");
  type(e, "Y");
  assert.equal(e.selection.focus.offset, 3);
  at(e, 0);
  e.undo();
  assert.deepEqual(e.selection, caret({ path: [0], offset: 1 }));
  e.redo();
  assert.equal(html(e), "<p>aXYbc</p>");
  assert.deepEqual(e.selection, caret({ path: [0], offset: 3 }));
});

test("rule 4: a selected range is selected again by undo", () => {
  const e = make("<p>hello world</p>");
  e.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 5 } });
  type(e, "J");
  assert.equal(html(e), "<p>J world</p>");
  e.undo();
  assert.deepEqual(e.selection, { anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 5 } });
});

test("rule 5: a new edit empties the redo list, and a step that changes nothing does not", () => {
  const e = make("<p>a</p>");
  at(e, 1);
  type(e, "b");
  e.undo();
  assert.equal(e.canRedo, true);
  at(e, 0);
  assert.equal(e.canRedo, true, "moving the caret keeps redo");
  assert.equal(e.apply("format", (d, s) => ({ doc: d, selection: s })), false);
  assert.equal(e.canRedo, true, "an edit that changes nothing keeps redo");
  type(e, "c");
  assert.equal(e.canRedo, false);
});

test("rule 6: only the last 200 steps are kept, and undo stops cleanly at the oldest", () => {
  const e = make("<p></p>");
  for (let i = 0; i < 250; i++) {
    e.apply("insert", (d, s) => insertText(d, s, "x", []));
  }
  let undone = 0;
  while (e.undo()) undone++;
  assert.equal(undone, 200);
  assert.equal(html(e), `<p>${"x".repeat(50)}</p>`);
  assert.equal(e.canUndo, false);
  let redone = 0;
  while (e.redo()) redone++;
  assert.equal(redone, 200);
  assert.equal(html(e), `<p>${"x".repeat(250)}</p>`);
});

test("rule 7: a repair a plugin makes is part of the step that needed it, undo and redo included", () => {
  const e = make("<p>Hello world</p>");
  at(e, 5);
  e.commands.run("footnote.insert");
  const withNote = e.document;
  assert.equal(e.document.blocks.length, 2);
  e.undo();
  assert.equal(html(e), "<p>Hello world</p>");
  e.redo();
  assert.equal(e.document, withNote);
  at(e, 6);
  back(e);
  assert.equal(e.document.blocks.length, 1, "the note went with its reference");
  e.undo();
  assert.equal(e.document, withNote, "and both come back in one step");
  e.redo();
  assert.equal(e.document.blocks.length, 1);
});

test("rule 8: undo never leaves a state that no edit produced (every step lands on a document seen before)", () => {
  const e = make("<p>one</p><p>two</p>");
  const seen = [e.document];
  at(e, 3);
  type(e, "!");
  seen.push(e.document);
  e.commands.run("block.quote");
  seen.push(e.document);
  e.commands.run("footnote.insert");
  seen.push(e.document);
  while (e.canUndo) {
    seen.pop();
    e.undo();
    assert.equal(e.document, seen[seen.length - 1]);
  }
  while (e.canRedo) e.redo();
  assert.equal(e.document.blocks.length, 3);
});

test("rule 9: a refused edit (too long, read-only) makes no step", () => {
  const e = make("<p>abc</p>", { maxLength: 4 });
  at(e, 3);
  type(e, "d");
  assert.equal(type(e, "e"), false);
  assert.equal(html(e), "<p>abcd</p>");
  e.undo();
  assert.equal(html(e), "<p>abc</p>");
  assert.equal(e.canUndo, false);
  const r = make("<p>abc</p>");
  at(r, 3);
  type(r, "d");
  r.setReadOnly(true);
  assert.equal(r.undo(), false);
  assert.equal(html(r), "<p>abcd</p>");
  r.setReadOnly(false);
  assert.equal(r.undo(), true, "the history waited");
});

test("rule 10: replacing the whole document empties the history", () => {
  const e = make("<p>a</p>");
  at(e, 1);
  type(e, "b");
  e.undo();
  e.setDocument(importHtml("<p>new</p>"));
  assert.deepEqual([e.canUndo, e.canRedo], [false, false]);
});

test("rule 11: a finished input-method composition is a step of its own, not part of the typing before it", () => {
  const e = make("<p></p>");
  type(e, "a");
  type(e, "b");
  // What the view does when the composition ends: one edit of kind "compose".
  e.apply("compose", (d, s) => insertText(d, s, "日本", []));
  type(e, "c");
  assert.equal(html(e), "<p>ab日本c</p>");
  e.undo();
  assert.equal(html(e), "<p>ab日本</p>");
  e.undo();
  assert.equal(html(e), "<p>ab</p>");
  e.undo();
  assert.equal(html(e), "<p></p>");
});
