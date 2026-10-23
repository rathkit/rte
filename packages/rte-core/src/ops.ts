// The toolkit handed to plugins: the editing operations, as plain functions. A plugin uses these through the host
// instead of importing the editor, so it carries no run-time dependency on it.
import { setAlign, setBlockType } from "./blocks.ts";
import { toggleDefinitionList } from "./definitions.ts";
import {
  deleteBackward, deleteForward, deleteSelection, extractSelection, insertBlocks, insertLineBreak, insertText, moveSelection, rangeHasMark,
  selectedText, sliceInline, splitBlock, toggleMark,
} from "./edit.ts";
import { exportBlock, exportHtml, exportInline } from "./export.ts";
import { importBlocks, importHtml, importText } from "./import.ts";
import { setLink } from "./links.ts";
import { indentItems, outdentItems, toggleList } from "./lists.ts";
import { caret, containerPaths, getBlock, getContent, kindAt, selectedContainers, setContent } from "./path.ts";

export const ops = {
  caret, containerPaths, selectedContainers, getContent, setContent, getBlock, kindAt, sliceInline,
  insertText, insertBlocks, insertLineBreak, splitBlock, deleteSelection, deleteBackward, deleteForward, moveSelection,
  extractSelection, selectedText, toggleMark, rangeHasMark, setBlockType, setAlign, setLink,
  toggleList, toggleDefinitionList, indentItems, outdentItems,
  importHtml, importBlocks, importText, exportHtml, exportBlock, exportInline,
} as const;

export type Ops = typeof ops;
