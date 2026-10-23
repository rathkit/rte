# Tables

Tables are in the core model (a document with tables loads, draws, saves and survives deleting around them with no plugin) and the
editing commands are the free `@rathkit/rte-core/tables` plugin, part of the standard editor.

## Model

A table is rows of cells. A cell has `header`, `colspan`, `rowspan` and its own blocks (paragraphs, lists, even another table). The
table may carry `widths`: one entry per column of the grid, a CSS length in `px` or `%`, or `null` for automatic. It is absent when every
column is automatic. HTML in: `<colgroup><col>` widths, else the widths the first row's single-column cells ask for (`width` attribute or
style). Only plain numbers with `px` or `%` are widths; `9em`, `calc(...)` and the like are ignored. HTML out: a `<colgroup>`.

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
| `table.nextCell`, `table.previousCell` | Tab and Shift+Tab. Tab past the last cell adds a row; Shift+Tab in the first cell is left to the browser. Lists inside a cell get Tab first |

The styled interface offers them in a Table menu.

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

## Not built

- A rectangular highlight for a selection across cells. The browser highlights the text in reading order; Merge uses the rectangle between the two cells the selection starts and ends in.
- Dragging a column edge to resize. Widths are set with the command or the Column width dialog.
- Row heights, cell borders and background colors, and pasting a table into a cell range.
