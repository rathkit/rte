import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteBackward as coreBackward, deleteSelection, extractSelection, insertBlocks as coreInsert, splitBlock as coreSplit } from "../edit.ts";
import { definitionBehavior, setEntryKind, toggleDefinitionList } from "./definitions.ts";
import { listBehavior } from "./lists.ts";
import { exportHtml } from "../export.ts";
import { importHtml, importText } from "../import.ts";
import { caret, type Selection } from "../path.ts";

const behaviors = { li: listBehavior, dt: definitionBehavior, dd: definitionBehavior };
const splitBlock = (d: Parameters<typeof coreSplit>[0], s: Parameters<typeof coreSplit>[1]) => coreSplit(d, s, behaviors);
const deleteBackward = (d: Parameters<typeof coreSplit>[0], s: Parameters<typeof coreSplit>[1]) => coreBackward(d, s, behaviors);
const insertBlocks = (d: Parameters<typeof coreInsert>[0], s: Parameters<typeof coreInsert>[1], b: Parameters<typeof coreInsert>[2]) => coreInsert(d, s, b, behaviors);
const doc = (html: string) => importHtml(html);
const at = (path: number[], offset = 0) => caret({ path, offset });
const range = (a: number[], b: number[], bo = 1): Selection => ({ anchor: { path: a, offset: 0 }, focus: { path: b, offset: bo } });
const html = (r: { doc: Parameters<typeof exportHtml>[0] }) => exportHtml(r.doc);

test("every selected block becomes a term; no details are made", () => {
  assert.equal(html(toggleDefinitionList(doc("<p>a</p><p>b</p>"), range([0], [1]))), "<dl><dt>a</dt><dt>b</dt></dl>");
  assert.equal(html(toggleDefinitionList(doc("<p>x</p><p>a</p><p>b</p><p>y</p>"), range([1], [2]))), "<p>x</p><dl><dt>a</dt><dt>b</dt></dl><p>y</p>");
  assert.equal(html(toggleDefinitionList(doc("<h1>t <em>x</em></h1>"), at([0], 1))), "<dl><dt>t <em>x</em></dt></dl>");
  assert.equal(html(toggleDefinitionList(doc(""), at([0]))), "<dl><dt></dt></dl>");
});

test("it joins a definition list beside it, and items leave their lists first", () => {
  assert.equal(html(toggleDefinitionList(doc("<dl><dt>a</dt></dl><p>b</p><dl><dd>c</dd></dl>"), at([1], 1))), "<dl><dt>a</dt><dt>b</dt><dd>c</dd></dl>");
  assert.equal(html(toggleDefinitionList(doc("<ul><li>a</li><li>b</li></ul>"), range([0, 0], [0, 1]))), "<dl><dt>a</dt><dt>b</dt></dl>");
});

test("starting in a definition list, the selected entries become paragraphs and the list splits around them", () => {
  assert.equal(html(toggleDefinitionList(doc("<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl>"), at([0, 1], 1))), "<dl><dt>a</dt></dl><p>b</p><dl><dt>c</dt></dl>");
  assert.equal(html(toggleDefinitionList(doc("<dl><dt>a</dt><dd>b</dd></dl>"), range([0, 0], [0, 1]))), "<p>a</p><p>b</p>");
});

test("Enter alternates term and detail at the end of an entry, and keeps the kind in the middle", () => {
  assert.equal(html(splitBlock(doc("<dl><dt>Term</dt></dl>"), at([0, 0], 4))), "<dl><dt>Term</dt><dd></dd></dl>");
  assert.equal(html(splitBlock(doc("<dl><dt>T</dt><dd>Detail</dd></dl>"), at([0, 1], 6))), "<dl><dt>T</dt><dd>Detail</dd><dt></dt></dl>");
  assert.equal(html(splitBlock(doc("<dl><dd>abcd</dd></dl>"), at([0, 0], 2))), "<dl><dd>ab</dd><dd>cd</dd></dl>");
});

test("Enter on an empty entry leaves the list", () => {
  assert.equal(html(splitBlock(doc("<dl><dt>a</dt><dd></dd></dl>"), at([0, 1]))), "<dl><dt>a</dt></dl><p></p>");
  assert.equal(html(splitBlock(doc("<dl><dt>a</dt><dd></dd><dt>c</dt></dl>"), at([0, 1]))), "<dl><dt>a</dt></dl><p></p><dl><dt>c</dt></dl>");
});

test("Backspace at the start of the first entry makes a paragraph; later entries join the one before", () => {
  assert.equal(html(deleteBackward(doc("<dl><dt>a</dt><dd>b</dd></dl>"), at([0, 0], 0))), "<p>a</p><dl><dd>b</dd></dl>");
  assert.equal(html(deleteBackward(doc("<dl><dt>a</dt><dd>b</dd></dl>"), at([0, 1], 0))), "<dl><dt>ab</dt></dl>");
});

test("Tab makes a term a detail, Shift+Tab the other way", () => {
  assert.equal(html(setEntryKind(doc("<dl><dt>a</dt><dt>b</dt></dl>"), at([0, 1], 1), "detail")), "<dl><dt>a</dt><dd>b</dd></dl>");
  assert.equal(html(setEntryKind(doc("<dl><dt>a</dt><dd>b</dd></dl>"), at([0, 1], 1), "term")), "<dl><dt>a</dt><dt>b</dt></dl>");
});

test("deleting across entries, extracting, and pasting inside an entry", () => {
  const d = doc("<p>x</p><dl><dt>one</dt><dd>two</dd><dt>three</dt></dl>");
  assert.equal(html(deleteSelection(d, { anchor: { path: [1, 0], offset: 1 }, focus: { path: [1, 2], offset: 2 } })), "<p>x</p><dl><dt>oree</dt></dl>");
  assert.equal(exportHtml({ blocks: extractSelection(d, { anchor: { path: [1, 0], offset: 1 }, focus: { path: [1, 1], offset: 2 } }) }), "<dl><dt>ne</dt><dd>tw</dd></dl>");
  assert.equal(html(insertBlocks(doc("<dl><dt>ab</dt></dl>"), at([0, 0], 1), importText("1\n\n2"))), "<dl><dt>a1</dt><dt>2b</dt></dl>");
});
