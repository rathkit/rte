// Table editing: adding and removing rows and columns, the header row, moving between cells, and inserting a table. Pure functions over
// the document, like the other edit operations. A cell can span rows and columns, so every change works on a grid of placed cells (each
// cell with the row and column where it starts) and is turned back into rows afterwards.
import type { Block, Doc, Table, TableCell } from "../model.ts";
import { caret, containerPaths, fixup, getBlock, mapBlockList, type EditResult, type Path, type Selection } from "../path.ts";

interface Placed {
  readonly cell: TableCell;
  readonly row: number;
  readonly col: number;
}
interface Grid {
  readonly cells: readonly Placed[];
  readonly rows: number;
  readonly cols: number;
}

/** A cell at a grid position: where it starts, and its place in the table's rows (for building a path to it). */
interface Where {
  /** Path of the table block: `[b]`, or `[b, n]` inside a quote, and so on. */
  readonly table: Path;
  readonly placed: Placed;
}

const blankCell = (header = false): TableCell => ({ header, colspan: 1, rowspan: 1, blocks: [{ type: "p", content: [] }] });

function toGrid(table: Table): Grid {
  const taken = new Set<string>();
  const cells: Placed[] = [];
  let cols = 0;
  let rows = table.rows.length;
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
  return { cells, rows, cols };
}

const inRow = (cells: readonly Placed[], row: number): Placed[] => cells.filter((p) => p.row === row).sort((a, b) => a.col - b.col);

function fromGrid(grid: Grid): Table {
  return { type: "table", rows: Array.from({ length: grid.rows }, (_, r) => inRow(grid.cells, r).map((p) => p.cell)) };
}

/** The innermost table around a container, and the cell the container is in. */
function locate(doc: Doc, path: Path): Where | undefined {
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

export const inTable = (doc: Doc, path: Path): boolean => locate(doc, path) !== undefined;

/** The path of the first container in a table's cell, for putting the caret there. */
function firstContainerIn(doc: Doc, table: Path, row: number, index: number): Path | undefined {
  const prefix = [...table, row, index];
  return containerPaths(doc).find((p) => p.length > prefix.length && prefix.every((v, i) => p[i] === v));
}

/** The cell that covers a grid position, as the row and the index among that row's cells. */
function cellCovering(grid: Grid, row: number, col: number): { row: number; index: number } | undefined {
  const p = grid.cells.find((q) => q.row <= row && row < q.row + q.cell.rowspan && q.col <= col && col < q.col + q.cell.colspan);
  return p ? { row: p.row, index: inRow(grid.cells, p.row).indexOf(p) } : undefined;
}

function replaceTable(doc: Doc, table: Path, next: Table | undefined): Doc {
  return fixup(mapBlockList(doc, table, (blocks, i) => [...blocks.slice(0, i), ...(next ? [next] : []), ...blocks.slice(i + 1)]));
}

/** Runs a change to the grid of the table at the caret and puts the caret in the cell at `target` (a grid position) afterwards. */
function edit(doc: Doc, sel: Selection, change: (grid: Grid, at: Placed) => { grid: Grid; target: { row: number; col: number } } | undefined): EditResult {
  const here = locate(doc, sel.focus.path);
  const table = here && getBlock(doc, here.table);
  if (!here || table?.type !== "table") return { doc, selection: sel };
  const changed = change(toGrid(table), here.placed);
  if (!changed) return { doc, selection: sel };
  const next = replaceTable(doc, here.table, fromGrid(changed.grid));
  const cell = cellCovering(changed.grid, changed.target.row, changed.target.col);
  const path = cell && firstContainerIn(next, here.table, cell.row, cell.index);
  return { doc: next, selection: path ? caret({ path, offset: 0 }) : sel };
}

// ---- rows -------------------------------------------------------------------------------------------------

function insertRowAt(grid: Grid, k: number): Grid {
  // A cell that reaches across the new row grows by one; the rest of the new row gets blank cells.
  const cells: Placed[] = grid.cells.map((p) => (p.row >= k ? { ...p, row: p.row + 1 } : p.row + p.cell.rowspan > k ? { ...p, cell: { ...p.cell, rowspan: p.cell.rowspan + 1 } } : p));
  const covered = (col: number): boolean => grid.cells.some((p) => p.row < k && k < p.row + p.cell.rowspan && p.col <= col && col < p.col + p.cell.colspan);
  for (let col = 0; col < grid.cols; col++) if (!covered(col)) cells.push({ cell: blankCell(), row: k, col });
  return { cells, rows: grid.rows + 1, cols: grid.cols };
}

export function insertRow(doc: Doc, sel: Selection, where: "before" | "after"): EditResult {
  return edit(doc, sel, (grid, at) => {
    const k = where === "before" ? at.row : at.row + at.cell.rowspan;
    return { grid: insertRowAt(grid, k), target: { row: k, col: at.col } };
  });
}

export function deleteRow(doc: Doc, sel: Selection): EditResult {
  const here = locate(doc, sel.focus.path);
  if (!here) return { doc, selection: sel };
  const table = getBlock(doc, here.table);
  if (table?.type === "table" && toGrid(table).rows <= 1) return deleteTable(doc, sel);
  return edit(doc, sel, (grid, at) => {
    const r = at.row;
    const cells: Placed[] = [];
    for (const p of grid.cells) {
      if (p.row === r) {
        // A cell that starts here and reaches further down moves down a row to where the next row picks it up.
        if (p.cell.rowspan > 1) cells.push({ ...p, cell: { ...p.cell, rowspan: p.cell.rowspan - 1 } });
      } else if (p.row < r && r < p.row + p.cell.rowspan) cells.push({ ...p, cell: { ...p.cell, rowspan: p.cell.rowspan - 1 } });
      else cells.push(p.row > r ? { ...p, row: p.row - 1 } : p);
    }
    return { grid: { cells, rows: grid.rows - 1, cols: grid.cols }, target: { row: Math.min(r, grid.rows - 2), col: at.col } };
  });
}

// ---- columns ----------------------------------------------------------------------------------------------

function insertColumnAt(grid: Grid, k: number): Grid {
  const cells: Placed[] = grid.cells.map((p) => (p.col >= k ? { ...p, col: p.col + 1 } : p.col + p.cell.colspan > k ? { ...p, cell: { ...p.cell, colspan: p.cell.colspan + 1 } } : p));
  const covered = (row: number): boolean => grid.cells.some((p) => p.col < k && k < p.col + p.cell.colspan && p.row <= row && row < p.row + p.cell.rowspan);
  for (let row = 0; row < grid.rows; row++) {
    if (covered(row)) continue;
    // A new cell in a row of header cells is a header cell too.
    const rowCells = grid.cells.filter((p) => p.row === row);
    cells.push({ cell: blankCell(rowCells.length > 0 && rowCells.every((p) => p.cell.header)), row, col: k });
  }
  return { cells, rows: grid.rows, cols: grid.cols + 1 };
}

export function insertColumn(doc: Doc, sel: Selection, where: "before" | "after"): EditResult {
  return edit(doc, sel, (grid, at) => {
    const k = where === "before" ? at.col : at.col + at.cell.colspan;
    return { grid: insertColumnAt(grid, k), target: { row: at.row, col: k } };
  });
}

export function deleteColumn(doc: Doc, sel: Selection): EditResult {
  const here = locate(doc, sel.focus.path);
  if (!here) return { doc, selection: sel };
  const table = getBlock(doc, here.table);
  if (table?.type === "table" && toGrid(table).cols <= 1) return deleteTable(doc, sel);
  return edit(doc, sel, (grid, at) => {
    const c = at.col;
    const cells: Placed[] = [];
    for (const p of grid.cells) {
      const reaches = p.col <= c && c < p.col + p.cell.colspan;
      if (reaches && p.cell.colspan === 1) continue;
      if (reaches) cells.push({ ...p, cell: { ...p.cell, colspan: p.cell.colspan - 1 } });
      else cells.push(p.col > c ? { ...p, col: p.col - 1 } : p);
    }
    return { grid: { cells, rows: grid.rows, cols: grid.cols - 1 }, target: { row: at.row, col: Math.min(c, grid.cols - 2) } };
  });
}

// ---- the table as a whole ---------------------------------------------------------------------------------

export function deleteTable(doc: Doc, sel: Selection): EditResult {
  const here = locate(doc, sel.focus.path);
  if (!here) return { doc, selection: sel };
  const next = replaceTable(doc, here.table, undefined);
  // The caret goes to the block that took the table's place, else to the end of the document.
  const paths = containerPaths(next);
  const top = here.table[0] as number;
  const path = paths.find((p) => (p[0] as number) >= top) ?? paths.at(-1) ?? [0];
  return { doc: next, selection: caret({ path, offset: 0 }) };
}

/** Whether the first row is made of header cells. */
export function hasHeaderRow(doc: Doc, path: Path): boolean {
  const here = locate(doc, path);
  const table = here && getBlock(doc, here.table);
  if (table?.type !== "table") return false;
  const first = inRow(toGrid(table).cells, 0);
  return first.length > 0 && first.every((p) => p.cell.header);
}

/** Turns the first row into header cells, or back into plain cells when it already is. */
export function toggleHeaderRow(doc: Doc, sel: Selection): EditResult {
  const on = !hasHeaderRow(doc, sel.focus.path);
  return edit(doc, sel, (grid, at) => ({
    grid: { ...grid, cells: grid.cells.map((p) => (p.row === 0 ? { ...p, cell: { ...p.cell, header: on } } : p)) },
    target: { row: at.row, col: at.col },
  }));
}

/** A table of blank cells. */
export function makeTable(rows: number, cols: number, header = false): Table {
  return { type: "table", rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => blankCell(header && r === 0))) };
}

export interface InsertTableOptions {
  readonly rows?: number;
  readonly cols?: number;
  /** Make the first row header cells. Default: no. */
  readonly header?: boolean;
}

/** Puts a table in place of an empty paragraph, or after the block the caret is in, with the caret in its first cell. */
export function insertTable(doc: Doc, sel: Selection, options: InsertTableOptions = {}): EditResult {
  const rows = Math.max(1, Math.min(options.rows ?? 2, 100));
  const cols = Math.max(1, Math.min(options.cols ?? 2, 100));
  const top = sel.focus.path[0] as number;
  const at = doc.blocks[top];
  if (!at) return { doc, selection: sel };
  const emptyParagraph = at.type === "p" && sel.focus.path.length === 1 && at.content.length === 0;
  const blocks = [...doc.blocks];
  blocks.splice(emptyParagraph ? top : top + 1, emptyParagraph ? 1 : 0, makeTable(rows, cols, options.header ?? false));
  // Something to type in after the table, so the caret is never trapped in it.
  const last = blocks[blocks.length - 1];
  if (last?.type === "table") blocks.push({ type: "p", content: [] });
  const next = { blocks };
  const tableIndex = emptyParagraph ? top : top + 1;
  const path = firstContainerIn(next, [tableIndex], 0, 0) ?? [tableIndex, 0, 0, 0];
  return { doc: next, selection: caret({ path, offset: 0 }) };
}

// ---- moving between cells ---------------------------------------------------------------------------------

/** The caret moves to the start of the next (or previous) cell. Past the last cell a new row is added; before the first, nothing happens. */
export function moveToCell(doc: Doc, sel: Selection, direction: "next" | "previous"): EditResult | undefined {
  const here = locate(doc, sel.focus.path);
  const table = here && getBlock(doc, here.table);
  if (!here || table?.type !== "table") return undefined;
  const grid = toGrid(table);
  const order = [...grid.cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const i = order.findIndex((p) => p.row === here.placed.row && p.col === here.placed.col);
  const target = order[direction === "next" ? i + 1 : i - 1];
  if (!target) {
    if (direction === "previous") return undefined;
    return edit(doc, sel, (g) => ({ grid: insertRowAt(g, g.rows), target: { row: g.rows, col: 0 } }));
  }
  const path = firstContainerIn(doc, here.table, target.row, inRow(grid.cells, target.row).indexOf(target));
  return path ? { doc, selection: caret({ path, offset: 0 }) } : undefined;
}
