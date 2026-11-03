# Markdown

`@rathkit/rte-core/markdown` reads and writes Markdown (CommonMark with the GitHub additions: tables, task items,
strikethrough, web addresses written in plain text). It is an opt-in entry: nothing in `standard` turns it on.
It has no dependencies; the reader is written from the two public specifications.

```ts
import { markdown, parseMarkdown, exportMarkdown, looksLikeMarkdown } from "@rathkit/rte-core/markdown";

const editor = createEditor({ element, plugins: [markdown()] }); // Markdown in plain-text paste
const blocks = parseMarkdown("# Title\n\n- a\n- b");            // blocks, ready to insert
const text = exportMarkdown(editor.document);                    // the document as Markdown
```

## Paste

`markdown({ paste })` adds a paste handler:

| `paste` | What it does |
| --- | --- |
| `"detect"` (default) | Plain text that clearly looks like Markdown is read as Markdown. Anything else pastes as typed. |
| `"always"` | Every plain-text paste is read as Markdown. |
| `"never"` | Markdown is not read on paste (copy is separate, see below). |

Rules that hold in every mode:

- **HTML wins.** When the clipboard also holds HTML (a word processor, a web page, a code editor), the standard
  handling reads that and this plugin stays out. Code editors put syntax-colored HTML on the clipboard, so Markdown
  copied from one pastes as colored text, not as Markdown. That is on purpose: guessing past real HTML would be wrong more often than right.
- **Code stays literal.** A paste with the caret in a code block is never read as Markdown.
- **Links and images are checked** like pasted HTML: link schemes are limited (`linkSchemes` narrows them), images go through the
  image checks and the image policy. `javascript:` and similar addresses become plain text.
- **Raw HTML is text.** `<script>` and tags in Markdown are shown as typed; they are never interpreted.
- One undo step takes the paste back.

### How `detect` decides

Signs add up, and two points are needed. A code fence (3) or a table (3) is enough alone. Two list lines, a task item,
a link `[text](address)`, bold `**x**` or strike `~~x~~` give 2. One heading gives 1 (two give 2), a quote line 1, a `` `code` `` span 1.
So a lone `- ` line, `snake_case_names`, `2*3*4`, an address, a path, or a shell comment such as `# install` stay plain.
`looksLikeMarkdown(text)` is exported if you want to use the same rule.

## What is read

Headings (`#` and underlined), paragraphs, hard breaks (two spaces or a backslash), quotes, fenced and indented code,
rules, bullet and numbered lists (nested, with a starting number), task items, tables (with column alignment), bold,
italic, strikethrough, code spans, links (inline, and by reference: `[text][label]`, `[text][]`, `[label]` with
`[label]: address "title"` written anywhere, even after use), images (inline and by reference) and automatic links.
Soft line breaks become a space. A line that continues a paragraph inside a quote or list item without its marker (lazy
continuation) is followed as the spec says: only when the container ends in paragraph text, never after a heading, rule or an open code fence.

### What the model cannot hold

- **List items** hold text, then (in order) nested lists, paragraphs, headings, code, quotes and rules, as in HTML. Tables do not go in an item: their text stays as paragraphs.
- **Table cells and alignment.** The column alignment of a table is set on the paragraph in each cell.
- **HTML is text, with one small exception.** These inline tags **without attributes** are read as formatting: `<u>` `<ins>` (underline), `<sup>`, `<sub>`, `<b>` `<strong>`, `<i>` `<em>`, `<s>` `<del>` `<strike>`, `<kbd>` `<code>`, and `<br>`. A tag counts only when its closing partner is there; one left over, one with an attribute, a closing `</br>`, and every other tag (`<script>`, `<img>`, `<span style>`, `<a>`) stay text, so pasted markup can never run, load or style anything. HTML blocks are text too.
- **Footnotes** are read: `[^label]` and `[^label]: text` (see [FOOTNOTES.md](FOOTNOTES.md)). The note text may continue on lines indented four spaces, and holds paragraphs, code, quotes and lists.
- **Not read, by design:** nesting deeper than 24 levels (read as plain text, a bound that keeps hostile input cheap).
- Reference definitions are not shown, and neither are footnote definitions (they become the notes list at the end). A definition counts only where a paragraph could start, and not inside code.

## What is written

`exportMarkdown(doc)` is deterministic: the same document always gives the same text, and reading that text gives back
the same document apart from the details below. Markdown has no way to say these, so they are **dropped** (never written as inline HTML, which would not come back):

- text color and background marks, and (unless `inlineHtml` is on, below) underline, superscript and subscript;
- alignment, indent and direction of a block (a table column's alignment is kept);
- cell spans (`colspan`, `rowspan`: a spanning cell leaves empty cells), cell colors and borders, column widths, row heights, cells with more than one block, a table without a header row (the first row becomes the header);
- image size, alignment and caption; the new-tab setting of a link;
- definition lists (each term and detail becomes a paragraph);
- footnotes are written: `[^1]` for each reference (numbered in reading order) and `[^1]: text` for each note after the other blocks;
- a line break inside a table cell or a heading becomes a space (a `<br>` with `inlineHtml`).

`exportMarkdown(doc, { inlineHtml: true })` (and `markdown({ inlineHtml: true })` for copy) writes underline, superscript, subscript and those line breaks as `<u>`, `<sup>`, `<sub>` and `<br>`. The reader here understands them, so they come back; other Markdown readers show the tags as HTML. Off by default, so the text stays plain Markdown.

Characters that would otherwise be read as formatting are escaped (`\*`, `\_` between non-letters, `\[`, and a leading `#`, `>`, `-`, `1.`),
code fences and spans are made longer than any backtick run inside, and two lists side by side alternate their marker (`-` and `*`) so they stay two lists.

## Copy

The plugin uses the plugin API's `copyFormat` hook, so copy, cut and drag also write the selection as `text/markdown`
(`copy: "markdown"`, the default). `copy: "plain"` also makes the plain text Markdown, which suits pasting into a text field or a terminal;
`copy: "off"` adds nothing. The editor's own HTML is always written as well, so pasting back into an editor keeps full formatting.

The command `markdown.copy` ("Copy as Markdown") writes the selection (the whole document when nothing is selected) as text with the
browser's clipboard API. It is not on any toolbar or menu; bind it to a key or an item of your own. It returns false when the clipboard API is not there.

## Tests

Unit tests cover each construct, escaping, a round trip over a corpus (`parse(export(doc))` equals the document, and writing twice
changes nothing), hostile input (long runs of `*`, `[`, `` ` ``, `>`, `(` and more, each within a time limit), the detection rule with texts that must stay plain,
and the paste handler's wiring. Browser checks paste Markdown in three engines.
