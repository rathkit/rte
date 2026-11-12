# Selection and caret

The rules, with what checks each. Unit tests are in `packages/rte-core/src/selection.test.ts` (names start "rule:"); the browser checks
(Chromium, Firefox and WebKit, the same result in each) are in `tools/browser-checks/run.mjs`, named "selection: …".

The editor keeps its own selection, two positions in the document (`{ anchor, focus }`), and the page keeps another. They are read from
the page after a click or a key, and written back after an edit. The rules below say what the model's selection is when the page's is
somewhere odd, or when browsers disagree.

## Positions

1. **A caret is always in text.** There is no caret position on a rule, between two blocks, or before or after a table. If a browser puts
   the page's caret there (Up from the block after a leading rule does in Chrome and Safari), the editor moves it to the start of the
   next block that has text, or the end of the last one, and moves the page's caret to match. Check: "Up from the block after a leading
   rule".
2. **An atom takes one position.** An inline image and a footnote reference each count as one character: Right passes it, Left comes back,
   Shift+Right selects exactly it, Delete before it and Backspace after it remove exactly it (and a reference's note goes with it). Checks:
   the "inline image" and "footnote reference" lines.
3. **Select all** runs from the start of the first block to the end of the last, whatever the blocks are.

## Moving

4. **Shift and an arrow extends by one character, and back.** The anchor stays where it was.
5. **Shift+Down goes to the same column of the next line** (the next block, when at the last line); at the last line of the document it
   goes to the end.
6. **Right-to-left text follows the screen**: Right moves to the earlier letter. Mixed text moves by what is shown.
7. **At the edge of a block the caret goes to the neighboring one**: the end of a list item to the start of the next, out of a quote or
   a code block to the block after, and from the end of a table cell to the start of the next cell. Down from the line above a table
   lands in the cell under the column.
8. **A table with nothing after it keeps the caret in its last cell** when Down is pressed there, on the page as well as in the model.
9. **A rule is passed over**: Down goes from the block before to the block after.

## Rules and deleting

10. **A rule between two blocks is deleted first.** Backspace at the start of the block after it, or Delete at the end of the block
    before it, removes the rule and leaves the text where it was (it never lets the text jump across and leave the rule behind). A rule
    at the very start or end is removed the same way. With two in a row, each press removes the nearest. A selection that covers a rule removes it too: cutting, typing over the selection, or deleting it (including select all) leaves no rule behind.

## Clicking

11. **Double click selects the word**, in any direction of text.
12. **Triple click selects the block and only the block.** Chrome and Safari run the end of a triple-click selection on to the start of
    the next block (so typing would have taken the next block's first line with it); the editor ends it at the end of the clicked block.
    Same for a list item and a table cell.

Not rules: where exactly the browser puts the caret after Up or Down in the middle of a wrapped line, and what the page's own selection
object reports (a text node and offset, or an element and a child index): the model is what the editor acts on.
