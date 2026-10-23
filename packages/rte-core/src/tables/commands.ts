// The table commands and the keys that run them.
import type { CommandDef } from "../commands.ts";
import type { EditorSnapshot } from "../engine.ts";
import type { KeyBinding } from "../keymap.ts";
import { deleteColumn, deleteRow, deleteTable, hasHeaderRow, inTable, insertColumn, insertRow, insertTable, moveToCell, toggleHeaderRow, type InsertTableOptions } from "./tables.ts";

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
