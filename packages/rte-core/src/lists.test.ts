import assert from "node:assert/strict";
import { test } from "node:test";
import { caret, deleteBackward, splitBlock } from "./edit.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { indentItems, listShortcut, outdentItems, toggleList } from "./lists.ts";
import { containerPaths, type Selection } from "./path.ts";

const doc = (html: string) => importHtml(html);
const at = (path: number[], offset = 0) => caret({ path, offset });
const range = (a: number[], b: number[], bo = 1): Selection => ({ anchor: { path: a, offset: 0 }, focus: { path: b, offset: bo } });
const html = (r: { doc: Parameters<typeof exportHtml>[0] } | undefined) => exportHtml((r as { doc: Parameters<typeof exportHtml>[0] }).doc);
const NONE = ' style="list-style-type: none;"';

test("toggling a list changes its type, or takes the item out", () => {
  assert.equal(html(toggleList(doc("<ul><li>a</li><li>b</li></ul>"), at([0, 0], 1), "ol")), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(html(toggleList(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), at([0, 1], 1), "ul")), "<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>");
});

test("paragraphs become items, and join same-type lists beside them", () => {
  assert.equal(html(toggleList(doc("<p>a</p><p>b</p><p>c</p><p>d</p>"), range([1], [2]), "ol")), "<p>a</p><ol><li>b</li><li>c</li></ol><p>d</p>");
  assert.equal(html(toggleList(doc("<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>"), at([1], 1), "ul")), "<ul><li>a</li><li>b</li><li>c</li></ul>");
  assert.equal(html(toggleList(doc("<ol><li>a</li></ol><p>b</p>"), at([1], 1), "ul")), "<ol><li>a</li></ol><ul><li>b</li></ul>");
});

test("a heading becomes an item, keeping its text and marks; a quote keeps its place", () => {
  assert.equal(html(toggleList(doc("<h1>t <em>x</em></h1>"), at([0], 1), "ul")), "<ul><li>t <em>x</em></li></ul>");
  assert.equal(html(toggleList(doc("<blockquote><p>q</p></blockquote>"), at([0, 0], 1), "ul")), "<blockquote><ul><li>q</li></ul></blockquote>");
});

test("a nested list changes type on its own; taking a nested item out keeps the depth of what followed", () => {
  assert.equal(html(toggleList(doc("<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>"), at([0, 0, 0, 0], 1), "ol")), "<ul><li>a<ol><li>b</li><li>c</li></ol></li></ul>");
  assert.equal(html(toggleList(doc("<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>"), at([0, 0, 0, 0], 1), "ul")),
    `<ul><li>a</li></ul><p>b</p><ul><li${NONE}><ul><li>c</li></ul></li></ul>`);
});

test("style and start options", () => {
  assert.equal(html(toggleList(doc("<p>a</p>"), at([0], 1), "ol", { style: "lower-alpha" })), '<ol style="list-style-type: lower-alpha;"><li>a</li></ol>');
  const styled = toggleList(doc("<p>a</p>"), at([0], 1), "ol", { style: "lower-alpha" });
  assert.equal(html(toggleList(styled.doc, styled.selection, "ol", { style: "upper-roman" })), '<ol style="list-style-type: upper-roman;"><li>a</li></ol>');
  assert.equal(html(toggleList(doc("<p>a</p>"), at([0], 1), "ol", { start: 5 })), '<ol start="5"><li>a</li></ol>');
});

test("an empty document gets one empty item", () => {
  assert.equal(html(toggleList(doc(""), at([0]), "ul")), "<ul><li></li></ul>");
});

test("a selection from a paragraph into a list of the other type ends as one list", () => {
  const d = doc("<p>a</p><ol><li>b</li><li>c</li></ol>");
  assert.equal(html(toggleList(d, range([0], [1, 0]), "ul")), "<ul><li>a</li><li>b</li><li>c</li></ul>");
});

test("the block where the selection starts decides: starting in a bulleted list, everything selected leaves its lists", () => {
  const d = doc("<ul><li>a</li></ul><p>b</p><ol><li>c</li></ol>");
  assert.equal(html(toggleList(d, range([0, 0], [2, 0]), "ul")), "<p>a</p><p>b</p><p>c</p>");
});

test("Tab nests under the item before; the first item gets a placeholder; a selection moves together", () => {
  assert.equal(html(indentItems(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), at([0, 1], 1))), "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  const twice = indentItems(indentItems(doc("<ul><li>a</li><li>b</li></ul>"), at([0, 1], 1)).doc, at([0, 0, 0, 0], 1));
  assert.equal(html(twice), `<ul><li>a<ul><li${NONE}><ul><li>b</li></ul></li></ul></li></ul>`);
  assert.equal(html(indentItems(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), at([0, 0], 0))), `<ul><li${NONE}><ul><li>a</li></ul></li><li>b</li><li>c</li></ul>`);
  assert.equal(html(indentItems(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), range([0, 1], [0, 2]))), "<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>");
  // An item that has children keeps them: they move one level deeper with it.
  assert.equal(html(indentItems(doc("<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul>"), at([0, 1], 1))), "<ul><li>a<ul><li>b<ul><li>b1</li></ul></li></ul></li></ul>");
});

test("the depth limit stops Tab", () => {
  const once = indentItems(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), at([0, 1], 1), 1);
  assert.equal(html(once), "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  assert.equal(html(indentItems(once.doc, at([0, 0, 0, 0], 1), 1)), html(once));
});

test("Shift+Tab moves an item out one level; from the outermost list it leaves the list", () => {
  assert.equal(html(outdentItems(doc("<ul><li>a<ul><li>b</li></ul></li></ul>"), at([0, 0, 0, 0], 1))), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(html(outdentItems(doc("<ul><li>a</li><li>b</li><li>c</li></ul>"), at([0, 1], 1))), "<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>");
  // Items after it in its list keep their depth, as its children.
  assert.equal(html(outdentItems(doc("<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>"), at([0, 0, 0, 0], 1))), "<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>");
});

test("Tab then Shift+Tab gives back what was there, children included", () => {
  for (const source of ["<ul><li>a</li><li>b</li><li>c</li></ul>", "<ul><li>a</li><li>b<ul><li>b1</li><li>b2</li></ul></li><li>c</li></ul>"]) {
    const start = doc(source);
    const tabbed = indentItems(start, at([0, 1], 1));
    const back = outdentItems(tabbed.doc, tabbed.selection);
    assert.equal(html(back), html({ doc: start }));
  }
});

test("Enter on an empty item", () => {
  assert.equal(html(splitBlock(doc("<ul><li>a</li><li>b</li><li></li></ul>"), at([0, 2]))), "<ul><li>a</li><li>b</li></ul><p></p>");
  assert.equal(html(splitBlock(doc("<ul><li>a</li><li></li><li>c</li></ul>"), at([0, 1]))), "<ul><li>a</li></ul><p></p><ul><li>c</li></ul>");
  assert.equal(html(splitBlock(doc("<ul><li></li></ul>"), at([0, 0]))), "<p></p>");
  assert.equal(html(splitBlock(doc("<ul><li></li><li>b</li></ul>"), at([0, 0]))), "<p></p><ul><li>b</li></ul>");
  assert.equal(html(splitBlock(doc("<ul><li>a<ul><li></li></ul></li></ul>"), at([0, 0, 0, 0]))), "<ul><li>a</li><li></li></ul>");
  assert.equal(html(splitBlock(doc("<blockquote><ul><li>q</li><li></li></ul></blockquote>"), at([0, 0, 1]))), "<blockquote><ul><li>q</li></ul><p></p></blockquote>");
});

test("Backspace at the start of an item", () => {
  assert.equal(html(deleteBackward(doc("<ul><li>a</li><li>b</li></ul>"), at([0, 0], 0))), "<p>a</p><ul><li>b</li></ul>");
  assert.equal(html(deleteBackward(doc("<ul><li>a</li><li>b</li></ul>"), at([0, 1], 0))), "<ul><li>ab</li></ul>");
  assert.equal(html(deleteBackward(doc("<ul><li>a</li></ul>"), at([0, 0], 0))), "<p>a</p>");
  assert.equal(html(deleteBackward(doc("<ul><li>x<ul><li>a</li><li>b</li></ul></li></ul>"), at([0, 0, 0, 0], 0))), "<ul><li>x</li><li>a<ul><li>b</li></ul></li></ul>");
});

test("typed shortcuts: * or - then space, 1. then space; nothing else", () => {
  const star = listShortcut(doc("<p>*</p>"), at([0], 1));
  assert.equal(html(star), "<ul><li></li></ul>");
  assert.deepEqual(star?.selection.focus, { path: [0, 0], offset: 0 });
  assert.equal(html(listShortcut(doc("<p>-</p>"), at([0], 1))), "<ul><li></li></ul>");
  assert.equal(html(listShortcut(doc("<p>1.</p>"), at([0], 2))), "<ol><li></li></ol>");
  assert.equal(listShortcut(doc("<p>2.</p>"), at([0], 2)), undefined);
  assert.equal(listShortcut(doc("<p>1)</p>"), at([0], 2)), undefined);
  assert.equal(listShortcut(doc("<p>a *</p>"), at([0], 3)), undefined, "not at the start");
  assert.equal(listShortcut(doc("<p>*</p>"), at([0], 0)), undefined, "caret not after the marker");
  assert.equal(listShortcut(doc("<h1>*</h1>"), at([0], 1)), undefined, "only paragraphs");
});

test("every container survives a list command: no text is lost", () => {
  const d = doc("<p>one</p><ul><li>two<ul><li>three</li></ul></li></ul><p>four</p>");
  const all: Selection = { anchor: { path: [0], offset: 0 }, focus: { path: [2], offset: 4 } };
  const text = (x: Parameters<typeof exportHtml>[0]) => exportHtml(x).replace(/<[^>]*>/g, "|").replace(/\|+/g, "|");
  for (const type of ["ul", "ol"] as const) {
    const r = toggleList(d, all, type);
    assert.equal(text(r.doc), text(d), type);
    assert.ok(containerPaths(r.doc).length >= 4);
  }
});
