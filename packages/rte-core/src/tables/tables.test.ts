import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { lists } from "../lists/plugin.ts";
import { caret, containerPaths } from "../path.ts";
import { tables } from "./plugin.ts";

const make = (html: string) => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (m) => { throw new Error(m); } });
  e.use(lists());
  e.use(tables());
  return e;
};
const html = (e: ReturnType<typeof make>) => exportHtml(e.document);
/** Puts the caret in the cell at row `r`, cell index `c` of the first table. */
const inCell = (e: ReturnType<typeof make>, r: number, c: number) => {
  const table = e.document.blocks.findIndex((b) => b.type === "table");
  const path = containerPaths(e.document).find((p) => p[0] === table && p[1] === r && p[2] === c);
  assert.ok(path, `no cell ${r},${c}`);
  e.setSelection(caret({ path, offset: 0 }));
};
const cells = (rows: string[][]) => `<table><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

test("insert: a table replaces an empty paragraph, the caret is in its first cell, and there is room to type after it", () => {
  const e = make("<p></p>");
  assert.equal(e.commands.run("table.insert", { rows: 2, cols: 3 }), true);
  assert.equal(html(e), `${cells([["", "", ""], ["", "", ""]])}<p></p>`);
  assert.deepEqual(e.selection.focus.path, [0, 0, 0, 0]);
  const header = make("<p>text</p>");
  header.commands.run("table.insert", { rows: 1, cols: 2, header: true });
  assert.equal(html(header), `<p>text</p><table><tbody><tr><th scope="col"></th><th scope="col"></th></tr></tbody></table><p></p>`);
});

test("rows: above and below the cell, one undo step each", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 0, 1);
  e.commands.run("table.rowAfter");
  assert.equal(html(e), cells([["a", "b"], ["", ""], ["c", "d"]]));
  assert.deepEqual(e.selection.focus.path, [0, 1, 1, 0], "the caret goes to the new row, same column");
  e.commands.run("table.rowBefore");
  assert.equal(html(e), cells([["a", "b"], ["", ""], ["", ""], ["c", "d"]]));
  e.undo();
  assert.equal(html(e), cells([["a", "b"], ["", ""], ["c", "d"]]));
});

test("columns: left and right of the cell", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 1, 0);
  e.commands.run("table.columnAfter");
  assert.equal(html(e), cells([["a", "", "b"], ["c", "", "d"]]));
  e.commands.run("table.columnBefore");
  // The caret went to the new column, so "before" puts another one before that.
  assert.equal(html(e), cells([["a", "", "", "b"], ["c", "", "", "d"]]));
});

test("a new cell in a header row is a header cell", () => {
  const e = make(`<table><tbody><tr><th>a</th><th>b</th></tr><tr><td>c</td><td>d</td></tr></tbody></table>`);
  inCell(e, 0, 0);
  e.commands.run("table.columnAfter");
  assert.equal(html(e), `<table><tbody><tr><th scope="col">a</th><th scope="col"></th><th scope="col">b</th></tr><tr><td>c</td><td></td><td>d</td></tr></tbody></table>`);
});

test("spans: a cell that reaches across a new row or column grows instead of getting a blank neighbor", () => {
  const rowspan = make(`<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr></tbody></table>`);
  inCell(rowspan, 0, 1);
  rowspan.commands.run("table.rowAfter");
  assert.equal(html(rowspan), `<table><tbody><tr><td rowspan="3">a</td><td>b</td></tr><tr><td></td></tr><tr><td>c</td></tr></tbody></table>`);
  const colspan = make(`<table><tbody><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>`);
  inCell(colspan, 1, 0);
  colspan.commands.run("table.columnAfter");
  assert.equal(html(colspan), `<table><tbody><tr><td colspan="3">a</td></tr><tr><td>b</td><td></td><td>c</td></tr></tbody></table>`);
});

test("deleting a row or column; spans shrink or move down; the last one takes the table with it", () => {
  const e = make(cells([["a", "b"], ["c", "d"], ["e", "f"]]));
  inCell(e, 1, 1);
  e.commands.run("table.deleteRow");
  assert.equal(html(e), cells([["a", "b"], ["e", "f"]]));
  inCell(e, 0, 0);
  e.commands.run("table.deleteColumn");
  assert.equal(html(e), cells([["b"], ["f"]]));
  const spans = make(`<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>`);
  inCell(spans, 0, 1);
  spans.commands.run("table.deleteRow");
  assert.equal(html(spans), `<table><tbody><tr><td>a</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>`);
  const one = make(`<p>before</p>${cells([["x"]])}<p>after</p>`);
  inCell(one, 0, 0);
  one.commands.run("table.deleteRow");
  assert.equal(html(one), "<p>before</p><p>after</p>");
  assert.deepEqual(one.selection.focus.path, [1], "the caret lands in the block after");
  const col = make(cells([["x"], ["y"]]));
  inCell(col, 1, 0);
  col.commands.run("table.deleteColumn");
  assert.equal(html(col), "<p></p>", "an editor never ends up with no blocks");
});

test("delete table, and the header row toggle", () => {
  const e = make(`<p>x</p>${cells([["a", "b"], ["c", "d"]])}`);
  inCell(e, 0, 0);
  assert.equal(e.commands.state("table.header").active, false);
  e.commands.run("table.header");
  assert.equal(e.commands.state("table.header").active, true);
  assert.match(html(e), /<th scope="col">a<\/th><th scope="col">b<\/th>/);
  e.commands.run("table.header");
  assert.equal(e.commands.state("table.header").active, false);
  e.commands.run("table.delete");
  assert.equal(html(e), "<p>x</p>");
});

test("the commands are off outside a table", () => {
  const e = make("<p>text</p>");
  for (const name of ["table.rowAfter", "table.deleteColumn", "table.header", "table.nextCell"]) {
    assert.equal(e.commands.state(name).enabled, false, name);
    assert.equal(e.commands.run(name), false, name);
  }
  assert.equal(e.commands.state("table.insert").enabled, true);
});

test("Tab and Shift+Tab move between cells; past the last cell a row is added; in a list inside a cell Tab still indents", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 0, 0);
  const key = (k: string, shift = false) => e.handleKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: shift });
  assert.equal(key("Tab"), true);
  assert.deepEqual(e.selection.focus.path, [0, 0, 1, 0]);
  key("Tab"); key("Tab");
  assert.deepEqual(e.selection.focus.path, [0, 1, 1, 0]);
  assert.equal(key("Tab"), true);
  assert.equal(html(e), cells([["a", "b"], ["c", "d"], ["", ""]]));
  assert.deepEqual(e.selection.focus.path, [0, 2, 0, 0]);
  assert.equal(key("Tab", true), true);
  assert.deepEqual(e.selection.focus.path, [0, 1, 1, 0]);
  inCell(e, 0, 0);
  assert.equal(key("Tab", true), false, "before the first cell nothing happens, so the browser keeps the key");
  const plain = make("<p>text</p>");
  assert.equal(plain.handleKey({ key: "Tab", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), false);
  const inList = make(`<table><tbody><tr><td><ul><li>one</li><li>two</li></ul></td><td>b</td></tr></tbody></table>`);
  const lastItem = containerPaths(inList.document)[1] as number[];
  inList.setSelection(caret({ path: lastItem, offset: 0 }));
  assert.equal(inList.handleKey({ key: "Tab", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.match(exportHtml(inList.document), /<ul><li>one<ul><li>two<\/li><\/ul><\/li><\/ul>/);
});
