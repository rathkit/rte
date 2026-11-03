# Tables

Tables are in the core model (a document with tables loads, draws, saves and survives deleting around them with no plugin) and the
editing commands are the free `@rathkit/rte-core/tables` plugin, part of the standard editor.

## Model

A table is rows of cells. A cell has `header`, `colspan`, `rowspan` and its own blocks (paragraphs, lists, even another table). The
table may carry `widths`: one entry per column of the grid, a CSS length in `px` or `%`, or `null` for automatic. It is absent when every
column is automatic. HTML in: `<colgroup><col>` widths, else the widths the first row's single-column cells ask for (`width` attribute or
style). Only plain numbers with `px` or `%` are widths; `9em`, `calc(...)` and the like are ignored. HTML out: a `<colgroup>`.

A cell may have a `background` (a plain color) and lines: `border`, one line all round (solid, dashed or dotted, 1 to 8 px, a color), or `null` for none whatever a stylesheet says; or, where the sides differ, `borders` with a line (or `null`) for each side that has been said. A side that has not been said is left to the stylesheet (the styled interface draws a grid). The same four sides are always kept as one `border`. The table may carry
`heights`, the least height of each row in `px`, like `widths` for columns. HTML in: a cell's `background-color`, `background` (when it is a plain color) or
`bgcolor`, its `border` shorthand, and a row's (or its first cell's) `height`; `border-top`, `border-right`, `border-bottom` and `border-left` for lines that differ by side; anything else (images, gradients, double lines) is
dropped. Cell styles are read when a document is loaded, not from a paste, like text colors. HTML out: `style` on the cell and the row.

## Commands

| Command | Does |
| --- | --- |
| `table.insert` | Puts a table where the caret is: `{ rows, cols, header }` (default 2 by 2, no header). In place of an empty paragraph, else after the block; a paragraph is kept after a table that ends the document |
| `table.rowBefore`, `table.rowAfter` | Adds a row above or below the caret's cell. A cell that reaches across the new row grows instead of getting a blank neighbor |
| `table.columnBefore`, `table.columnAfter` | The same for columns; widths follow their columns |
| `table.deleteRow`, `table.deleteColumn` | Removes one. Cells that span it shrink or move; the last row or column takes the table away |
| `table.delete` | Removes the table |
| `table.header` | Turns the first row into header cells, or back |
| `table.mergeCells` | Joins the rectangle of cells the selection runs across (taken out to whole cells) into one that spans them; their content stays, in reading order, and empty paragraphs are dropped |
| `table.splitCell` | Cuts a spanning cell back to single cells: content stays in the top left one |
| `table.columnWidth` | `{ width }` for the caret's column: `120`, `120px`, `25%`, or empty for automatic. Anything else changes nothing |
| `table.cellBackground` | a color, or `""` | The color behind the selected cells (the rectangle a selection runs across, or the caret's cell). Value: the first cell's color |
| `table.cellBorder` | `default`, `none`, `thin`, `thick`, `dashed`, `dotted`, or `{ style, width, color }`; with `sides: ["top", ...]` (and `line: <preset>` in place of the style) only those edges of the selection | The lines of the selected cells. `default` says nothing; `none` says there are none. The presets use the text color, so they read on any theme. Value: the preset name of the first cell, `""` for sides that differ or a custom line |
| `table.borderTop`, `table.borderRight`, `table.borderBottom`, `table.borderLeft` | | A thin line along that edge of the selection (the cells on that edge, that side only), on or off; off is `none`. `active` says whether the edge has a line |
| `table.border` | the same choices as `table.cellBorder` | Lines for the whole table from any cell in it: every cell, or with `sides` only the table's outline. The styled interface has a Table lines menu. |
| `table.sort` | `"asc"` or `"desc"` | Puts the rows in order by the column of the caret's cell: numbers (`1,200`, `$5`, `12%`) by value and before text, text by the user's language with digits in order, empty cells last either way. A header row stays first, the sort is stable, a row's height moves with it, and the caret stays in its cell. Rows tied together by a cell that spans rows move as one group, ordered by the group's first row; off when there is only one group to order |
| `table.moveRow`, `table.moveColumn` | `{ by }` (-1 or 1), or `{ to, after }` | Moves the caret's row or column a step, or next to the row or column `to` (after it with `after`). Rows or columns tied by a spanning cell move together, a header row stays first, and heights and widths move with them. `cell` names another cell's row or column (used by the grips) |
| `table.rowHeight` | `{ height }` | The least height of the rows the selection covers: `40`, `40px`, or empty for automatic |
| `table.nextCell`, `table.previousCell` | Tab and Shift+Tab. Tab past the last cell adds a row; Shift+Tab in the first cell is left to the browser. Lists inside a cell get Tab first |

The styled interface offers them in a Table menu, and the look of cells (fill, line, row height) in a Cell style menu.

## Editing next to tables

These rules are in the core, so they hold without the plugin:

- Backspace at the start of a cell and Delete at the end of one do nothing; cells are never joined.
- Backspace just after a table and Delete just before one move the caret into the table's last or first cell.
- A selection from one cell to another in the same table trims the two ends and empties the cells in between.
- A selection that runs across the edge of a table deletes only the part outside it. A table wholly inside the selection is removed as a table.
- Enter inside a cell makes another paragraph in that cell.

## Drawing

Typing in a cell draws that cell. The table, the other rows and the other cells keep their elements, so the browser has nothing to lay
out again (typing in a 500-cell table: about 5 ms, against 15 before).

## Selecting cells and resizing columns

When a selection starts in one cell and ends in another cell of the same table, the tables plugin's view part puts `data-rk-cell-selected` on every cell of the
rectangle between them (taken out to whole cells, as Merge does), so a theme can show what Merge would act on. The styled interface tints
those cells and outlines them. The marks are attributes on the drawn cells, not part of the document.

A pointer on a cell's right edge shows a resize cursor. Dragging draws a guide line and, on release, runs `table.columnWidth` for the column
that edge belongs to (the last column a spanning cell covers), so the width is one undo step. Double-clicking an edge puts the column back to
automatic. The bottom edge of a row works the same way through `table.rowHeight` (with `cell`, the row of that cell). Where the tables plugin is not installed, or the editor is read-only, edges do nothing. Touch input has not been tried.

Dragging the mouse from one cell to another selects the rectangle between them in all three engines (Firefox reports such a drag as one range per cell; the view reads it from the first to the last).

## Pasting a table into a table

A table pasted with the caret (or a selection) in a table cell fills the cells, cell by cell, from the selected cell, as pasting copied spreadsheet cells into a spreadsheet does; the table grows by blank rows and columns for what does not fit. Each filled cell keeps its own kind (header or not) and size and takes the pasted cell's content, and its fill and line if the pasted cell has them. One pasted cell fills every selected cell. This is in the core, so it holds without the plugin. Plain text with tabs between cells and a line to a row (as a spreadsheet or terminal copies it) pasted into a table is read as cells the same way.

## Handles

While the caret is in a table (at the top level of the document) and the editor has the focus, two handles sit outside it: a square left of the
caret's row and one above its column. Dragging the row handle up or down, or the column handle left or right, shows a guide and, on release,
runs `table.moveRow` or `table.moveColumn` (one undo step). The Table menu has Move row up and down and Move column left and right for the
keyboard. When the last pointer used was a finger, two more handles sit on the caret's cell, at its right and bottom edge, to set the column's
width and the row's height (`table.columnWidth`, `table.rowHeight`), because the thin edges are not something a finger can hold. They are
elements outside the document. Touch dragging is checked with touch events in Chromium; Firefox has no touch emulation to check it with.

## Large tables

A change to a cell redraws that cell only, and everything that reads the table's grid reads it once per table, so the editor's own cost of a keystroke does not grow with the table. The browser's layout of the table does. In Chromium typing in a cell takes about 9 ms at 5,000 cells and 24 ms at 20,000 (`MEASUREMENTS.md` has the figures and the method).

## Not built

- Sorting or moving by dragging several rows or columns at once, and moving a cell on its own.
