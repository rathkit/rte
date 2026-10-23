# Commands

Everything the editor does to a document is a named command: `editor.commands.run("format.bold")`, `editor.commands.state("format.bold")`
(`{ enabled, active, value }`) and `editor.commands.subscribe(name, callback)`. Toolbars, menus, keys and the browser's own formatting
requests all go through them. A command that does not apply returns `false` and changes nothing; in a read-only editor every command that
changes the document is disabled.

## Core

| Command | Argument | Does |
| --- | --- | --- |
| `history.undo`, `history.redo` | | Moves through the history. Typing and deleting in a row are one step |
| `format.bold`, `format.italic`, `format.underline`, `format.strike`, `format.code`, `format.superscript`, `format.subscript` | | Toggles the mark on the selection. With a caret it is chosen for the text typed next, and the choice is forgotten when the caret moves |
| `format.color`, `format.background` | a color, or `""` | Text color and highlight: hex, a plain name, or `rgb()`/`hsl()`; anything else is refused. `value` is the current color |
| `format.clear` | | Takes off every mark but a link (for a caret: for the text typed next). Key: `Mod-\` |
| `block.heading` | 0 to 6 | Sets the block to that heading level (0 is a paragraph); the same level again does nothing |
| `block.paragraph` | | Back to a paragraph |
| `block.code` | | Code block on or off for the selected paragraphs and headings. Marks and alignment do not exist in code and are dropped |
| `block.quote` | | Wraps the selected blocks (paragraphs, headings, code blocks, lists) in a quote, or takes them out of it |
| `block.rule` | | A horizontal rule after the block (in place of an empty paragraph), with the caret in a paragraph after it |
| `block.align` | `left`, `center`, `right`, `justify` | Aligns the selected paragraphs and headings |
| `link.set`, `link.remove` | `{ href }` | Sets or removes the link on the selection or the link under the caret |

## Plugins

| Plugin | Commands |
| --- | --- |
| `lists` | `list.bulleted`, `list.numbered`, `list.definition`, `list.indent`, `list.outdent` (see `LISTS.md`) |
| `tables` | `table.insert`, `table.rowBefore`, `table.rowAfter`, `table.columnBefore`, `table.columnAfter`, `table.deleteRow`, `table.deleteColumn`, `table.delete`, `table.header`, `table.mergeCells`, `table.splitCell`, `table.columnWidth`, `table.nextCell`, `table.previousCell` (see `TABLES.md`) |
| `images` | `image.insert` with `{ src, alt }`: the address goes through the same check as pasted images (see `IMAGES.md`) |

## What the browser can ask for

Formatting that arrives as a `beforeinput` event by name (from a context menu, a spell checker, an accessibility tool) runs the matching
command: superscript, subscript, the four justify types, horizontal rule, remove format, font color, background color, indent, outdent and
insert link. Any other input type that the editor does not handle is blocked, not applied, and reported through `onUnhandledInput`.
