// Every row of the table in docs/BLOCK-EDGES.md is a test: the document with the caret marked, each of the four keys, the document
// and caret afterwards. A change to what a key does is a change to that table.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { deleteBackward, deleteForward, insertLineBreak, insertText, splitBlock } from "./edit.ts";
import type { Engine } from "./engine.ts";
import { exportHtml } from "./export.ts";
import { footnotes } from "./footnotes/index.ts";
import { importHtml } from "./import.ts";
import { lists } from "./lists/index.ts";
import { inlineText } from "./model.ts";
import { caret, containerPaths, getContent, type Pos } from "./path.ts";

const MARK = "‸";
const keys: Record<string, (e: Engine) => unknown> = {
  Enter: (e) => e.apply("split", (d, s) => splitBlock(d, s, e.behaviors)),
  "Shift+Enter": (e) => e.apply("break", insertLineBreak),
  Backspace: (e) => e.apply("delete", (d, s) => deleteBackward(d, s, e.behaviors)),
  Delete: (e) => e.apply("delete", deleteForward),
};

/** The engine for a document written with the caret marked, and the caret in it. */
function open(marked: string, plugins: "lists" | "notes" = "lists"): Engine {
  const probe = importHtml(marked.replace(MARK, "\u0001"));
  let at: Pos | undefined;
  for (const path of containerPaths(probe)) {
    const offset = inlineText(getContent(probe, path)).indexOf("\u0001");
    if (offset >= 0) { at = { path, offset }; break; }
  }
  assert.ok(at, `no caret mark in ${marked}`);
  const e = createEngine({ doc: importHtml(marked.replace(MARK, "")), platform: "other", onWarning: () => undefined });
  e.use(lists());
  if (plugins === "notes") e.use(footnotes());
  e.setSelection(caret(at));
  return e;
}

/** The document as HTML with the caret marked. */
const marked = (e: Engine): string => exportHtml(insertText(e.document, caret(e.selection.anchor), MARK, []).doc);

const rows = readFileSync(new URL("../../../docs/BLOCK-EDGES.md", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line.startsWith("| ") && !line.startsWith("| Situation") && !line.startsWith("| ---"))
  .map((line) => line.slice(2, -2).split(" | "));
const text = (cell: string): string => cell.replace(/^`|`$/g, "").replace(/\\n/g, "\n");

test("the table in docs/BLOCK-EDGES.md has its rows", () => {
  assert.ok(rows.length >= 60, `only ${rows.length} rows`);
  for (const row of rows) assert.equal(row.length, 6, String(row[0]));
});

for (const row of rows) {
  const [situation, start, ...results] = row as [string, string, string, string, string, string];
  Object.keys(keys).forEach((key, i) => {
    test(`${situation}: ${key}`, () => {
      const from = text(start);
      const e = open(from);
      assert.equal(marked(e), from, "the start is read back as written");
      keys[key]?.(e);
      const expected = results[i] === "(nothing)" ? from : text(results[i] as string);
      assert.equal(marked(e), expected);
    });
  });
}

// ---- footnotes -----------------------------------------------------------------------------------------------------

const NOTES = (note: string): string =>
  `<p>a<sup data-note="q"><a href="#fn-q">1</a></sup>b</p><section class="footnotes" role="doc-endnotes"><ol><li id="fn-q" data-note="q">${note}</li></ol></section>`;
const noteText = (e: Engine): string => inlineText(getContent(e.document, [1, 0]));

test("a note: Backspace at its start does nothing (the text is not lifted into the body)", () => {
  const e = open(NOTES(`${MARK}Q.`), "notes");
  const before = e.document;
  keys.Backspace?.(e);
  assert.equal(e.document, before);
  assert.deepEqual(e.selection.anchor, { path: [1, 0], offset: 0 });
});

test("a note: Delete at the end of the last body paragraph does nothing (the note is not joined to the text)", () => {
  const e = createEngine({ doc: importHtml(NOTES("Q.")), platform: "other", onWarning: () => undefined });
  e.use(lists());
  e.use(footnotes());
  e.setSelection(caret({ path: [0], offset: 3 }));
  const before = e.document;
  keys.Delete?.(e);
  assert.equal(e.document, before);
});

test("a note: Enter at its end starts another paragraph of the same note; Shift+Enter is a soft break", () => {
  const e = open(NOTES(`Q.${MARK}`), "notes");
  keys.Enter?.(e);
  assert.equal(e.document.blocks.length, 2, "still one body paragraph and one notes list");
  const list = e.document.blocks[1];
  assert.ok(list && (list.type === "ol" || list.type === "ul") && list.items.length === 1, "one note");
  const soft = open(NOTES(`Q.${MARK}`), "notes");
  keys["Shift+Enter"]?.(soft);
  assert.match(noteText(soft), /Q\.\n? ?$/u, noteText(soft));
});
