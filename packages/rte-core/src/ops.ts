// The toolkit handed to plugins: the editing operations, as plain functions. A plugin uses these through the host
// instead of importing the editor, so it carries no run-time dependency on it.
import { setAlign, setBlockType } from "./blocks.ts";
import {
  deleteBackward, deleteForward, deleteSelection, extractSelection, insertBlocks, insertLineBreak, insertText, moveSelection, rangeHasMark,
  selectedText, sliceInline, splitBlock, toggleMark,
} from "./edit.ts";
import { exportBlock, exportHtml, exportInline } from "./export.ts";
import { importBlocks, importHtml, importText } from "./import.ts";
import { setLink } from "./links.ts";
import { decodeBase64, encodeBase64 } from "./base64.ts";
import { escapeAttribute, escapeText } from "./html/entities.ts";
import { checkImageSrc, parseStyle } from "./import.ts";
import { extent, fromGrid, inRow, locateCell, meets, selectedCells, selectedRect, toGrid } from "./tablegrid.ts";
import { COLOR_VALUE, COLUMN_WIDTH, ROW_HEIGHT, inlineLength, inlineText, normalizeInline } from "./model.ts";
import {
  caret, clampPos, containerPaths, fixup, getBlock, getContent, isCollapsed, kindAt, mapBlockList, pathKey, selectedContainers, setContent,
} from "./path.ts";

export const ops = {
  // Reading and changing the document by position.
  caret, clampPos, containerPaths, selectedContainers, getContent, setContent, getBlock, kindAt, mapBlockList, fixup, pathKey, isCollapsed,
  inlineLength, inlineText, normalizeInline, sliceInline, COLUMN_WIDTH, COLOR_VALUE, ROW_HEIGHT,
  // The grid behind a table.
  toGrid, fromGrid, inRow, extent, meets, selectedRect, selectedCells, locateCell,
  // Importing, with the same address checks the editor uses.
  parseStyle, checkImageSrc, escapeText, escapeAttribute, encodeBase64, decodeBase64,
  // Editing.
  insertText, insertBlocks, insertLineBreak, splitBlock, deleteSelection, deleteBackward, deleteForward, moveSelection,
  extractSelection, selectedText, toggleMark, rangeHasMark, setBlockType, setAlign, setLink,
  importHtml, importBlocks, importText, exportHtml, exportBlock, exportInline,
} as const;

export type Ops = typeof ops;
