// Table editing: adding and removing rows and columns, the header row, moving between cells, and inserting a table. Pure functions over
// the document, like the other edit operations. A cell can span rows and columns, so every change works on a grid of placed cells (each
// cell with the row and column where it starts) and is turned back into rows afterwards.
import { COLOR_VALUE, COLUMN_WIDTH, ROW_HEIGHT, type Block, type CellBorder, type Doc, type Table, type TableCell } from "../model.ts";
import { caret, containerPaths, fixup, getBlock, mapBlockList, type EditResult, type Path, type Selection } from "../path.ts";
import { sameLine, SIDES, sidesOf, withSides, type Line, type Side } from "../cellborder.ts";
import { extent, fromGrid, inRow, locateCell as locate, meets, selectedCells, toGrid, type Grid, type Placed, type Where } from "../tablegrid.ts";

const blankCell = (header = false): TableCell => ({ header, colspan: 1, rowspan: 1, blocks: [{ type: "p", content: [] }] });

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
function edit(doc: Doc, sel: Selection, change: (grid: Grid, at: Placed) => { grid: Grid; target: { row: number; col: number } } | undefined, keepSelection = false, around: Path = sel.focus.path): EditResult {
  const here = locate(doc, around);
  const table = here && getBlock(doc, here.table);
  if (!here || table?.type !== "table") return { doc, selection: sel };
  const changed = change(toGrid(table), here.placed);
  if (!changed) return { doc, selection: sel };
  const next = replaceTable(doc, here.table, fromGrid(changed.grid));
  if (keepSelection) return { doc: next, selection: sel };
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
  return { ...grid, cells, rows: grid.rows + 1, heights: [...grid.heights.slice(0, k), null, ...grid.heights.slice(k)] };
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
    return { grid: { ...grid, cells, rows: grid.rows - 1, heights: grid.heights.filter((_, i) => i !== r) }, target: { row: Math.min(r, grid.rows - 2), col: at.col } };
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
  return { ...grid, cells, cols: grid.cols + 1, widths: [...grid.widths.slice(0, k), null, ...grid.widths.slice(k)] };
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
    return { grid: { ...grid, cells, cols: grid.cols - 1, widths: grid.widths.filter((_, i) => i !== c) }, target: { row: at.row, col: Math.min(c, grid.cols - 2) } };
  });
}

// ---- merging and splitting --------------------------------------------------------------------------------

/** Whether the selection covers more than one cell, so the cells could be merged. */
export function canMerge(doc: Doc, sel: Selection): boolean {
  return (selectedCells(doc, sel)?.count ?? 0) > 1;
}

/** Whether the cell at the caret spans more than one row or column, so it could be split. */
export function canSplit(doc: Doc, path: Path): boolean {
  const here = locate(doc, path);
  return here !== undefined && (here.placed.cell.colspan > 1 || here.placed.cell.rowspan > 1);
}

const blankParagraph = (block: Block): boolean => block.type === "p" && block.content.length === 0;

/** Joins the cells the selection runs across (the whole rectangle of them) into one that spans them, keeping their content in reading order. */
export function mergeCells(doc: Doc, sel: Selection): EditResult {
  const found = selectedCells(doc, sel);
  if (!found || found.count < 2) return { doc, selection: sel };
  const { grid, rect, where } = found;
  const inside = grid.cells.filter((p) => meets(rect, extent(p))).sort((x, y) => x.row - y.row || x.col - y.col);
  const first = inside[0] as Placed;
  const kept = inside.flatMap((p) => p.cell.blocks.filter((b) => !blankParagraph(b)));
  const merged: Placed = {
    row: rect.top, col: rect.left,
    cell: { ...first.cell, colspan: rect.right - rect.left + 1, rowspan: rect.bottom - rect.top + 1, blocks: kept.length > 0 ? kept : first.cell.blocks },
  };
  const grid2: Grid = { ...grid, cells: [...grid.cells.filter((p) => !meets(rect, extent(p))), merged] };
  const next = replaceTable(doc, where.table, fromGrid(grid2));
  const cell = cellCovering(grid2, rect.top, rect.left);
  const path = cell && firstContainerIn(next, where.table, cell.row, cell.index);
  return { doc: next, selection: path ? caret({ path, offset: 0 }) : sel };
}

/** Cuts the cell at the caret back into single cells: it keeps its content in the top left one, and the rest are blank. */
export function splitCell(doc: Doc, sel: Selection): EditResult {
  return edit(doc, sel, (grid, at) => {
    if (at.cell.colspan === 1 && at.cell.rowspan === 1) return undefined;
    const cells: Placed[] = grid.cells.filter((p) => p.row !== at.row || p.col !== at.col);
    for (let r = at.row; r < at.row + at.cell.rowspan; r++) {
      for (let c = at.col; c < at.col + at.cell.colspan; c++) {
        cells.push(r === at.row && c === at.col ? { ...at, cell: { ...at.cell, colspan: 1, rowspan: 1 } } : { cell: { ...blankCell(at.cell.header), ...(at.cell.background ? { background: at.cell.background } : {}), ...(at.cell.border ? { border: at.cell.border } : {}) }, row: r, col: c });
      }
    }
    return { grid: { ...grid, cells }, target: { row: at.row, col: at.col } };
  });
}

// ---- how cells look: color behind, line round, row height -----------------------------------------------------

/**
 * The line presets people choose from. The color follows the text color, so it reads on any theme. `default` says nothing (a stylesheet
 * decides, and draws its grid); `none` says there is no line, whatever a stylesheet says.
 */
export const BORDER_PRESETS: Readonly<Record<string, CellBorder | null | undefined>> = {
  default: undefined,
  none: null,
  thin: { style: "solid", width: 1, color: "currentcolor" },
  thick: { style: "solid", width: 3, color: "currentcolor" },
  dashed: { style: "dashed", width: 1, color: "currentcolor" },
  dotted: { style: "dotted", width: 1, color: "currentcolor" },
};

/** Which preset a cell's lines are: `default`, `none`, `thin` and so on, or "" when the sides differ or the line is none of them. */
export function borderPreset(cell: TableCell): string {
  const sides = sidesOf(cell);
  if (!SIDES.every((side) => sameLine(sides[side], sides.top))) return "";
  const line = sides.top;
  if (line === undefined) return "default";
  if (line === null) return "none";
  return Object.entries(BORDER_PRESETS).find(([, b]) => b && sameLine(b, line))?.[0] ?? "";
}

/** The cells a change to appearance applies to: those the selection runs across (as a rectangle), or the caret's cell. */
function styled(doc: Doc, sel: Selection, change: (cell: TableCell) => TableCell): EditResult {
  const found = selectedCells(doc, sel);
  if (!found) return { doc, selection: sel };
  const { grid, rect, where } = found;
  const cells = grid.cells.map((p) => (meets(rect, extent(p)) ? { ...p, cell: change(p.cell) } : p));
  return { doc: replaceTable(doc, where.table, fromGrid({ ...grid, cells })), selection: sel };
}

/** The first of the selected cells, for reading back its look. */
function firstCell(doc: Doc, sel: Selection): TableCell | undefined {
  const found = selectedCells(doc, sel);
  return found?.grid.cells.filter((p) => meets(found.rect, extent(p))).sort((a, b) => a.row - b.row || a.col - b.col)[0]?.cell;
}

export const cellBackground = (doc: Doc, sel: Selection): string => firstCell(doc, sel)?.background ?? "";
export const cellBorderPreset = (doc: Doc, sel: Selection): string => { const c = firstCell(doc, sel); return c ? borderPreset(c) : ""; };

/** Puts a color behind the selected cells, or takes it away (an empty color). A value that is not a color changes nothing. */
export function setCellBackground(doc: Doc, sel: Selection, color: string | null | undefined): EditResult {
  const value = (color ?? "").trim().toLowerCase();
  if (value !== "" && !COLOR_VALUE.test(value)) return { doc, selection: sel };
  return styled(doc, sel, ({ background: _old, ...rest }) => (value === "" ? rest : { ...rest, background: value }));
}

/** A line from what a command was given: a preset name, or `{ style, width, color }`. `false` if it is neither. */
function lineFrom(choice: unknown): CellBorder | null | undefined | false {
  if (typeof choice === "string") return choice in BORDER_PRESETS ? BORDER_PRESETS[choice] : false;
  const given = choice as { style?: string; width?: number; color?: string; line?: string } | undefined;
  if (given?.line !== undefined) return lineFrom(given.line);
  if (given && (given.style === "solid" || given.style === "dashed" || given.style === "dotted")) {
    const width = Math.round(given.width ?? 1);
    const color = (given.color ?? "currentcolor").trim().toLowerCase();
    return width >= 1 && width <= 8 && COLOR_VALUE.test(color) ? { style: given.style, width, color } : false;
  }
  return false;
}

/**
 * Draws a line on the selected cells: a preset name (`default`, `none`, `thin`, `thick`, `dashed`, `dotted`) or `{ style, width, color }`
 * (or `{ line: <preset> }`), on all four sides of each cell, or, with `sides`, on those sides of the selection as a whole: the top
 * of the cells along its top edge, and so on, as a table editor draws the outline of a selected block.
 */
export function setCellBorder(doc: Doc, sel: Selection, choice: unknown, sides?: readonly Side[]): EditResult {
  return drawBorder(doc, sel, choice, sides, false);
}

/** The same for the whole table whatever is selected: every cell, or with `sides` the outline of the table. */
export function setTableBorder(doc: Doc, sel: Selection, choice: unknown, sides?: readonly Side[]): EditResult {
  return drawBorder(doc, sel, choice, sides, true);
}

function drawBorder(doc: Doc, sel: Selection, choice: unknown, sides: readonly Side[] | undefined, whole: boolean): EditResult {
  const line = lineFrom(choice);
  if (line === false) return { doc, selection: sel };
  const found = selectedCells(doc, sel);
  if (!found) return { doc, selection: sel };
  const { grid, where } = found;
  const rect = whole ? { top: 0, left: 0, bottom: grid.rows - 1, right: grid.cols - 1 } : found.rect;
  const cells = grid.cells.map((p) => {
    if (!meets(rect, extent(p))) return p;
    const e = extent(p);
    const edges: Record<Side, boolean> = { top: e.top === rect.top, right: e.right === rect.right, bottom: e.bottom === rect.bottom, left: e.left === rect.left };
    const change: Partial<Record<Side, Line>> = {};
    for (const side of sides ?? SIDES) if (!sides || edges[side]) change[side] = line;
    return { ...p, cell: withSides(p.cell, change) };
  });
  return { doc: replaceTable(doc, where.table, fromGrid({ ...grid, cells })), selection: sel };
}

/** Whether the selection has a line along this edge: every cell on that edge of it has one on that side. */
export function hasEdgeLine(doc: Doc, sel: Selection, side: Side): boolean {
  const found = selectedCells(doc, sel);
  if (!found) return false;
  const { grid, rect } = found;
  const along = grid.cells.filter((p) => {
    if (!meets(rect, extent(p))) return false;
    const e = extent(p);
    return side === "top" ? e.top === rect.top : side === "bottom" ? e.bottom === rect.bottom : side === "left" ? e.left === rect.left : e.right === rect.right;
  });
  return along.length > 0 && along.every((p) => { const line = sidesOf(p.cell)[side]; return line !== undefined && line !== null; });
}

/** Turns the line along one edge of the selection on (a thin line) or off, whichever it is not now. */
export function toggleEdgeLine(doc: Doc, sel: Selection, side: Side): EditResult {
  return setCellBorder(doc, sel, hasEdgeLine(doc, sel, side) ? "none" : "thin", [side]);
}

/** The height asked for the row the caret's cell starts in, or "" for automatic. */
export function rowHeight(doc: Doc, path: Path): string {
  const here = locate(doc, path);
  const table = here && getBlock(doc, here.table);
  return table?.type === "table" ? (toGrid(table).heights[here!.placed.row] ?? "") : "";
}

/**
 * Sets the least height of the rows the selection covers: a number of pixels (`40`, `40px`), or nothing for automatic. Anything else
 * changes nothing.
 */
export function setRowHeight(doc: Doc, sel: Selection, height: string | null | undefined): EditResult {
  const raw = (height ?? "").trim().toLowerCase();
  const value = raw === "" ? null : /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
  if (value !== null && !ROW_HEIGHT.test(value)) return { doc, selection: sel };
  const found = selectedCells(doc, sel);
  if (!found) return { doc, selection: sel };
  const { grid, rect, where } = found;
  const heights = grid.heights.map((h, r) => (r >= rect.top && r <= rect.bottom ? value : h));
  return { doc: replaceTable(doc, where.table, fromGrid({ ...grid, heights })), selection: sel };
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

// ---- column width -------------------------------------------------------------------------------------------

/** The width of the column the caret's cell starts in, as a CSS length, or "" when it is automatic. */
export function columnWidth(doc: Doc, path: Path): string {
  const here = locate(doc, path);
  const table = here && getBlock(doc, here.table);
  return table?.type === "table" ? (toGrid(table).widths[here!.placed.col] ?? "") : "";
}

/**
 * Sets the width of the column the caret's cell starts in: a number with `px` or `%` (a bare number is pixels), or nothing for automatic.
 * Anything else changes nothing.
 */
export function setColumnWidth(doc: Doc, sel: Selection, width: string | null | undefined, cell?: Path, edge = false): EditResult {
  const raw = (width ?? "").trim().toLowerCase();
  const value = raw === "" ? null : /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
  if (value !== null && !COLUMN_WIDTH.test(value)) return { doc, selection: sel };
  // `cell` names another cell than the caret's (a dragged edge); `edge` means the last column the cell spans, which is the edge that was dragged.
  return edit(doc, sel, (grid, at) => {
    const column = edge ? at.col + at.cell.colspan - 1 : at.col;
    return { grid: { ...grid, widths: grid.widths.map((w, i) => (i === column ? value : w)) }, target: { row: at.row, col: at.col } };
  }, true, cell ?? sel.focus.path);
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
