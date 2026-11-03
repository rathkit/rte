import assert from "node:assert/strict";
import { test } from "node:test";
import { caret, deleteBackward as coreBackward, extractSelection, insertText, splitBlock as coreSplit } from "../edit.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { definitionBehavior } from "./definitions.ts";
import { indentItems, listBehavior, outdentItems, toggleList } from "./lists.ts";
import { containerPaths, getContent, type Selection } from "../path.ts";
import { inlineText } from "../model.ts";

const behaviors = { li: listBehavior, dt: definitionBehavior, dd: definitionBehavior };
const doc = (html: string) => importHtml(html);
const at = (path: number[], offset = 0) => caret({ path, offset });
const html = (r: { doc: Parameters<typeof exportHtml>[0] } | undefined) => exportHtml((r as { doc: Parameters<typeof exportHtml>[0] }).doc);
const START = "<ul><li>a<pre>code</pre><p>after</p><blockquote><p>q</p></blockquote><ul><li>sub</li></ul></li><li>b</li></ul>";

test("an item's children are containers in reading order, and are written and read back unchanged", () => {
  const d = doc(START);
  assert.deepEqual(containerPaths(d), [[0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 2, 0], [0, 0, 3, 0], [0, 1]]);
  assert.equal(exportHtml(d), START);
  assert.equal(inlineText(getContent(d, [0, 0, 2, 0])), "q");
  assert.equal(inlineText(getContent(d, [0, 0, 0])), "code");
});

test("typing in a child, in a quote in an item, and in the item's text", () => {
  const d = doc(START);
  assert.equal(html(insertText(d, at([0, 0, 0], 4), "!", [])), START.replace("code", "code!"));
  assert.equal(html(insertText(d, at([0, 0, 2, 0], 1), "!", [])), START.replace("<p>q</p>", "<p>q!</p>"));
  assert.equal(html(insertText(d, at([0, 0], 1), "!", [])), START.replace("<li>a<", "<li>a!<"));
});

test("Enter in a code child adds a line; in a paragraph child it adds a paragraph child", () => {
  assert.equal(html(coreSplit(doc(START), at([0, 0, 0], 4), behaviors)), START.replace("code", "code\n"));
  assert.equal(html(coreSplit(doc(START), at([0, 0, 1], 5), behaviors)), START.replace("<p>after</p>", "<p>after</p><p></p>"));
});

test("Backspace removes an empty child that cannot merge, and leaves code that has text alone", () => {
  const empty = doc("<ul><li>a<pre>code</pre><p></p></li></ul>");
  const r = coreBackward(empty, at([0, 0, 1], 0), behaviors);
  assert.equal(html(r), "<ul><li>a<pre>code</pre></li></ul>");
  assert.deepEqual(r.selection.focus, { path: [0, 0, 0], offset: 4 });
  assert.equal(html(coreBackward(doc("<ul><li>a<pre>c</pre></li></ul>"), at([0, 0, 0], 0), behaviors)), "<ul><li>a<pre>c</pre></li></ul>");
  assert.equal(html(coreBackward(doc("<ul><li>a<pre></pre></li></ul>"), at([0, 0, 0], 0), behaviors)), "<ul><li>a</li></ul>");
});

test("copying across an item and its children keeps the structure", () => {
  const sel: Selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0, 3, 0], offset: 3 } };
  assert.equal(exportHtml({ blocks: extractSelection(doc(START), sel) }), START.replace("<li>b</li>", ""));
});

test("taking an item out of its list keeps what it held; indenting an item under one that ends in code starts a nested list", () => {
  const out = toggleList(doc("<ul><li>a<pre>code</pre></li><li>b</li></ul>"), at([0, 0], 1), "ul");
  assert.ok(html(out).includes("<pre>code</pre>"), html(out));
  assert.equal(html(indentItems(doc("<ul><li>a<pre>code</pre></li><li>b</li></ul>"), at([0, 1], 1))), "<ul><li>a<pre>code</pre><ul><li>b</li></ul></li></ul>");
  const back = outdentItems(doc("<ul><li>a<pre>code</pre><ul><li>b</li></ul></li></ul>"), at([0, 0, 1, 0], 1));
  assert.ok(html(back).includes("<pre>code</pre>") && html(back).includes("<li>b</li>"), html(back));
});
