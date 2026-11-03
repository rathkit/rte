import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { deleteBackward, insertText, splitBlock } from "../edit.ts";
import type { Engine } from "../engine.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { lists } from "../lists/index.ts";
import { inlineText } from "../model.ts";
import { caret, getContent } from "../path.ts";
import { footnotes } from "./index.ts";

const make = (html: string): Engine => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  e.use(lists());
  e.use(footnotes());
  return e;
};
const at = (e: Engine, path: number[], offset: number) => e.setSelection(caret({ path, offset }));
const notesOf = (e: Engine) => e.document.blocks.flatMap((b) => (b.type === "ol" && b.notes ? [b] : []));
const texts = (e: Engine) => notesOf(e).flatMap((b) => b.items.map((i) => `${i.id}:${inlineText(i.content)}`));
const type = (e: Engine, text: string) => e.apply("type", (d, s) => insertText(d, s, text, []));

test("inserting a footnote puts a reference at the caret, a note at the end, and the caret in the note", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  assert.equal(e.commands.run("footnote.insert"), true);
  assert.deepEqual(e.document.blocks.map((b) => b.type), ["p", "ol"]);
  assert.equal(notesOf(e)[0]?.items.length, 1);
  assert.deepEqual(e.selection.focus, { path: [1, 0], offset: 0 });
  type(e, "See the source.");
  assert.deepEqual(texts(e), ["n1:See the source."]);
  assert.equal(inlineText(getContent(e.document, [0])), "Hello￼ world");
});

test("deleting the reference takes the note with it, and undo brings both back", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "Kept.");
  const before = e.document;
  at(e, [0], 6);
  e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors));
  assert.equal(notesOf(e).length, 0);
  assert.equal(e.document.blocks.length, 1);
  assert.equal(e.undo(), true);
  assert.equal(e.document, before);
});

test("a reference cut and pasted again brings its note back with its text", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "Kept.");
  const ref = getContent(e.document, [0]).find((n) => n.type === "note");
  at(e, [0], 6);
  e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors));
  assert.equal(notesOf(e).length, 0);
  e.apply("paste", (d, s) => ({ doc: { blocks: [{ type: "p", content: [{ type: "text", text: "Hello world", marks: [] }, ref as never] }] }, selection: s }));
  assert.deepEqual(texts(e), ["n1:Kept."]);
});

test("notes follow the order of their references, and the numbers agree", () => {
  const e = make("<p>one two</p>");
  at(e, [0], 3);
  e.commands.run("footnote.insert");
  type(e, "first");
  at(e, [0], 9);
  e.commands.run("footnote.insert");
  type(e, "second");
  assert.deepEqual(texts(e), ["n1:first", "n2:second"]);
  // A reference put before the others goes first in the list too.
  at(e, [0], 0);
  e.commands.run("footnote.insert");
  type(e, "zeroth");
  assert.deepEqual(texts(e), ["n3:zeroth", "n1:first", "n2:second"]);
  const html = exportHtml(e.document);
  assert.match(html, /<sup data-note="n3"><a href="#fn-n3" id="fnref-n3" role="doc-noteref">1<\/a><\/sup>/);
  assert.match(html, /<sup data-note="n2"><a href="#fn-n2" id="fnref-n2" role="doc-noteref">3<\/a><\/sup>/);
  assert.match(html, /<section class="footnotes" role="doc-endnotes"><ol><li id="fn-n3" data-note="n3">zeroth <a href="#fnref-n3" role="doc-backlink">/);
});

test("Enter in a note starts another paragraph of the same note, and the caret goes with it", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "abcd");
  at(e, [1, 0], 2);
  e.apply("enter", (d, s) => splitBlock(d, s, e.behaviors));
  assert.equal(notesOf(e)[0]?.items.length, 1);
  assert.equal(inlineText(notesOf(e)[0]?.items[0]?.content ?? []), "ab\ncd");
  assert.deepEqual(e.selection.focus, { path: [1, 0], offset: 3 });
  type(e, "!");
  assert.equal(inlineText(notesOf(e)[0]?.items[0]?.content ?? []), "ab\n!cd");
});

test("a reference pasted while the original is still there becomes a reference to a copy of the note", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "Shared.");
  const ref = getContent(e.document, [0]).find((n) => n.type === "note");
  e.apply("paste", (d, s) => ({ doc: { blocks: [d.blocks[0] as never, { type: "p", content: [ref as never] }, d.blocks[1] as never] }, selection: s }));
  assert.equal(notesOf(e).length, 1);
  assert.deepEqual(texts(e), ["n1:Shared.", "n2:Shared."]);
});

test("the repair changes nothing when there is nothing to repair", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  const settled = e.document;
  type(e, "x");
  const again = e.document;
  e.apply("noop", (d, s) => ({ doc: { blocks: [...d.blocks] }, selection: s }));
  assert.deepEqual(e.document, again);
  assert.notEqual(settled, again);
});

test("goto moves between a reference and its note", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  assert.equal(e.commands.run("footnote.goto"), true);
  assert.deepEqual(e.selection.focus, { path: [0], offset: 6 });
  assert.equal(e.commands.run("footnote.goto"), true);
  assert.deepEqual(e.selection.focus, { path: [1, 0], offset: 0 });
});

test("a document with notes is written and read back unchanged", () => {
  const html = '<p>A<sup data-note="x"><a href="#fn-x" id="fnref-x" role="doc-noteref">1</a></sup> b</p>'
    + '<section class="footnotes" role="doc-endnotes"><ol><li id="fn-x" data-note="x">Note <a href="#fnref-x" role="doc-backlink">↩︎</a></li></ol></section>';
  const e = make(html);
  assert.equal(exportHtml(e.document), html);
});

const notesIn = (doc: ReturnType<typeof importHtml>) => doc.blocks.flatMap((b) => (b.type === "ol" && b.notes ? b.items.map((i) => `${i.id}:${inlineText(i.content)}`) : []));

test("notes written by other tools are read: the GitHub form and the Pandoc form, with the way back taken out", () => {
  const github = importHtml('<p>Text<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref>1</a></sup></p>'
    + '<section data-footnotes class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2><ol><li id="user-content-fn-1"><p>The note <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref">↩</a></p></li></ol></section>');
  assert.deepEqual(github.blocks.map((b) => b.type), ["p", "ol"]);
  assert.deepEqual(notesIn(github), ["1:The note"]);
  assert.equal(getContent(github, [0]).some((n) => n.type === "note" && n.id === "1"), true);
  const pandoc = importHtml('<p>Hi<a href="#fn1" class="footnote-ref" id="fnref1" role="doc-noteref"><sup>1</sup></a></p>'
    + '<section id="footnotes" class="footnotes footnote-section" role="doc-endnotes"><hr><ol><li id="fn1"><p>Note.<a href="#fnref1" class="footnote-back" role="doc-backlink">↩︎</a></p></li></ol></section>');
  assert.deepEqual(pandoc.blocks.map((b) => b.type), ["p", "ol"]);
  assert.deepEqual(notesIn(pandoc), ["1:Note."]);
});

test("a link that merely points at a fragment is still a link, and an id that is not safe is refused", () => {
  const d = importHtml('<p><a href="#fn-x">see</a> <sup data-note="a&quot; onclick=&quot;x">1</sup></p>');
  assert.equal(getContent(d, [0]).some((n) => n.type === "note"), false);
  assert.equal(exportHtml(d), '<p><a href="#fn-x">see</a> <sup>1</sup></p>');
});

test("Enter in the second of two notes leaves the first alone and keeps both ids", () => {
  const e = make("<p>one two</p>");
  at(e, [0], 3);
  e.commands.run("footnote.insert");
  type(e, "alpha");
  at(e, [0], 9);
  e.commands.run("footnote.insert");
  type(e, "beta");
  at(e, [1, 1], 2);
  e.apply("enter", (d, s) => splitBlock(d, s, e.behaviors));
  assert.deepEqual(texts(e), ["n1:alpha", "n2:be\nta"]);
  assert.deepEqual(e.selection.focus, { path: [1, 1], offset: 3 });
});

test("a note holding more than text keeps what it holds", () => {
  const html = '<p>A<sup data-note="x"><a href="#fn-x" id="fnref-x" role="doc-noteref">1</a></sup></p>'
    + '<section class="footnotes" role="doc-endnotes"><ol><li id="fn-x" data-note="x">Text<pre>code</pre> <a href="#fnref-x" role="doc-backlink">↩︎</a></li></ol></section>';
  const e = make(html);
  const list = notesOf(e)[0];
  assert.equal(list?.items[0]?.children[0]?.type, "pre");
});

test("copying text that has a reference writes its note too, and pasting it back makes a note of its own", async () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "Carried.");
  const copied = e.copyFormatters.flatMap((f) => { const r = f([e.document.blocks[0] as never]); return r ? [r] : []; })[0];
  assert.match(copied?.["text/html"] ?? "", /<section class="footnotes".*Carried\./);
  // Pasting that HTML while the original is still there: the pasted note gets a new id, and the original keeps its own.
  const pasted = importHtml(copied?.["text/html"] ?? "").blocks;
  const out = (await e.pasteTransforms[0]?.(pasted)) ?? pasted;
  const ids = out.flatMap((b) => (b.type === "ol" && b.notes ? b.items.map((i) => i.id) : []));
  assert.equal(ids.length, 1);
  assert.notEqual(ids[0], "n1");
  assert.equal(getContent({ blocks: out }, [0]).some((n) => n.type === "note" && n.id === ids[0]), true);
});

test("a copy of the whole document with its notes is the same document", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "Kept.");
  const again = make("<p>x</p>");
  again.setDocument(importHtml(exportHtml(e.document)));
  assert.equal(exportHtml(again.document), exportHtml(e.document));
});

test("Enter at the end of a note starts an empty paragraph there", () => {
  const e = make("<p>Hello world</p>");
  at(e, [0], 5);
  e.commands.run("footnote.insert");
  type(e, "abc");
  e.apply("enter", (d, s) => splitBlock(d, s, e.behaviors));
  assert.equal(notesOf(e)[0]?.items.length, 1);
  assert.deepEqual(e.selection.focus, { path: [1, 0], offset: 4 });
  type(e, "d");
  assert.equal(inlineText(notesOf(e)[0]?.items[0]?.content ?? []), "abc\nd");
});
