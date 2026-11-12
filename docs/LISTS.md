# Lists

Lists are the `lists` entry point (`@rathkit/rte-core/lists`), a plugin; the standard editor has it. The commands are `list.bulleted`, `list.numbered`, `list.definition`, `list.indent` and `list.outdent`, and the options are `lists({ maxDepth, indentOnTab, shortcuts })`.

What the list commands do, in the terms of the requirements.

- **Toggle** (`list.bulleted` and `list.numbered`, which take `{ style?, start? }`): the block where the selection starts decides. Already in a list
  of that type: every selected item leaves its list (the list splits around it, and items that were deeper keep their depth under
  an empty placeholder item, written `<li style="list-style-type: none;">`). Otherwise every selected paragraph or heading
  becomes an item, and joins a same-type list next to it; a list of the other type that the selection touches changes type. The
  same type with a different `style` restyles the list instead of toggling it off. Headings keep their text and marks.
- **Tab / Shift+Tab** (`list.indent` and `list.outdent`, bound to the keys by default; `indentOnTab: false` leaves Tab to the browser; Escape, then Tab, leaves the editor without indenting, see [ACCESSIBILITY.md](ACCESSIBILITY.md)): Tab nests the selected items under the item
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
- **Marker style and start** (`list.style`, `list.start`; the List style menu in the styled interface): `list.style` takes a style name for the
  list the caret is in, and only that list: numbered lists `decimal`, `decimal-leading-zero`, `lower-alpha`, `upper-alpha`, `lower-roman`,
  `upper-roman`, `lower-greek`; bulleted ones `disc`, `circle`, `square`; empty is the default for the depth. `list.start` takes a whole number
  from 0 to 99999 for a numbered list (empty is 1). Anything else changes nothing. The import still reads any `list-style-type` keyword and the old
  `type` attribute (`a`, `A`, `i`, `I`, `1`).
- **Paragraphs in an item** (`list.paragraph`, Mod-Shift-Enter, or New paragraph in item in the List style menu): starts a new paragraph inside the
  item the caret is in instead of a new item. The item is written as `<li><p>…</p><p>…</p></li>` (a task's checkbox in the first paragraph) and read
  from that; a gap is drawn between the paragraphs. Backspace at the start of a paragraph joins it to the one before, and Enter still adds an item,
  taking the later paragraphs with it. 
- **What else an item holds.** After its text an item can hold, in order, **nested lists, paragraphs, headings, code blocks, quotes and rules** (its `children`).
  They are read from `<li>` markup and from Markdown, written back in the same order, drawn inside the item, and edited like the same blocks
  anywhere else (Enter in code adds a line, Enter in a paragraph adds a paragraph there, copy keeps them, find searches them). A paragraph
  directly after the item's text is a paragraph break inside the text, as above; a paragraph is a child only after another child (text, code, more text).
  Backspace in an empty child that cannot merge with what is before it (after a code block, say) removes it. Tables and definition lists do not go
  in an item: when read from markup or made by an edit their text stays as paragraphs. An item with no text of its own that starts with a nested list shows its marker like any other (Enter at the end of an item that has a
  nested list makes one, and so does deleting all of an item's text). It is a bare placeholder, with no marker, only when it is marked `bare` in the model
  (written `<li style="list-style-type: none;">`): indenting the first item makes one, and Backspace at the start of an empty item with a nested list
  turns it into one. Shift+Tab on such an item moves it out a level, and at the left margin it stays. An item that starts with code keeps its bullet. Outdenting an item with a code child brings the code out with it. In the model the
  field is `ListItem.children`, and a path to a child is `[block, item, child]` (or `[block, item, child, n, …]` inside a quote child), the same numbers a nested list already used.

## Tasks

A list item can be a task: it has a checkbox and is done or not (`checked` on the item in the model). `list.checklist` makes the selected paragraphs a list of tasks, or the selected items tasks, or (when the first is already one) ordinary items again; `list.toggleChecked` ticks the selected tasks, or clears them when all are ticked (key: Mod-Enter), or flips just one item (`{ path }`, which is how a click on a checkbox reaches it). Typing `[] `, `[ ] ` or `[x] ` at the start of a paragraph starts a task list. Enter in a task makes a task that is not done; Backspace at the start of a task first takes its checkbox away.

HTML out: the item starts with `<input type="checkbox" disabled>` (with `checked` when done) followed by a space, and has `list-style-type: none`. This is plain HTML that shows correctly with no script. HTML in: the same, and also a checkbox inside the item's first label, paragraph or span (as GitHub writes them), `aria-checked` or `data-checked` on the item, and a class of `checked` or `task-done` (done) or `unchecked`. The checkbox is the item's state, not its text.

In the editor the checkbox is a small element in front of the item's text that the page-to-model mapping skips; it has `role="checkbox"` and `aria-checked`, and is named "Done". A caret on it counts as the start of the text. It is not reachable with Tab (use the key); a click ticks it. The name is English; a host that needs another language can change it after drawing.
