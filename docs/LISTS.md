# Lists

Lists are the `lists` entry point (`@rathkit/rte-core/lists`), a plugin; the standard editor has it. The commands are `list.bulleted`, `list.numbered`, `list.definition`, `list.indent` and `list.outdent`, and the options are `lists({ maxDepth, indentOnTab, shortcuts })`.

What the list commands do, in the terms of the requirements.

- **Toggle** (`list.bulleted` and `list.numbered`, which take `{ style?, start? }`): the block where the selection starts decides. Already in a list
  of that type: every selected item leaves its list (the list splits around it, and items that were deeper keep their depth under
  an empty placeholder item, written `<li style="list-style-type: none;">`). Otherwise every selected paragraph or heading
  becomes an item, and joins a same-type list next to it; a list of the other type that the selection touches changes type. The
  same type with a different `style` restyles the list instead of toggling it off. Headings keep their text and marks.
- **Tab / Shift+Tab** (`list.indent` and `list.outdent`, bound to the keys by default; `indentOnTab: false` leaves Tab to the browser): Tab nests the selected items under the item
  before them, or under a new placeholder when there is none. A selection of neighbours moves together. An item keeps its
  children, which move one level deeper with it. `maxDepth` stops Tab. Shift+Tab moves an item out one level with its children, and items after it in its list
  stay under it as its children. From the outermost list the item becomes a paragraph and its children come out with it as top-level
  lists, each keeping its own type, so pressing Shift+Tab again and again brings every line to the left edge. With a selection, every
  selected line moves out together and the top one stops at the edge while the rest keep going.
- **Enter** adds an item. Enter on an empty item leaves: an outermost item becomes a paragraph (the list splits if it was in the
  middle), a nested one moves out a level. **Backspace** at the start of the first item of a list does the same; at the start of
  a later item it joins the item before.
- **Shortcuts** (`shortcuts`, on by default): typing a space after a lone `*` or `-` at the start of a paragraph starts a bulleted
  list; after a lone `1.` a numbered one. `2.` and `1)` do nothing. The conversion is its own undo step.
- **Definition lists** (`list.definition`): every selected block becomes a term; no details are made. Starting the selection in a
  definition list takes the selected entries out as paragraphs. Items in ordinary lists leave their lists first. Enter at the end of a
  term starts a detail, at the end of a detail starts a term, and in the middle keeps the kind. Enter on an empty entry leaves the list.
  Tab turns a term into a detail and Shift+Tab turns it back. Backspace at the start of the first entry makes a paragraph; any other
  entry joins the one before. Tab, Shift+Tab and the Enter alternation are our choices: the requirements leave them open. An entry
  that holds a list or table when imported is read as plain blocks so nothing is lost.
- Not built: list numbering styles beyond what the import reads, and multi-block items.
