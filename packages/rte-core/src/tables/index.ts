// @rathkit/rte-core/tables: tables as a plugin.
import { tables as engineOnly, type TablesOptions } from "./plugin.ts";
import type { Plugin } from "../plugin.ts";
import { tablesView } from "./view.ts";

export type { TablesOptions };
/** The tables plugin, with the part that draws table handles in a browser. (`./plugin.ts` is the same without it.) */
export const tables = (options?: TablesOptions): Plugin => ({ ...engineOnly(options), view: tablesView });
export { BORDER_PRESETS, borderPreset, cellBackground, cellBorderPreset, rowHeight, setCellBackground, setCellBorder, setRowHeight, columnWidth, setColumnWidth, canMerge, canSplit, deleteColumn, deleteRow, deleteTable, hasHeaderRow, inTable, insertColumn, insertRow, insertTable, makeTable, mergeCells, moveToCell, splitCell, toggleHeaderRow, type InsertTableOptions } from "./tables.ts";
