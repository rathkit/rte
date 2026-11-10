// Tables as a plugin: insert, add and remove rows and columns, the header row, and Tab to move between cells. It uses only what any
// plugin gets from the host.
import type { Plugin } from "../plugin.ts";
import type { UiItem } from "../ui.ts";
import { tableCommands, tableKeys } from "./commands.ts";

export interface TablesOptions {
  /** Tab and Shift+Tab move between cells. Off: the browser keeps Tab for moving focus. Default on. */
  readonly tabBetweenCells?: boolean;
}

/** Light tints for the background of a cell: dark text reads on every one. */
const TINTS: readonly (readonly [string, string])[] = [
  ["Yellow", "#fff3bf"], ["Orange", "#ffe0b2"], ["Red", "#ffcdd2"], ["Green", "#c8e6c9"], ["Blue", "#bbdefb"], ["Purple", "#e1bee7"], ["Gray", "#e0e0e0"],
];
const LINES: readonly (readonly [string, string])[] = [["default", "Default lines"], ["none", "No lines"], ["thin", "Thin line"], ["thick", "Thick line"], ["dashed", "Dashed line"], ["dotted", "Dotted line"]];

export function tables(options: TablesOptions = {}): Plugin {
  return {
    id: "rathkit.tables",
    api: "1",
    setup(host) {
      for (const command of tableCommands()) host.command(command);
      host.ui("toolbar.main", {
        kind: "menu", id: "table", label: "Table", icon: "table", group: "insert", order: 1,
        items: [
          { kind: "button", id: "table-insert", command: "table.insert", arg: { rows: 3, cols: 3 }, label: "Insert table (3 by 3)" },
          { kind: "separator", id: "table-sep-rows" },
          { kind: "button", id: "table-row-before", command: "table.rowBefore" },
          { kind: "button", id: "table-row-after", command: "table.rowAfter" },
          { kind: "button", id: "table-row-delete", command: "table.deleteRow" },
          { kind: "separator", id: "table-sep-columns" },
          { kind: "button", id: "table-column-before", command: "table.columnBefore" },
          { kind: "button", id: "table-column-after", command: "table.columnAfter" },
          { kind: "button", id: "table-column-delete", command: "table.deleteColumn" },
          { kind: "dialog", id: "table-column-width", command: "table.columnWidth", label: "Column width…", fields: [{ name: "width", type: "text", label: "Width in px or % (empty for automatic)" }] },
          { kind: "separator", id: "table-sep-cells" },
          { kind: "button", id: "table-merge", command: "table.mergeCells" },
          { kind: "button", id: "table-split", command: "table.splitCell" },
          { kind: "separator", id: "table-sep-move" },
          { kind: "button", id: "table-row-up", command: "table.moveRow", arg: { by: -1 }, label: "Move row up" },
          { kind: "button", id: "table-row-down", command: "table.moveRow", arg: { by: 1 }, label: "Move row down" },
          { kind: "button", id: "table-column-left", command: "table.moveColumn", arg: { by: -1 }, label: "Move column left" },
          { kind: "button", id: "table-column-right", command: "table.moveColumn", arg: { by: 1 }, label: "Move column right" },
          { kind: "separator", id: "table-sep-sort" },
          { kind: "button", id: "table-sort-asc", command: "table.sort", arg: "asc", label: "Sort rows by this column, A to Z" },
          { kind: "button", id: "table-sort-desc", command: "table.sort", arg: "desc", label: "Sort rows by this column, Z to A" },
          { kind: "separator", id: "table-sep-table" },
          { kind: "toggle", id: "table-header", command: "table.header" },
          { kind: "button", id: "table-delete", command: "table.delete" },
        ],
      });
      // How the selected cells look: the color behind, the line round, and the height of their rows.
      host.ui("toolbar.main", {
        kind: "menu", id: "cell-style", label: "Cell style", icon: "cell-style", group: "insert", order: 2,
        items: [
          ...TINTS.map(([name, value]): UiItem => ({ kind: "toggle", id: `cell-fill-${name.toLowerCase()}`, command: "table.cellBackground", arg: value, label: `${name} fill`, swatch: value })),
          { kind: "button", id: "cell-fill-none", command: "table.cellBackground", arg: "", label: "No fill" },
          { kind: "separator", id: "cell-sep-lines" },
          ...LINES.map(([key, label]): UiItem => ({ kind: "toggle", id: `cell-border-${key}`, command: "table.cellBorder", arg: key, label })),
          { kind: "separator", id: "cell-sep-sides" },
          ...(["top", "bottom", "left", "right"] as const).map((side): UiItem => ({ kind: "toggle", id: `cell-edge-${side}`, command: `table.border${side[0]?.toUpperCase()}${side.slice(1)}`, label: `${side[0]?.toUpperCase()}${side.slice(1)} line` })),
          { kind: "separator", id: "cell-sep-height" },
          { kind: "dialog", id: "cell-row-height", command: "table.rowHeight", label: "Row height…", fields: [{ name: "height", type: "text", label: "Least height in px (empty for automatic)" }] },
        ],
      });
      // Lines for the whole table, from anywhere in it.
      host.ui("toolbar.main", {
        kind: "menu", id: "table-style", label: "Table lines", icon: "table-lines", group: "insert", order: 2.5,
        items: [
          ...LINES.map(([key, label]): UiItem => ({ kind: "button", id: `table-border-${key}`, command: "table.border", arg: key, label })),
          { kind: "button", id: "table-border-outline", command: "table.border", arg: { line: "thin", sides: ["top", "right", "bottom", "left"] }, label: "Outline" },
        ],
      });
      if (options.tabBetweenCells ?? true) for (const key of tableKeys) host.keybinding(key);
    },
  };
}
