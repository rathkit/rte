// Tables as a plugin: insert, add and remove rows and columns, the header row, and Tab to move between cells. It uses only what any
// plugin gets from the host.
import type { Plugin } from "../plugin.ts";
import { tableCommands, tableKeys } from "./commands.ts";

export interface TablesOptions {
  /** Tab and Shift+Tab move between cells. Off: the browser keeps Tab for moving focus. Default on. */
  readonly tabBetweenCells?: boolean;
}

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
          { kind: "separator", id: "table-sep-cells" },
          { kind: "button", id: "table-merge", command: "table.mergeCells" },
          { kind: "button", id: "table-split", command: "table.splitCell" },
          { kind: "separator", id: "table-sep-table" },
          { kind: "toggle", id: "table-header", command: "table.header" },
          { kind: "button", id: "table-delete", command: "table.delete" },
        ],
      });
      if (options.tabBetweenCells ?? true) for (const key of tableKeys) host.keybinding(key);
    },
  };
}
