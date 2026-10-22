# Lists

What the list commands do, in the terms of the requirements.

- **Toggle** (`Editor.toggleList("ul" | "ol", { style?, start? })`): the block where the selection starts decides. Already in a list
  of that type: every selected item leaves its list (the list splits around it, and items that were deeper keep their depth under
  an empty placeholder item, written `<li style="list-style-type: none;">`). Otherwise every selected paragraph or heading
  becomes an item, and joins a same-type list next to it; a list of the other type that the selection touches changes type. The
  same type with a different `style` restyles the list instead of toggling it off. Headings keep their text and marks.
- **Tab / Shift+Tab** (`indent()`, `outdent()`, on by default through `indentOnTab`): Tab nests the selected items under the item
  before them, or under a new placeholder when there is none. A selection of neighbours moves together. Children of a moved item
  come out at its new depth. `maxListDepth` stops Tab. Shift+Tab moves an item out one level, and items after it in its list
  stay under it; from the outermost list the item becomes a paragraph.
- **Enter** adds an item. Enter on an empty item leaves: an outermost item becomes a paragraph (the list splits if it was in the
  middle), a nested one moves out a level. **Backspace** at the start of the first item of a list does the same; at the start of
  a later item it joins the item before.
- **Shortcuts** (`listShortcuts`, on by default): typing a space after a lone `*` or `-` at the start of a paragraph starts a bulleted
  list; after a lone `1.` a numbered one. `2.` and `1)` do nothing. The conversion is its own undo step.
- Not built: definition lists, list numbering styles beyond what the import reads, and multi-block items.
