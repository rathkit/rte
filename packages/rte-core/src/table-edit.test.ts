import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteBackward, deleteForward, deleteSelection, deleteWord, insertText, splitBlock } from "./edit.ts";
import { exportHtml } from "./export.ts";
import { importHtml } from "./import.ts";
import { caret, type Path } from "./path.ts";

// Editing next to and inside tables must never join cells, pull a block into a cell or cut a table in two, with or without the tables plugin.
const page = `<p>before</p><table><tbody><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></tbody></table><p>after</p>`;
const doc = () => importHtml(page);
const html = (d: ReturnType<typeof doc>) => exportHtml(d).replace(/<\/?tbody>/g, "");
const at = (path: Path, offset: number) => ({ path, offset });
const A: Path = [1, 0, 0, 0], B: Path = [1, 0, 1, 0], C: Path = [1, 1, 0, 0], D: Path = [1, 1, 1, 0];

test("Backspace at the start of a cell does nothing; Delete at the end of one does nothing", () => {
  for (const cell of [A, B, C, D]) {
    assert.equal(html(deleteBackward(doc(), caret(at(cell, 0))).doc), html(doc()));
    assert.equal(html(deleteForward(doc(), caret(at(cell, 2))).doc), html(doc()));
    assert.equal(html(deleteWord(doc(), caret(at(cell, 0)), "backward").doc), html(doc()));
    assert.equal(html(deleteWord(doc(), caret(at(cell, 2)), "forward").doc), html(doc()));
  }
});

test("at the edge of a table the caret steps into it instead of pulling it apart", () => {
  const back = deleteBackward(doc(), caret(at([2], 0)));
  assert.equal(html(back.doc), html(doc()));
  assert.deepEqual(back.selection.focus, at(D, 2), "Backspace after the table goes to the end of its last cell");
  const forward = deleteForward(doc(), caret(at([0], 6)));
  assert.equal(html(forward.doc), html(doc()));
  assert.deepEqual(forward.selection.focus, at(A, 0), "Delete before the table goes to the start of its first cell");
});

test("inside a cell Backspace and Delete still work, and joining two paragraphs of one cell is allowed", () => {
  assert.equal(html(deleteBackward(doc(), caret(at(B, 2))).doc), page.replace("<td>cd</td>", "<td>c</td>").replace(/<\/?tbody>/g, ""));
  const two = importHtml(`<table><tbody><tr><td><p>one</p><p>two</p></td></tr></tbody></table>`);
  assert.equal(exportHtml(deleteBackward(two, caret(at([0, 0, 0, 1], 0))).doc), `<table><tbody><tr><td>onetwo</td></tr></tbody></table>`);
});

test("a selection from one cell to another trims the two ends and empties the cells between, and never merges cells", () => {
  assert.equal(html(deleteSelection(doc(), { anchor: at(A, 1), focus: at(D, 1) }).doc), `<p>before</p><table><tr><td>a</td><td></td></tr><tr><td></td><td>h</td></tr></table><p>after</p>`);
  const backwards = deleteSelection(doc(), { anchor: at(D, 1), focus: at(A, 1) });
  assert.equal(html(backwards.doc), `<p>before</p><table><tr><td>a</td><td></td></tr><tr><td></td><td>h</td></tr></table><p>after</p>`);
  assert.deepEqual(backwards.selection.focus, at(A, 1));
});

test("typing, Enter and replacing over a selection across cells go to the first cell", () => {
  assert.equal(html(insertText(doc(), { anchor: at(A, 1), focus: at(C, 1) }, "X").doc), `<p>before</p><table><tr><td>aX</td><td></td></tr><tr><td>f</td><td>gh</td></tr></table><p>after</p>`);
  const split = splitBlock(doc(), { anchor: at(A, 1), focus: at(B, 1) });
  assert.match(html(split.doc), /<td><p>a<\/p><p><\/p><\/td><td>d<\/td>/);
});

test("a selection that starts outside a table and ends in it deletes only the outside part, and the same from inside to outside", () => {
  assert.equal(html(deleteSelection(doc(), { anchor: at([0], 3), focus: at(A, 1) }).doc), `<p>bef</p><table><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></table><p>after</p>`);
  assert.equal(html(deleteSelection(doc(), { anchor: at(D, 1), focus: at([2], 2) }).doc), `<p>before</p><table><tr><td>ab</td><td>cd</td></tr><tr><td>ef</td><td>gh</td></tr></table><p>ter</p>`);
});

test("a table wholly inside the selection goes, as a table", () => {
  const result = deleteSelection(doc(), { anchor: at([0], 3), focus: at([2], 2) });
  assert.equal(html(result.doc), "<p>befter</p>");
  assert.deepEqual(result.selection.focus, at([0], 3));
});

test("a table inside a cell is protected the same way", () => {
  const nested = importHtml(`<table><tbody><tr><td><p>x</p><table><tbody><tr><td>in</td></tr></tbody></table><p>y</p></td></tr></tbody></table>`);
  const inner: Path = [0, 0, 0, 1, 0, 0, 0];
  assert.equal(exportHtml(deleteBackward(nested, caret(at(inner, 0))).doc), exportHtml(nested));
  assert.equal(exportHtml(deleteSelection(nested, { anchor: at([0, 0, 0, 0], 0), focus: at([0, 0, 0, 2], 1) }).doc), `<table><tbody><tr><td></td></tr></tbody></table>`);
});
