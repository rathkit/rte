// The grid behind a table: each cell placed at the row and column where it starts, with spans taken into account. Shared by the table
// commands and by the view (which draws the selected cells and the column edges). Pure functions over the model.
import type { Block, Doc, Table, TableCell } from "./model.ts";
import { getBlock, pathKey, type Path, type Selection } from "./path.ts";

export interface Placed {
  readonly cell: TableCell;
  readonly row: number;
  readonly col: number;
}
export interface Grid {
  readonly cells: readonly Placed[];
  readonly rows: number;
  readonly cols: number;
  /** The width of each column, or null where it is automatic. */
  readonly widths: readonly (string | null)[];
  /** The least height of each row, or null where it is automatic. */
  readonly heights: readonly (string | null)[];
}



/** A cell found by path: the table it is in, and where the cell sits in the grid. */
export interface Where {
  /** Path of the table block: `[b]`, or `[b, n]` inside a quote, and so on. */
  readonly table: Path;
  readonly placed: Placed;
}

// A table is never changed once made, so its grid is worked out once; a table that is typed in is a new object and gets a new grid.
const gridCache = new WeakMap<Table, Grid>();

export function toGrid(table: Table): Grid {
  const hit = gridCache.get(table);
  if (hit) return hit;
  const cells: Placed[] = [];
  let cols = 0;
  let rows = table.rows.length;
  if (table.rows.every((row) => row.every((cell) => cell.rowspan === 1 && cell.colspan === 1))) {
    // No cell spans anything, so each one sits right after the one before it.
    table.rows.forEach((row, r) => {
      row.forEach((cell, c) => cells.push({ cell, row: r, col: c }));
      cols = Math.max(cols, row.length);
    });
  } else {
    const taken = new Set<string>();
    table.rows.forEach((row, r) => {
      let c = 0;
      for (const cell of row) {
        while (taken.has(`${r},${c}`)) c++;
        cells.push({ cell, row: r, col: c });
        for (let dr = 0; dr < cell.rowspan; dr++) for (let dc = 0; dc < cell.colspan; dc++) taken.add(`${r + dr},${c + dc}`);
        c += cell.colspan;
        cols = Math.max(cols, c);
        rows = Math.max(rows, r + cell.rowspan);
      }
    });
  }
  const grid: Grid = { cells, rows, cols, widths: Array.from({ length: cols }, (_, i) => table.widths?.[i] ?? null), heights: Array.from({ length: rows }, (_, i) => table.heights?.[i] ?? null) };
  gridCache.set(table, grid);
  return grid;
}

export const inRow = (cells: readonly Placed[], row: number): Placed[] => cells.filter((p) => p.row === row).sort((a, b) => a.col - b.col);

export function fromGrid(grid: Grid): Table {
  const rows = Array.from({ length: grid.rows }, (_, r) => inRow(grid.cells, r).map((p) => p.cell));
  return {
    type: "table", rows,
    ...(grid.widths.some((w) => w !== null) ? { widths: grid.widths } : {}),
    ...(grid.heights.some((h) => h !== null) ? { heights: grid.heights.slice(0, grid.rows) } : {}),
  };
}



/** The innermost table around a container, and the cell the container is in. */
export function locateCell(doc: Doc, path: Path): Where | undefined {
  let found: { table: Path; r: number; c: number } | undefined;
  const walk = (blocks: readonly Block[], rest: Path, prefix: Path): void => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (n === undefined || !block) return;
    if (block.type === "quote") walk(block.blocks, more, [...prefix, n]);
    else if (block.type === "table") {
      const [r, c, ...inner] = more;
      if (r === undefined || c === undefined) return;
      found = { table: [...prefix, n], r, c };
      const cell = block.rows[r]?.[c];
      if (cell) walk(cell.blocks, inner, [...prefix, n, r, c]);
    }
  };
  walk(doc.blocks, path, []);
  if (!found) return undefined;
  const table = getBlock(doc, found.table);
  if (table?.type !== "table") return undefined;
  const placed = inRow(toGrid(table).cells, found.r)[found.c];
  return placed ? { table: found.table, placed } : undefined;
}



export interface Rect { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number }

export const extent = (p: Placed): Rect => ({ top: p.row, left: p.col, bottom: p.row + p.cell.rowspan - 1, right: p.col + p.cell.colspan - 1 });
export const meets = (a: Rect, b: Rect): boolean => a.top <= b.bottom && b.top <= a.bottom && a.left <= b.right && b.left <= a.right;

/** The smallest rectangle of whole cells that holds both of the cells the selection starts and ends in. */
export function selectedRect(grid: Grid, a: Placed, b: Placed): Rect {
  let rect: Rect = {
    top: Math.min(a.row, b.row), left: Math.min(a.col, b.col),
    bottom: Math.max(extent(a).bottom, extent(b).bottom), right: Math.max(extent(a).right, extent(b).right),
  };
  // A cell that sticks out of the rectangle pulls the rectangle out to take it in whole.
  for (let grew = true; grew;) {
    grew = false;
    for (const p of grid.cells) {
      const e = extent(p);
      if (!meets(rect, e)) continue;
      const next = { top: Math.min(rect.top, e.top), left: Math.min(rect.left, e.left), bottom: Math.max(rect.bottom, e.bottom), right: Math.max(rect.right, e.right) };
      if (next.top !== rect.top || next.left !== rect.left || next.bottom !== rect.bottom || next.right !== rect.right) { rect = next; grew = true; }
    }
  }
  return rect;
}

/** The two cells a selection runs between, when they are in one table, with the table's grid. */
export function selectedCells(doc: Doc, sel: Selection): { where: Where; grid: Grid; rect: Rect; count: number } | undefined {
  const a = locateCell(doc, sel.anchor.path);
  const b = locateCell(doc, sel.focus.path);
  if (!a || !b || pathKey(a.table) !== pathKey(b.table)) return undefined;
  const table = getBlock(doc, a.table);
  if (table?.type !== "table") return undefined;
  const grid = toGrid(table);
  const rect = selectedRect(grid, a.placed, b.placed);
  return { where: a, grid, rect, count: grid.cells.filter((p) => meets(rect, extent(p))).length };
}

