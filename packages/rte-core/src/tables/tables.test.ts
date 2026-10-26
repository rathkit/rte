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

const across = (e: ReturnType<typeof make>, from: [number, number], to: [number, number]) => {
  const table = e.document.blocks.findIndex((b) => b.type === "table");
  const find = ([r, c]: [number, number]) => containerPaths(e.document).find((p) => p[0] === table && p[1] === r && p[2] === c) as number[];
  e.setSelection({ anchor: { path: find(from), offset: 0 }, focus: { path: find(to), offset: 0 } });
};

test("merge: the rectangle of cells becomes one cell that spans them, with their content in reading order", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  across(e, [0, 0], [1, 1]);
  assert.equal(e.commands.state("table.mergeCells").enabled, true);
  e.commands.run("table.mergeCells");
  assert.equal(html(e), `<table><tbody><tr><td colspan="2" rowspan="2"><p>a</p><p>b</p><p>c</p><p>d</p></td></tr><tr></tr></tbody></table>`);
  assert.deepEqual(e.selection.focus.path, [0, 0, 0, 0]);
  e.undo();
  assert.equal(html(e), cells([["a", "b"], ["c", "d"]]));
  const row = make(cells([["a", "b", "c"], ["d", "e", "f"]]));
  across(row, [0, 0], [0, 1]);
  row.commands.run("table.mergeCells");
  assert.equal(html(row), `<table><tbody><tr><td colspan="2"><p>a</p><p>b</p></td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr></tbody></table>`);
});

test("merge skips empty cells, and takes in any spanning cell the rectangle cuts through", () => {
  const e = make(cells([["a", ""], ["", "d"]]));
  across(e, [0, 0], [0, 1]);
  e.commands.run("table.mergeCells");
  assert.equal(html(e), `<table><tbody><tr><td colspan="2">a</td></tr><tr><td></td><td>d</td></tr></tbody></table>`);
  const cut = make(`<table><tbody><tr><td colspan="2">a</td></tr><tr><td>b</td><td>c</td></tr></tbody></table>`);
  across(cut, [0, 0], [1, 0]);
  cut.commands.run("table.mergeCells");
  assert.equal(html(cut), `<table><tbody><tr><td colspan="2" rowspan="2"><p>a</p><p>b</p><p>c</p></td></tr><tr></tr></tbody></table>`);
});

test("split: a spanning cell goes back to single cells, the content stays in the first", () => {
  const e = make(`<table><tbody><tr><td colspan="2" rowspan="2"><p>a</p><p>b</p></td><td>x</td></tr><tr><td>y</td></tr></tbody></table>`);
  inCell(e, 0, 0);
  assert.equal(e.commands.state("table.splitCell").enabled, true);
  e.commands.run("table.splitCell");
  assert.equal(html(e), `<table><tbody><tr><td><p>a</p><p>b</p></td><td></td><td>x</td></tr><tr><td></td><td></td><td>y</td></tr></tbody></table>`);
  assert.equal(e.commands.state("table.splitCell").enabled, false, "a single cell cannot be split");
});

test("merge needs a selection across cells of one table; with a caret it is off", () => {
  const e = make(`<p>x</p>${cells([["a", "b"]])}`);
  inCell(e, 0, 0);
  assert.equal(e.commands.state("table.mergeCells").enabled, false);
  assert.equal(e.commands.run("table.mergeCells"), false);
  const two = make(`${cells([["a"]])}${cells([["b"]])}`);
  const paths = containerPaths(two.document);
  two.setSelection({ anchor: { path: paths[0] as number[], offset: 0 }, focus: { path: paths[1] as number[], offset: 0 } });
  assert.equal(two.commands.state("table.mergeCells").enabled, false, "two different tables");
});

test("column widths are read from colgroup or the first row, only in forms the model accepts, and written back as a colgroup", () => {
  const e = make(`<table><colgroup><col style="width: 30%"><col width="120"><col style="width: 9em"></colgroup><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>`);
  assert.equal(html(e), `<table><colgroup><col style="width: 30%"><col style="width: 120px"><col></colgroup><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>`);
  const widthsFromRow = make(`<table><tbody><tr><td width="70">a</td><td style="width:35%">b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>`);
  assert.equal(html(widthsFromRow), `<table><colgroup><col style="width: 70px"><col style="width: 35%"></colgroup><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>`);
  assert.equal(html(make(cells([["a"]]))), cells([["a"]]), "no colgroup when nothing sets a width");
});

test("the column width command sets, reports and clears the width of the caret's column, and keeps the caret where it is", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 1, 1);
  const before = e.selection;
  assert.equal(e.commands.state("table.columnWidth").value, "");
  assert.equal(e.commands.run("table.columnWidth", { width: "25%" }), true);
  assert.equal(html(e), `<table><colgroup><col><col style="width: 25%"></colgroup><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>`);
  assert.equal(e.commands.state("table.columnWidth").value, "25%");
  assert.deepEqual(e.selection, before);
  e.commands.run("table.columnWidth", { width: "80" });
  assert.equal(e.commands.state("table.columnWidth").value, "80px", "a bare number is pixels");
  assert.equal(e.commands.run("table.columnWidth", { width: "wide" }), false, "not a width");
  assert.equal(e.commands.run("table.columnWidth", { width: "" }), true);
  assert.equal(html(e), cells([["a", "b"], ["c", "d"]]), "automatic again, so no colgroup");
});

test("widths follow their columns when columns are added or removed", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 0, 0);
  e.commands.run("table.columnWidth", { width: "100px" });
  e.commands.run("table.columnBefore");
  assert.match(html(e), /<colgroup><col><col style="width: 100px"><col><\/colgroup>/);
  e.commands.run("table.deleteColumn");
  assert.match(html(e), /<colgroup><col style="width: 100px"><col><\/colgroup>/);
  inCell(e, 0, 0);
  e.commands.run("table.deleteColumn");
  assert.equal(html(e), cells([["b"], ["d"]]), "the width went with its column");
});

test("how cells look: background and border are read from a cell's style, written back, and set on the selected cells", () => {
  const e = make('<table><tbody><tr style="height: 40px"><td style="background-color: #FFF3BF; border: 2px dashed rgb(0, 0, 0)">a</td><td style="background: url(x); border: 1px double red">b</td></tr><tr><td bgcolor="blue">c</td><td>d</td></tr></tbody></table>');
  assert.equal(html(e), '<table><tbody><tr style="height: 40px"><td style="background-color: #fff3bf; border: 2px dashed rgb(0, 0, 0);">a</td><td>b</td></tr><tr><td style="background-color: blue;">c</td><td>d</td></tr></tbody></table>', "only plain colors and solid, dashed or dotted lines; the rest is dropped");
  const f = make(cells([["a", "b"], ["c", "d"]]));
  inCell(f, 0, 0);
  assert.equal(f.commands.state("table.cellBackground").value, "");
  assert.equal(f.commands.state("table.cellBorder").value, "default");
  f.commands.run("table.cellBackground", "#C8E6C9");
  f.commands.run("table.cellBorder", "thick");
  assert.equal(html(f), '<table><tbody><tr><td style="background-color: #c8e6c9; border: 3px solid currentcolor;">a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>');
  assert.equal(f.commands.state("table.cellBackground").value, "#c8e6c9");
  assert.equal(f.commands.state("table.cellBorder").value, "thick");
  assert.equal(f.commands.run("table.cellBackground", "url(javascript:x)"), false);
  assert.equal(f.commands.run("table.cellBorder", "wavy"), false);
  assert.equal(f.commands.run("table.cellBorder", { style: "solid", width: 20 }), false, "too wide");
  f.commands.run("table.cellBorder", { style: "dotted", width: 2, color: "#336699" });
  assert.match(html(f), /border: 2px dotted #336699/);
  f.commands.run("table.cellBackground", "");
  f.commands.run("table.cellBorder", "default");
  assert.equal(html(f), cells([["a", "b"], ["c", "d"]]), "back to saying nothing");
});

test("the look is set on every cell of the selected rectangle, and stays with a cell that is merged or split", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  across(e, [0, 0], [1, 0]);
  e.commands.run("table.cellBackground", "yellow");
  assert.equal(html(e), '<table><tbody><tr><td style="background-color: yellow;">a</td><td>b</td></tr><tr><td style="background-color: yellow;">c</td><td>d</td></tr></tbody></table>');
  across(e, [0, 0], [0, 1]);
  e.commands.run("table.mergeCells");
  assert.match(html(e), /<td colspan="2" style="background-color: yellow;"><p>a<\/p><p>b<\/p><\/td>/, "the merged cell keeps the first cell's look");
  inCell(e, 0, 0);
  e.commands.run("table.splitCell");
  assert.equal((html(e).match(/background-color: yellow/g) ?? []).length, 3, "the cells made by splitting share it");
});

test("row height: read, set for the rows a selection covers, and carried with its row", () => {
  const e = make(cells([["a", "b"], ["c", "d"], ["e", "f"]]));
  inCell(e, 1, 0);
  assert.equal(e.commands.state("table.rowHeight").value, "");
  e.commands.run("table.rowHeight", { height: "48" });
  assert.equal(html(e), '<table><tbody><tr><td>a</td><td>b</td></tr><tr style="height: 48px"><td>c</td><td>d</td></tr><tr><td>e</td><td>f</td></tr></tbody></table>');
  assert.equal(e.commands.state("table.rowHeight").value, "48px");
  assert.equal(e.commands.run("table.rowHeight", { height: "tall" }), false);
  assert.equal(e.commands.run("table.rowHeight", { height: "99999" }), false);
  e.commands.run("table.rowBefore");
  assert.match(html(e), /<tr><td><\/td><td><\/td><\/tr><tr style="height: 48px"><td>c<\/td>/, "a new row above leaves the height with its row");
  inCell(e, 2, 0);
  e.commands.run("table.deleteRow");
  assert.doesNotMatch(html(e), /height/, "the row went and so did its height");
  across(e, [0, 0], [1, 0]);
  e.commands.run("table.rowHeight", { height: "30px" });
  assert.equal((html(e).match(/height: 30px/g) ?? []).length, 2, "two rows covered");
  e.commands.run("table.rowHeight", { height: "" });
  assert.doesNotMatch(html(e), /height/);
});


test("lines can differ from side to side: read from the sides, written side by side, and the same four sides collapse to one line", () => {
  const e = make('<table><tbody><tr><td style="border-top: 2px solid red; border-bottom: 1px dashed #333; border-left: none">a</td><td style="border: 1px solid blue; border-right: none">b</td><td style="border: none">c</td></tr></tbody></table>');
  assert.equal(html(e), '<table><tbody><tr><td style="border-top: 2px solid red; border-bottom: 1px dashed #333; border-left: none;">a</td><td style="border-top: 1px solid blue; border-right: none; border-bottom: 1px solid blue; border-left: 1px solid blue;">b</td><td style="border: none;">c</td></tr></tbody></table>');
  const same = make('<table><tbody><tr><td style="border-top: 1px solid red; border-right: 1px solid red; border-bottom: 1px solid red; border-left: 1px solid red">a</td></tr></tbody></table>');
  assert.equal(html(same), '<table><tbody><tr><td style="border: 1px solid red;">a</td></tr></tbody></table>');
  const odd = make('<table><tbody><tr><td style="border-top: 3px double red">a</td></tr></tbody></table>');
  assert.equal(html(odd), cells([["a"]]), "a line that is not solid, dashed or dotted is not kept");
});

test("a line on one edge of the selection goes on the cells along that edge, and off again; the other sides are left as they were", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  across(e, [0, 0], [1, 1]);
  assert.equal(e.commands.state("table.borderTop").active, false);
  e.commands.run("table.borderTop");
  assert.equal(html(e), '<table><tbody><tr><td style="border-top: 1px solid currentcolor;">a</td><td style="border-top: 1px solid currentcolor;">b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>', "only the top row, only its top");
  assert.equal(e.commands.state("table.borderTop").active, true);
  e.commands.run("table.borderRight");
  assert.match(html(e), /<td>c<\/td><td style="border-right: 1px solid currentcolor;">d<\/td>/, "the right edge is the right column; the bottom right cell has only that");
  assert.match(html(e), /<td style="border-top: 1px solid currentcolor;">a<\/td><td style="border-top: 1px solid currentcolor; border-right: 1px solid currentcolor;">b<\/td>/);
  e.commands.run("table.borderTop");
  assert.match(html(e), /<td style="border-top: none;">a<\/td>/, "off means none, not the stylesheet's default");
  assert.equal(e.commands.state("table.borderTop").active, false);
  e.undo();
  assert.equal(e.commands.state("table.borderTop").active, true, "one undo step");
});

test("all four sides set one after another become one line, and a preset over different sides sets them all", () => {
  const e = make(cells([["a"]]));
  inCell(e, 0, 0);
  for (const name of ["table.borderTop", "table.borderRight", "table.borderBottom", "table.borderLeft"]) e.commands.run(name);
  assert.equal(html(e), '<table><tbody><tr><td style="border: 1px solid currentcolor;">a</td></tr></tbody></table>');
  assert.equal(e.commands.state("table.cellBorder").value, "thin");
  e.commands.run("table.borderTop");
  assert.equal(e.commands.state("table.cellBorder").value, "", "different sides are none of the presets");
  e.commands.run("table.cellBorder", "dashed");
  assert.equal(html(e), '<table><tbody><tr><td style="border: 1px dashed currentcolor;">a</td></tr></tbody></table>');
  e.commands.run("table.cellBorder", { line: "thick", sides: ["left", "right"] });
  assert.equal(html(e), '<table><tbody><tr><td style="border-top: 1px dashed currentcolor; border-right: 3px solid currentcolor; border-bottom: 1px dashed currentcolor; border-left: 3px solid currentcolor;">a</td></tr></tbody></table>');
});

test("table.border draws lines on the whole table from any cell; with sides it draws only the outline", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 0, 0);
  assert.equal(e.commands.state("table.border").enabled, true);
  assert.equal(e.commands.run("table.border", "thick"), true);
  const all = html(e);
  assert.equal((all.match(/border: 3px solid/g) ?? []).length, 4, "every cell");
  assert.equal(e.commands.run("table.border", "none"), true);
  assert.equal((html(e).match(/border: none/g) ?? []).length, 4);
  e.commands.run("table.border", { line: "thin", sides: ["top", "right", "bottom", "left"] });
  const outline = html(e);
  assert.match(outline, /<td style="[^"]*border-top: 1px solid[^"]*border-left: 1px solid/, "the top left cell has its top and left");
  assert.doesNotMatch(outline.split("</tr>")[0] ?? "", /<td style="[^"]*border-bottom: 1px solid/, "no outline on an inside edge");
  assert.equal(e.commands.run("table.border", "wavy"), false);
  e.undo();
  assert.equal((html(e).match(/border: none/g) ?? []).length, 4, "one undo step");
  const outside = make("<p>x</p>");
  assert.equal(outside.commands.state("table.border").enabled, false);
});

test("table.rowHeight with a cell changes that cell's row only, whatever is selected", () => {
  const e = make(cells([["a", "b"], ["c", "d"]]));
  inCell(e, 0, 0);
  const second = containerPaths(e.document).find((p) => p[1] === 1 && p[2] === 0);
  assert.ok(second);
  assert.equal(e.commands.run("table.rowHeight", { height: "60px", cell: second }), true);
  assert.match(html(e), /<tr><td>a<\/td><td>b<\/td><\/tr><tr style="height: 60px">/);
  assert.equal(e.commands.run("table.rowHeight", { height: "", cell: second }), true);
  assert.doesNotMatch(html(e), /height/);
  assert.equal(e.commands.run("table.rowHeight", { height: "tall", cell: second }), false);
  assert.equal(e.commands.run("table.rowHeight", { height: "20px", cell: [5, 0, 0, 0] }), false, "no such cell");
});

test("table.sort orders the rows by the caret's column: numbers by value, text by language, empty last, header kept, stable, caret follows", () => {
  const e = make(`<table><tbody><tr><th>Item</th><th>Qty</th></tr>${[["pear", "10"], ["Apple", "9"], ["fig", ""], ["kiwi", "$1,200"], ["apple2", "9"]].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</tbody></table>`);
  const names = () => [...html(e).matchAll(/<td>([^<]*)<\/td><td>/g)].map((m) => m[1]);
  inCell(e, 1, 0);
  assert.equal(e.commands.run("table.sort", "asc"), true);
  assert.deepEqual(names(), ["Apple", "apple2", "fig", "kiwi", "pear"]);
  assert.match(html(e), /^<table><tbody><tr><th scope="col">Item<\/th>/, "the header row stays first");
  assert.deepEqual(e.selection.focus.path.slice(0, 3), [0, 5, 0], "the caret is in the cell that moved with its row: pear is now last");
  inCell(e, 1, 1);
  e.commands.run("table.sort", "desc");
  assert.deepEqual(names(), ["kiwi", "pear", "Apple", "apple2", "fig"], "numbers by value, highest first; the two 9s keep their order; empty last");
  e.commands.run("table.sort", "asc");
  assert.deepEqual(names(), ["Apple", "apple2", "pear", "kiwi", "fig"], "ascending: 9, 9, 10, 1200, empty");
  e.undo();
  assert.deepEqual(names(), ["kiwi", "pear", "Apple", "apple2", "fig"], "one undo step");
});

test("table.sort is off for a table with a cell that spans rows, and outside tables", () => {
  const spanned = make('<table><tbody><tr><td rowspan="2">a</td><td>2</td></tr><tr><td>1</td></tr></tbody></table>');
  inCell(spanned, 0, 1);
  assert.equal(spanned.commands.state("table.sort").enabled, false);
  assert.equal(spanned.commands.run("table.sort", "asc"), false);
  assert.equal(make("<p>x</p>").commands.state("table.sort").enabled, false);
  const one = make(cells([["a", "b"]]));
  inCell(one, 0, 0);
  assert.equal(one.commands.state("table.sort").enabled, false, "one row has nothing to sort");
});

test("sorting moves a row's height with it", () => {
  const e = make('<table><colgroup><col><col></colgroup><tbody><tr><td>b</td></tr><tr style="height: 50px"><td>a</td></tr></tbody></table>');
  inCell(e, 0, 0);
  e.commands.run("table.sort", "asc");
  assert.match(html(e), /<tr style="height: 50px"><td>a<\/td><\/tr><tr><td>b<\/td><\/tr>/);
});
