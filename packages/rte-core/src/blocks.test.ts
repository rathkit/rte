import assert from "node:assert/strict";
import { test } from "node:test";
import { alignAt, blockKindAt, setAlign, setBlockType } from "./blocks.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { linkAt, setLink } from "./links.ts";
import { caret, type Selection } from "./path.ts";

const doc = (html: string) => importHtml(html);
const at = (path: number[], offset = 0) => caret({ path, offset });
const range = (a: number[], ao: number, b: number[], bo: number): Selection => ({ anchor: { path: a, offset: ao }, focus: { path: b, offset: bo } });
const html = (r: { doc: Parameters<typeof exportHtml>[0] }) => exportHtml(r.doc);

test("block type: paragraphs become headings and back, the same command toggles", () => {
  assert.equal(html(setBlockType(doc("<p>a</p>"), at([0], 1), { type: "h", level: 2 })), "<h2>a</h2>");
  assert.equal(html(setBlockType(doc("<h2>a</h2>"), at([0], 1), { type: "h", level: 2 })), "<p>a</p>");
  assert.equal(html(setBlockType(doc("<h2>a</h2>"), at([0], 1), { type: "h", level: 3 })), "<h3>a</h3>");
  assert.equal(html(setBlockType(doc("<h1>a</h1><p>b</p>"), range([0], 0, [1], 1), { type: "h", level: 1 })), "<p>a</p><p>b</p>");
  assert.equal(html(setBlockType(doc("<p>a <em>b</em></p>"), at([0], 1), { type: "h", level: 1 })), "<h1>a <em>b</em></h1>");
  assert.equal(html(setBlockType(doc('<p style="text-align:center">a</p>'), at([0], 1), { type: "h", level: 1 })), '<h1 style="text-align: center;">a</h1>');
});

test("block type: code blocks turn into text, list items and tables are left alone", () => {
  assert.equal(html(setBlockType(doc("<pre>x</pre>"), at([0], 0), { type: "p" })), "<p>x</p>");
  assert.equal(html(setBlockType(doc("<ul><li>a</li></ul>"), at([0, 0], 0), { type: "h", level: 1 })), "<ul><li>a</li></ul>");
  assert.equal(html(setBlockType(doc("<blockquote><p>q</p></blockquote>"), at([0, 0], 0), { type: "h", level: 1 })), "<blockquote><h1>q</h1></blockquote>");
  assert.deepEqual(blockKindAt(doc("<h3>a</h3>"), at([0], 0)), { type: "h", level: 3 });
  assert.deepEqual(blockKindAt(doc("<ul><li>a</li></ul>"), at([0, 0], 0)), { type: "li" });
});

test("alignment", () => {
  assert.equal(html(setAlign(doc("<p>a</p><p>b</p>"), range([0], 0, [1], 1), "center")), '<p style="text-align: center;">a</p><p style="text-align: center;">b</p>');
  assert.equal(html(setAlign(doc('<p style="text-align:right">a</p>'), at([0]), "left")), "<p>a</p>");
  assert.equal(alignAt(doc('<h1 style="text-align:justify">a</h1>'), at([0])), "justify");
  assert.equal(alignAt(doc("<p>a</p>"), at([0])), undefined);
  assert.equal(html(setAlign(doc("<ul><li>a</li></ul>"), at([0, 0]), "center")), "<ul><li>a</li></ul>");
});

test("links: set on a selection, edit the whole link from a caret, remove, and refuse unsafe addresses", () => {
  assert.equal(html(setLink(doc("<p>one two three</p>"), range([0], 4, [0], 7), "https://x.test")), '<p>one <a href="https://x.test">two</a> three</p>');
  const linked = doc('<p>one <a href="https://a.test">two</a> three</p>');
  assert.equal(linkAt(linked, at([0], 5)), "https://a.test");
  assert.equal(linkAt(linked, at([0], 1)), undefined);
  assert.equal(linkAt(linked, range([0], 4, [0], 7)), "https://a.test");
  assert.equal(html(setLink(linked, at([0], 5), "https://b.test")), '<p>one <a href="https://b.test">two</a> three</p>');
  assert.equal(html(setLink(linked, at([0], 5), undefined)), "<p>one two three</p>");
  assert.equal(html(setLink(doc("<p>abc</p>"), range([0], 0, [0], 3), "javascript:alert(1)")), "<p>abc</p>");
  assert.equal(html(setLink(doc("<p>abc</p>"), range([0], 0, [0], 3), "C:\\Users\\x")), "<p>abc</p>");
  assert.equal(html(setLink(doc("<p>abc</p>"), at([0], 1), "https://x.test")), "<p>abc</p>", "a caret outside a link has nothing to link");
});

test("a link can span two paragraphs", () => {
  assert.equal(html(setLink(doc("<p>one</p><p>two</p>"), range([0], 1, [1], 2), "https://x.test")), '<p>o<a href="https://x.test">ne</a></p><p><a href="https://x.test">tw</a>o</p>');
});
