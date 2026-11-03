# Footnotes

`@rathkit/rte-core/footnotes` adds footnotes: a numbered reference in the text, and its note in a list at the end of the document.
It is part of the standard editor (`createEditor()` has it; `footnotes: false` leaves it out) and has no dependencies. To add
it to an editor you build from the parts:

```ts
import { footnotes } from "@rathkit/rte-core/footnotes";

const editor = new Editor({ element, plugins: [footnotes()] });
editor.commands.run("footnote.insert"); // a reference at the caret, and the caret in its new note
```

Without the plugin a document that has footnotes still loads, shows and exports; it is the plugin that keeps references and
notes together while people edit.

## For the person typing

- **Insert:** Ctrl+Alt+F (Cmd+Option+F on a Mac), or the toolbar button. A numbered reference goes at the caret and the caret
  moves into the new note at the end of the document, ready to write. Selected text is replaced by the reference.
- **Jump:** Ctrl+Alt+Shift+F (Cmd+Option+Shift+F) goes from a note to just after its reference, and from the caret beside a
  reference to its note.
- **Numbers** follow the order of the references. Put a new one before the others and it becomes 1; the rest move down, and so do their notes in the list.
- **Delete a reference** (Backspace or Delete next to it, or select and delete) and its note goes with it. One undo brings both back.
- **Enter in a note** starts another paragraph of the same note. A note can hold more than text: lists, code and quotes
  (it is a list item, see [LISTS.md](LISTS.md)).
- **Cut and paste a reference** moves the note with it, as long as it is pasted in the same editor. **Copy** takes the notes
  with the text, so pasting it elsewhere (or again here) makes notes of their own.

## How it is stored

```ts
{ type: "note", id: "n1" }                              // inline: one character in the text
{ type: "ol", notes: true, items: [{ id: "n1", content, children }] }   // the list of notes, one per reference
```

An `id` is 1 to 40 letters, digits, `_` or `-`; anything else is refused when read. **Numbers are never stored**: a reference's
number is its place among the references in reading order, and the list is kept in that order, so the marker of a note and the
number of its reference always agree.

After every edit that changes the document, the plugin repairs what the edit could not know about, in the same undo step:

- a note whose reference is gone is removed (kept for a short while, so a cut and paste brings its text back);
- a reference with no note gets an empty one;
- the notes are put in the order of their references, and there is one notes list, at the end unless it already sits elsewhere;
- an item with no id of its own (Enter in a note made one) is joined to the note before it as another paragraph;
- a reference pasted while the original is still there becomes a reference to a copy of its note.

## HTML

A document is written as

```html
<p>Text<sup data-note="n1"><a href="#fn-n1" id="fnref-n1" role="doc-noteref">1</a></sup></p>
<section class="footnotes" role="doc-endnotes"><ol>
  <li id="fn-n1" data-note="n1">The note. <a href="#fnref-n1" role="doc-backlink">↩︎</a></li>
</ol></section>
```

so the numbers show and the links work in a page that has no editor. Reading accepts the same, and the shapes other tools write: a
link with `role="doc-noteref"`, `data-footnote-ref` or the class `footnote-ref` pointing at `#fn…` or `#user-content-fn…`, and a
list inside an element with `role="doc-endnotes"`, `data-footnotes` or the class `footnotes`, with the way back (`doc-backlink`,
`data-footnote-backref`, `footnote-back`) taken out. A link that merely points at a fragment stays a link.

## Markdown

With `@rathkit/rte-core/markdown` ([MARKDOWN.md](MARKDOWN.md)), `[^label]` is a reference and `[^label]: text` is its note. A note
continues on lines indented four spaces (blank lines allowed between), and may hold paragraphs, code, quotes and lists. A reference
to a label with no definition stays text, and a definition nothing refers to is dropped. A label used twice makes two references
with a copy of the note each. Writing uses the number as the label.

## Limits

- Notes are read and written as one list at the end of the document. Notes inside a quote, a list item or a table cell are not a thing; a footnote reference there works, its note is still in the end list.
- A note cannot hold a table or another footnote.
- Footnotes do not turn into page-bottom notes in print; they are an end list.
- The editor tells assistive technology what a reference is (`doc-noteref`, "Footnote 1") and what the list is (`doc-endnotes`, "Notes"). How a reader announces them has not been tried on real screen readers; see [HAND-TESTING.md](HAND-TESTING.md).
