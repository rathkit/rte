// The default icon set by name, for the styled interface. Importing this pulls in every icon; import single icons from the package to keep only some.
import * as icons from "./icons.ts";

export const defaultIcons: Readonly<Record<string, string>> = {
  "undo": icons.undo,
  "redo": icons.redo,
  "bold": icons.bold,
  "italic": icons.italic,
  "underline": icons.underline,
  "strikethrough": icons.strikethrough,
  "code": icons.code,
  "superscript": icons.superscript,
  "subscript": icons.subscript,
  "align-left": icons.alignLeft,
  "align-center": icons.alignCenter,
  "align-right": icons.alignRight,
  "align-justify": icons.alignJustify,
  "link": icons.link,
  "unlink": icons.unlink,
  "list-bulleted": icons.listBulleted,
  "list-numbered": icons.listNumbered,
  "list-definition": icons.listDefinition,
  "indent": icons.indent,
  "outdent": icons.outdent,
  "chevron-down": icons.chevronDown,
  "check": icons.check,
  "close": icons.close,
};
