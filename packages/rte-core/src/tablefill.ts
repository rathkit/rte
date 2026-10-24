// Pasting a table into a table: the pasted cells go into the cells of the table, cell by cell, starting at the selected cell, as pasting
// copied spreadsheet cells into a spreadsheet does. The table grows to take what does not fit. A single pasted cell fills every selected cell.
import type { Block, Doc, Table, TableCell } from "./model.ts";
import { caret, containerPaths, fixup, mapBlockList, type EditResult, type Selection } from "./path.ts";
import { extent, fromGrid, inRow, meets, selectedCells, toGrid, type Grid, type Placed } from "./tablegrid.ts";

const blank = (): TableCell => ({ header: false, colspan: 1, rowspan: 1, blocks: [{ type: "p", content: [] }] });

/** The grid with blank cells added until it is at least this many rows and columns. */
function grown(grid: Grid, rows: number, cols: number): Grid {
  const cells: Placed[] = [...grid.cells];
  for (let r = grid.rows; r < rows; r++) for (let c = 0; c < Math.max(cols, grid.cols); c++) cells.push({ cell: blank(), row: r, col: c });
  for (let c = grid.cols; c < cols; c++) for (let r = 0; r < Math.max(rows, grid.rows); r++) if (r < grid.rows) cells.push({ cell: blank(), row: r, col: c });
  const widthRows = Math.max(rows, grid.rows);
  const widthCols = Math.max(cols, grid.cols);
  return {
    cells, rows: widthRows, cols: widthCols,
    widths: Array.from({ length: widthCols }, (_, i) => grid.widths[i] ?? null),
    heights: Array.from({ length: widthRows }, (_, i) => grid.heights[i] ?? null),
  };
}

/** What a pasted cell gives to the cell it lands in: its content, and its look when it has one. */
const filled = (target: TableCell, from: TableCell): TableCell => ({
  ...target,
  blocks: from.blocks,
  ...(from.background ? { background: from.background } : {}),
  ...(from.border ? { border: from.border } : {}),
});

/** Puts `source` into the table the selection is in, or returns undefined when the selection is not in a table. */
export function fillTable(doc: Doc, sel: Selection, source: Table): EditResult | undefined {
  const found = selectedCells(doc, sel);
  if (!found) return undefined;
  const { rect, where } = found;
  const from = toGrid(source);
  if (from.cells.length === 0) return undefined;
  const single = from.cells.length === 1 ? from.cells[0] : undefined;
  let grid: Grid = found.grid;
  const replace = new Map<Placed, TableCell>();
  if (single && found.count > 1) {
    // One pasted cell fills every selected cell.
    for (const p of grid.cells) if (meets(rect, extent(p))) replace.set(p, filled(p.cell, single.cell));
  } else {
    grid = grown(grid, rect.top + from.rows, rect.left + from.cols);
    for (const p of from.cells) {
      const row = rect.top + p.row;
      const col = rect.left + p.col;
      const target = grid.cells.find((q) => q.row <= row && row < q.row + q.cell.rowspan && q.col <= col && col < q.col + q.cell.colspan);
      if (target) replace.set(target, filled(replace.get(target) ?? target.cell, p.cell));
    }
  }
  const cells = grid.cells.map((p) => (replace.has(p) ? { ...p, cell: replace.get(p) as TableCell } : p));
  const table = fromGrid({ ...grid, cells });
  const next = fixup(mapBlockList(doc, where.table, (blocks, index) => [...blocks.slice(0, index), table as Block, ...blocks.slice(index + 1)]));
  // The caret goes to the first cell that was filled.
  const first = cells.find((p) => p.row === rect.top && p.col === rect.left) ?? cells[0] as Placed;
  const prefix = [...where.table, first.row, inRow(cells, first.row).indexOf(first)];
  const path = containerPaths(next).find((p) => p.length > prefix.length && prefix.every((v, i) => p[i] === v));
  return { doc: next, selection: path ? caret({ path, offset: 0 }) : sel };
}

/** Plain text with tabs between cells and a line to a row (what a spreadsheet or a terminal copies) as a table; undefined when it is not that. */
export function tableFromText(text: string): Table | undefined {
  if (!text.includes("\t")) return undefined;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const width = Math.max(...lines.map((line) => line.split("\t").length));
  const rows = lines.map((line) => {
    const cells = line.split("\t").map((value): TableCell => ({ header: false, colspan: 1, rowspan: 1, blocks: [{ type: "p", content: value === "" ? [] : [{ type: "text", text: value, marks: [] }] }] }));
    while (cells.length < width) cells.push(blank());
    return cells;
  });
  return { type: "table", rows };
}
