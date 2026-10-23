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
      if (options.tabBetweenCells ?? true) for (const key of tableKeys) host.keybinding(key);
    },
  };
}
