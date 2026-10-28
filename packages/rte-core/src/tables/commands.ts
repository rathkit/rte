// The table commands and the keys that run them.
import type { CommandDef } from "../commands.ts";
import type { EditorSnapshot } from "../engine.ts";
import { SIDES, type Side } from "../cellborder.ts";
import type { KeyBinding } from "../keymap.ts";
import { canMove, canSort, moveColumn, moveRow, sortRows, cellBackground, cellBorderPreset, hasEdgeLine, toggleEdgeLine, columnWidth, canMerge, canSplit, deleteColumn, deleteRow, deleteTable, hasHeaderRow, inTable, insertColumn, insertRow, insertTable, mergeCells, moveToCell, rowHeight, setCellBackground, setCellBorder, setTableBorder, setColumnWidth, setRowHeight, splitCell, toggleHeaderRow, type InsertTableOptions } from "./tables.ts";

type Def = CommandDef<never, unknown>;
const def = <A, V>(d: CommandDef<A, V>): Def => d as unknown as Def;

const here = (s: EditorSnapshot): boolean => inTable(s.doc, s.selection.focus.path);

export function tableCommands(): readonly Def[] {
  return [
    def<InsertTableOptions | undefined, never>({
      name: "table.insert", label: "Insert table",
      run: (ctx, options) => ctx.apply("table", (doc, sel) => insertTable(doc, sel, options)),
    }),
    def<void, never>({ name: "table.rowBefore", label: "Insert row above", run: (ctx) => ctx.apply("table", (doc, sel) => insertRow(doc, sel, "before")), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.rowAfter", label: "Insert row below", run: (ctx) => ctx.apply("table", (doc, sel) => insertRow(doc, sel, "after")), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.columnBefore", label: "Insert column left", run: (ctx) => ctx.apply("table", (doc, sel) => insertColumn(doc, sel, "before")), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.columnAfter", label: "Insert column right", run: (ctx) => ctx.apply("table", (doc, sel) => insertColumn(doc, sel, "after")), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.deleteRow", label: "Delete row", run: (ctx) => ctx.apply("table", deleteRow), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.deleteColumn", label: "Delete column", run: (ctx) => ctx.apply("table", deleteColumn), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({ name: "table.delete", label: "Delete table", run: (ctx) => ctx.apply("table", deleteTable), state: (s) => ({ enabled: here(s) }) }),
    def<void, never>({
      name: "table.header", label: "Header row",
      run: (ctx) => ctx.apply("table", toggleHeaderRow),
      state: (s) => ({ enabled: here(s), active: hasHeaderRow(s.doc, s.selection.focus.path) }),
    }),
    def<void, never>({ name: "table.mergeCells", label: "Merge cells", run: (ctx) => ctx.apply("table", mergeCells), state: (s) => ({ enabled: canMerge(s.doc, s.selection) }) }),
    def<void, never>({ name: "table.splitCell", label: "Split cell", run: (ctx) => ctx.apply("table", splitCell), state: (s) => ({ enabled: canSplit(s.doc, s.selection.focus.path) }) }),
    def<{ readonly width?: string | null; readonly cell?: readonly number[]; readonly edge?: boolean } | undefined, string>({
      name: "table.columnWidth", label: "Column width",
      // `cell` and `edge` are for a dragged column edge: the cell whose right edge it is, rather than the caret's cell.
      run: (ctx, arg) => ctx.apply("table", (doc, sel) => setColumnWidth(doc, sel, arg?.width, arg?.cell as number[] | undefined, arg?.edge)),
      state: (s) => ({ enabled: here(s), value: columnWidth(s.doc, s.selection.focus.path) }),
    }),
    def<string | null | undefined, string>({
      name: "table.cellBackground", label: "Cell color",
      run: (ctx, color) => ctx.apply("table", (doc, sel) => setCellBackground(doc, sel, color)),
      state: (s) => ({ enabled: here(s), value: cellBackground(s.doc, s.selection) }),
    }),
    def<string | { readonly style?: string; readonly width?: number; readonly color?: string; readonly line?: string; readonly sides?: readonly Side[] } | undefined, string>({
      name: "table.cellBorder", label: "Cell border",
      run: (ctx, choice) => ctx.apply("table", (doc, sel) => setCellBorder(doc, sel, choice, typeof choice === "object" ? choice.sides?.filter((s) => SIDES.includes(s)) : undefined)),
      state: (s) => ({ enabled: here(s), value: cellBorderPreset(s.doc, s.selection) }),
    }),
    // Lines for the whole table: the same choices as a cell's, from anywhere inside it. With `sides` it draws the table's outline.
    def<string | { readonly style?: string; readonly width?: number; readonly color?: string; readonly line?: string; readonly sides?: readonly Side[] } | undefined, never>({
      name: "table.border", label: "Table lines",
      run: (ctx, choice) => ctx.apply("table", (doc, sel) => setTableBorder(doc, sel, choice, typeof choice === "object" ? choice.sides?.filter((s) => SIDES.includes(s)) : undefined)),
      state: (s) => ({ enabled: here(s) }),
    }),
    // A line along one edge of the selection, on or off.
    ...SIDES.map((side) => def<void, never>({
      name: `table.border${side[0]?.toUpperCase()}${side.slice(1)}`, label: `${side[0]?.toUpperCase()}${side.slice(1)} border`,
      run: (ctx) => ctx.apply("table", (doc, sel) => toggleEdgeLine(doc, sel, side)),
      state: (s) => ({ enabled: here(s), active: hasEdgeLine(s.doc, s.selection, side) }),
    })),
    // `cell` is for a dragged grip: the row or column of that cell, rather than the caret's.
    def<{ readonly by?: number; readonly to?: number; readonly after?: boolean; readonly cell?: readonly number[] } | undefined, never>({
      name: "table.moveRow", label: "Move row",
      run: (ctx, arg) => ctx.apply("table", (doc, sel) => moveRow(doc, sel, arg ?? {}, arg?.cell as number[] | undefined)),
      state: (s) => ({ enabled: canMove(s.doc, s.selection.focus.path, "row", -1) || canMove(s.doc, s.selection.focus.path, "row", 1) }),
    }),
    def<{ readonly by?: number; readonly to?: number; readonly after?: boolean; readonly cell?: readonly number[] } | undefined, never>({
      name: "table.moveColumn", label: "Move column",
      run: (ctx, arg) => ctx.apply("table", (doc, sel) => moveColumn(doc, sel, arg ?? {}, arg?.cell as number[] | undefined)),
      state: (s) => ({ enabled: canMove(s.doc, s.selection.focus.path, "column", -1) || canMove(s.doc, s.selection.focus.path, "column", 1) }),
    }),
    def<"asc" | "desc" | { readonly direction?: "asc" | "desc" } | undefined, never>({
      name: "table.sort", label: "Sort rows",
      run: (ctx, arg) => ctx.apply("table", (doc, sel) => sortRows(doc, sel, (typeof arg === "string" ? arg : arg?.direction) === "desc" ? "desc" : "asc")),
      state: (s) => ({ enabled: canSort(s.doc, s.selection.focus.path) }),
    }),
    def<{ readonly height?: string | null; readonly cell?: readonly number[] } | undefined, string>({
      name: "table.rowHeight", label: "Row height",
      // `cell` is for a dragged row edge: the row of that cell, rather than the rows of the selection.
      run: (ctx, arg) => ctx.apply("table", (doc, sel) => setRowHeight(doc, sel, arg?.height, arg?.cell as number[] | undefined)),
      state: (s) => ({ enabled: here(s), value: rowHeight(s.doc, s.selection.focus.path) }),
    }),
    // Moving only: they leave the document alone unless the caret passes the last cell, where a row is added.
    def<void, never>({
      name: "table.nextCell", label: "Next cell",
      run: (ctx) => ctx.apply("table", (doc, sel) => moveToCell(doc, sel, "next") ?? { doc, selection: sel }),
      state: (s) => ({ enabled: here(s) }),
    }),
    def<void, never>({
      name: "table.previousCell", label: "Previous cell",
      run: (ctx) => ctx.apply("table", (doc, sel) => moveToCell(doc, sel, "previous") ?? { doc, selection: sel }),
      state: (s) => ({ enabled: here(s) }),
    }),
  ];
}

// Tab is shared with lists: in a list item the list gets it first, and anywhere else in a table it moves between cells.
export const tableKeys: readonly KeyBinding[] = [
  { key: "Tab", command: "table.nextCell", stack: true },
  { key: "Shift-Tab", command: "table.previousCell", stack: true },
];
