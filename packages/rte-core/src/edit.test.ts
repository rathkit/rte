import assert from "node:assert/strict";
import { test } from "node:test";
import {
  caret, deleteBackward, deleteForward, deleteSelection, deleteToEdge, deleteWord, extractSelection, insertBlocks, moveSelection, insertLineBreak, insertText, splitBlock, toggleMark,
} from "./edit.ts";
import { exportHtml } from "./export.ts";
import { importBlocks, importHtml, importText } from "./import.ts";
import type { Selection } from "./path.ts";

const doc = (html: string) => importHtml(html);
const at = (path: number[], offset: number) => caret({ path, offset });
const html = (r: { doc: Parameters<typeof exportHtml>[0] }) => exportHtml(r.doc);

test("typing inserts text with the marks of the text before the caret", () => {
  const r = insertText(doc("<p>a<strong>b</strong>c</p>"), at([0], 2), "X");
  assert.equal(html(r), "<p>a<strong>bX</strong>c</p>");
  assert.deepEqual(r.selection.focus, { path: [0], offset: 3 });
});

test("typing over a selection replaces it", () => {
  const sel: Selection = { anchor: { path: [0], offset: 1 }, focus: { path: [0], offset: 4 } };
  assert.equal(html(insertText(doc("<p>abcdef</p>"), sel, "-")), "<p>a-ef</p>");
  // A backwards selection behaves the same.
  assert.equal(html(insertText(doc("<p>abcdef</p>"), { anchor: sel.focus, focus: sel.anchor }, "-")), "<p>a-ef</p>");
});

test("deleting across paragraphs joins them and removes what lay between", () => {
  const d = doc("<p>abc</p><p>middle</p><h2>xyz</h2>");
  const r = deleteSelection(d, { anchor: { path: [0], offset: 1 }, focus: { path: [2], offset: 1 } });
  assert.equal(html(r), "<p>ayz</p>");
  assert.deepEqual(r.selection.focus, { path: [0], offset: 1 });
});

test("Enter splits a paragraph and a heading, and a heading end continues as a paragraph", () => {
  assert.equal(html(splitBlock(doc("<p>abcd</p>"), at([0], 2))), "<p>ab</p><p>cd</p>");
  assert.equal(html(splitBlock(doc("<h2>abcd</h2>"), at([0], 2))), "<h2>ab</h2><h2>cd</h2>");
  const end = splitBlock(doc("<h2>abcd</h2>"), at([0], 4));
  assert.equal(html(end), "<h2>abcd</h2><p></p>");
  assert.deepEqual(end.selection.focus, { path: [1], offset: 0 });
});

test("without a lists plugin, Enter in an item is a line break and the structure stays", () => {
  const r = splitBlock(doc("<ul><li>ab</li><li>cd</li></ul>"), at([0, 0], 1));
  assert.equal(html(r), "<ul><li>a<br>b</li><li>cd</li></ul>");
  assert.equal(html(splitBlock(doc("<dl><dt>ab</dt></dl>"), at([0, 0], 1))), "<dl><dt>a<br>b</dt></dl>");
});

test("Backspace and Delete join neighbours at block edges", () => {
  const back = deleteBackward(doc("<p>ab</p><p>cd</p>"), at([1], 0));
  assert.equal(html(back), "<p>abcd</p>");
  assert.deepEqual(back.selection.focus, { path: [0], offset: 2 });
  assert.equal(html(deleteForward(doc("<p>ab</p><p>cd</p>"), at([0], 2))), "<p>abcd</p>");
  assert.equal(html(deleteBackward(doc("<p>abc</p>"), at([0], 2))), "<p>ac</p>");
  // Nothing to join before the first block.
  assert.equal(html(deleteBackward(doc("<p>abc</p>"), at([0], 0))), "<p>abc</p>");
});

test("a line break goes in as a break, and in code as a newline", () => {
  assert.equal(html(insertLineBreak(doc("<p>ab</p>"), at([0], 1))), "<p>a<br>b</p>");
  assert.equal(html(insertLineBreak(doc("<pre>ab</pre>"), at([0], 1))), "<pre>a\nb</pre>");
});

test("bold toggles on, then off, across a range", () => {
  const sel: Selection = { anchor: { path: [0], offset: 1 }, focus: { path: [0], offset: 3 } };
  const on = toggleMark(doc("<p>abcd</p>"), sel, { type: "bold" });
  assert.equal(html(on), "<p>a<strong>bc</strong>d</p>");
  assert.equal(html(toggleMark(on.doc, sel, { type: "bold" })), "<p>abcd</p>");
});

test("pasting inline content joins the text at the caret", () => {
  const r = insertBlocks(doc("<p>ab</p>"), at([0], 1), importBlocks("<b>X</b>Y", { styles: "semantic" }));
  assert.equal(html(r), "<p>a<strong>X</strong>Yb</p>");
  assert.deepEqual(r.selection.focus, { path: [0], offset: 3 });
});

test("pasting into an empty paragraph replaces it with the pasted blocks", () => {
  const r = insertBlocks(doc(""), at([0], 0), importBlocks("<h1>T</h1><p>body</p><ul><li>x</li></ul>", { styles: "semantic" }));
  assert.equal(html(r), "<h1>T</h1><p>body</p><ul><li>x</li></ul>");
  assert.deepEqual(r.selection.focus, { path: [2, 0], offset: 1 });
});

test("pasting several paragraphs in the middle of text splits and joins at both ends", () => {
  const r = insertBlocks(doc("<p>abcd</p>"), at([0], 2), importText("1\n\n2\n\n3"));
  assert.equal(html(r), "<p>ab1</p><p>2</p><p>3cd</p>");
  assert.deepEqual(r.selection.focus, { path: [2], offset: 1 });
});

test("pasting a table in the middle of text keeps the text on both sides", () => {
  const r = insertBlocks(doc("<p>abcd</p>"), at([0], 2), importBlocks("<table><tr><td>x</td></tr></table>"));
  assert.equal(html(r), "<p>ab</p><table><tbody><tr><td>x</td></tr></tbody></table><p>cd</p>");
});

test("without a lists plugin, blocks pasted into an item become lines of text in it", () => {
  assert.equal(html(insertBlocks(doc("<ul><li>ab</li></ul>"), at([0, 0], 1), importText("1\n\n2"))), "<ul><li>a1<br>2b</li></ul>");
});

test("a document with lists loads, saves and survives deleting across items with no plugin at all", () => {
  const d = doc("<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul><dl><dt>t</dt><dd>d</dd></dl>");
  assert.equal(html({ doc: d }), "<ul><li>one<ul><li>two</li></ul></li><li>three</li></ul><dl><dt>t</dt><dd>d</dd></dl>");
  const cut = deleteSelection(d, { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 1], offset: 2 } });
  assert.equal(html(cut), "<ul><li>oree</li></ul><dl><dt>t</dt><dd>d</dd></dl>");
  assert.equal(html(deleteBackward(d, at([0, 1], 0))), "<ul><li>one<ul><li>twothree</li></ul></li></ul><dl><dt>t</dt><dd>d</dd></dl>");
});

test("pasting replaces a selection", () => {
  const sel: Selection = { anchor: { path: [0], offset: 1 }, focus: { path: [0], offset: 3 } };
  assert.equal(html(insertBlocks(doc("<p>abcd</p>"), sel, importText("X\n\nY"))), "<p>aX</p><p>Yd</p>");
});

test("word and line deletion", () => {
  assert.equal(html(deleteWord(doc("<p>one two three</p>"), at([0], 7), "backward")), "<p>one&nbsp; three</p>");
  assert.equal(html(deleteWord(doc("<p>one two three</p>"), at([0], 4), "forward")), "<p>one&nbsp; three</p>");
  assert.equal(html(deleteWord(doc("<p>ab</p><p>cd</p>"), at([1], 0), "backward")), "<p>abcd</p>");
  assert.equal(html(deleteToEdge(doc("<p>one two</p>"), at([0], 3), "backward")), "<p>&nbsp;two</p>");
  assert.equal(html(deleteToEdge(doc("<p>one two</p>"), at([0], 3), "forward")), "<p>one</p>");
});

test("extracting a selection keeps the structure it covers", () => {
  const d = doc("<p>one</p><ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><p>two</p><table><tr><td>x</td><td>y</td></tr></table>");
  const ex = (a: [number[], number], b: [number[], number]) =>
    exportHtml({ blocks: extractSelection(d, { anchor: { path: a[0], offset: a[1] }, focus: { path: b[0], offset: b[1] } }) });
  assert.equal(ex([[0], 1], [[0], 3]), "<p>ne</p>");
  assert.equal(ex([[0], 2], [[2], 1]), "<p>e</p><ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><p>t</p>");
  assert.equal(ex([[1, 1], 0], [[1, 1, 0, 0], 1]), "<ul><li>b<ul><li>c</li></ul></li></ul>");
  assert.equal(ex([[3, 0, 1, 0], 0], [[3, 0, 1, 0], 1]), "<table><tbody><tr><td></td><td>y</td></tr></tbody></table>");
});

test("moving a selection places it at the target and removes it from the source", () => {
  const d = doc("<p>one two three</p>");
  const range: Selection = { anchor: { path: [0], offset: 4 }, focus: { path: [0], offset: 8 } };
  assert.equal(html(moveSelection(d, range, { path: [0], offset: 0 }, false)), "<p>two one three</p>");
  assert.equal(html(moveSelection(d, range, { path: [0], offset: 13 }, false)), "<p>one threetwo&nbsp;</p>");
  assert.equal(html(moveSelection(d, range, { path: [0], offset: 0 }, true)), "<p>two one two three</p>");
  // Dropping inside the selection or on its edge does nothing.
  assert.equal(html(moveSelection(d, range, { path: [0], offset: 6 }, false)), "<p>one two three</p>");
  assert.equal(html(moveSelection(d, range, { path: [0], offset: 4 }, false)), "<p>one two three</p>");
});

test("moving across blocks", () => {
  const d = doc("<p>aaa</p><p>bbb</p><p>ccc</p>");
  const range: Selection = { anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 3 } };
  assert.equal(html(moveSelection(d, range, { path: [2], offset: 3 }, false)), "<p></p><p>bbb</p><p>cccaaa</p>");
});

test("transposeChars swaps the characters either side of the caret, or the last two at the end, and keeps each one's formatting", async () => {
  const { transposeChars } = await import("./edit.ts");
  const { importHtml } = await import("./import.ts");
  const { exportHtml } = await import("./export.ts");
  const { caret } = await import("./path.ts");
  const run = (html: string, offset: number) => exportHtml(transposeChars(importHtml(html), caret({ path: [0], offset })).doc);
  assert.equal(run("<p>abcd</p>", 2), "<p>acbd</p>");
  assert.equal(run("<p>abcd</p>", 4), "<p>abdc</p>", "at the end, the last two");
  assert.equal(run("<p>a<b>b</b>cd</p>", 2), "<p>a<strong>c</strong>bd</p>".replace("<strong>c</strong>b", "c<strong>b</strong>"), "each keeps its mark");
  assert.equal(run("<p>abcd</p>", 0), "<p>abcd</p>", "nothing before the caret");
  assert.equal(run("<p>a</p>", 1), "<p>a</p>", "one character");
  assert.equal(run("<p>a<br>b</p>", 2), "<p>a<br>b</p>", "a line break is not swapped");
});

test("a copied selection keeps the rules between the blocks it covers, and a drag moves them", async () => {
  const { containerPaths } = await import("./path.ts");
  const d = doc("<p>a</p><hr><p>b</p><hr><p>c</p>");
  const paths = containerPaths(d);
  const range = (from: number, to: number, toOffset: number): Selection => ({ anchor: { path: paths[from] as number[], offset: 0 }, focus: { path: paths[to] as number[], offset: toOffset } });
  assert.equal(exportHtml({ blocks: extractSelection(d, range(0, 2, 1)) }), "<p>a</p><hr><p>b</p><hr><p>c</p>");
  assert.equal(exportHtml({ blocks: extractSelection(d, range(0, 1, 1)) }), "<p>a</p><hr><p>b</p>", "only the rule between the selected blocks");
  assert.equal(exportHtml({ blocks: extractSelection(d, range(1, 1, 1)) }), "<p>b</p>", "a selection in one block takes no rule");
  const moved = moveSelection(doc("<p>a</p><hr><p>b</p><p>z</p>"), { anchor: { path: [0], offset: 0 }, focus: { path: [2], offset: 1 } }, { path: [3], offset: 1 }, false);
  assert.equal(html(moved), "<p></p><p>za</p><hr><p>b</p>");
});

test("deleting a selection removes the rules inside it, and keeps the ones at its edges", () => {
  const del = (h: string, a: [number[], number], b: [number[], number]) => html(deleteSelection(doc(h), { anchor: { path: a[0], offset: a[1] }, focus: { path: b[0], offset: b[1] } }));
  assert.equal(del("<p>xa</p><hr><p>bc</p>", [[0], 1], [[2], 1]), "<p>xc</p>");
  assert.equal(del("<hr><p>xa</p><hr><hr><p>bc</p><hr>", [[1], 1], [[4], 1]), "<hr><p>xc</p><hr>", "two in a row inside; the outer ones stay");
  assert.equal(del("<blockquote><p>a</p><hr><p>b</p></blockquote><hr><p>c</p>", [[0, 0], 0], [[2], 1]), "<blockquote><p></p></blockquote>");
  assert.equal(del("<p>xa</p><hr><pre>code</pre>", [[0], 1], [[2], 2]), "<p>x</p><pre>de</pre>", "blocks that do not join lose the rule between them too");
});

test("the plain text of a selection puts a tab between the cells of a row, as a spreadsheet reads it", async () => {
  const { selectedText } = await import("./edit.ts");
  const { containerPaths } = await import("./path.ts");
  const text = (h: string) => { const d = doc(h); const paths = containerPaths(d); const last = paths[paths.length - 1] as number[]; return selectedText(d, { anchor: { path: paths[0] as number[], offset: 0 }, focus: { path: last, offset: 99 } }); };
  assert.equal(text("<table><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></table>"), "a1\tb1\na2\tb2");
  assert.equal(text("<p>before</p><table><tr><td>a1</td><td></td><td>c1</td></tr></table><p>after</p>"), "before\na1\t\tc1\nafter", "an empty cell keeps its place");
  assert.equal(text("<table><tr><td><p>x</p><p>y</p></td><td>z</td></tr></table>"), "x\ny\tz", "paragraphs in one cell stay on their own lines");
  assert.equal(text("<table><tr><td><table><tr><td>i1</td><td>i2</td></tr></table></td><td>o2</td></tr></table>"), "i1\ti2\to2", "a table in a cell");
});
