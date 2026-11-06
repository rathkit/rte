# Content policy

What the editor keeps and what it drops when it reads HTML: loading a document, `setHtml`, `value`, pasting, dropping. One pipeline
does all of it (`importHtml` and `importBlocks`): it parses the markup without a DOM, applies the lists on this page, and builds the
document model. Nothing is ever put on the page from the markup as it came, so what is not in these tables cannot reach the editor.

The tables below are read by `packages/rte-core/src/policy.test.ts` and compared with the tables in `packages/rte-core/src/policy.ts`.
A row added to one and not the other fails the test. The rules at the end each have a test named after them (`rule N`).

## Where it applies

| Input | Policy |
| --- | --- |
| Starting `html`, `setHtml`, `value`, a form reset | This page, read in full (`loading`) |
| Paste and drop of HTML | This page, reading meaning only (`pasting`), plus the editor's recognizers |
| Paste of plain text | The input limit only. Plain text has no markup to filter |
| Paste of Markdown (the `markdown` plugin) | Links and images are checked the same way; the input limit applies; nesting is bounded (rule 8). Raw HTML in Markdown is text, never markup |
| Pasted or dropped image files | The images plugin's own policy (`docs/IMAGES.md`) |
| SVG images | Refused unless the SVG plugin is on; it rewrites them from a parsed, allow-listed copy |

## Elements

Anything not listed is an unknown element (rule 10): its tags go and its text stays.

| Element | What happens |
| --- | --- |
| `p` | kept: paragraph |
| `h1` | kept: heading 1 |
| `h2` | kept: heading 2 |
| `h3` | kept: heading 3 |
| `h4` | kept: heading 4 |
| `h5` | kept: heading 5 |
| `h6` | kept: heading 6 |
| `ul` | kept: bulleted list |
| `ol` | kept: numbered list |
| `li` | kept: list item |
| `dl` | kept: definition list |
| `table` | kept: table |
| `thead` | kept: table part |
| `tbody` | kept: table part |
| `tfoot` | kept: table part |
| `tr` | kept: table row |
| `td` | kept: table cell |
| `th` | kept: header cell |
| `colgroup` | kept: column widths |
| `col` | kept: column width |
| `blockquote` | kept: quote |
| `pre` | kept: code block |
| `hr` | kept: rule |
| `br` | kept: line break |
| `img` | kept: image |
| `a` | kept: link |
| `strong` | kept: bold |
| `b` | kept: bold |
| `em` | kept: italic |
| `i` | kept: italic |
| `cite` | kept: italic |
| `dfn` | kept: italic |
| `var` | kept: italic |
| `u` | kept: underline |
| `ins` | kept: underline |
| `s` | kept: strikethrough |
| `strike` | kept: strikethrough |
| `del` | kept: strikethrough |
| `code` | kept: code |
| `tt` | kept: code |
| `kbd` | kept: code |
| `samp` | kept: code |
| `sup` | kept: superscript (or a note reference) |
| `sub` | kept: subscript |
| `font` | kept: text color |
| `span` | kept: style marks only |
| `address` | grouping: ends the paragraph around it, its content is kept |
| `article` | grouping: ends the paragraph around it, its content is kept |
| `aside` | grouping: ends the paragraph around it, its content is kept |
| `body` | grouping: ends the paragraph around it, its content is kept |
| `center` | grouping: ends the paragraph around it, its content is kept |
| `dd` | grouping: ends the paragraph around it, its content is kept |
| `details` | grouping: ends the paragraph around it, its content is kept |
| `div` | grouping: ends the paragraph around it, its content is kept |
| `dt` | grouping: ends the paragraph around it, its content is kept |
| `fieldset` | grouping: ends the paragraph around it, its content is kept |
| `figcaption` | grouping: ends the paragraph around it, its content is kept |
| `figure` | grouping: ends the paragraph around it, its content is kept |
| `footer` | grouping: ends the paragraph around it, its content is kept |
| `form` | grouping: ends the paragraph around it, its content is kept |
| `header` | grouping: ends the paragraph around it, its content is kept |
| `hgroup` | grouping: ends the paragraph around it, its content is kept |
| `html` | grouping: ends the paragraph around it, its content is kept |
| `main` | grouping: ends the paragraph around it, its content is kept |
| `nav` | grouping: ends the paragraph around it, its content is kept |
| `section` | grouping: ends the paragraph around it, its content is kept |
| `summary` | grouping: ends the paragraph around it, its content is kept |
| `applet` | dropped with everything inside it |
| `audio` | dropped with everything inside it |
| `base` | dropped with everything inside it |
| `button` | dropped with everything inside it |
| `canvas` | dropped with everything inside it |
| `embed` | dropped with everything inside it |
| `frame` | dropped with everything inside it |
| `frameset` | dropped with everything inside it |
| `head` | dropped with everything inside it |
| `iframe` | dropped with everything inside it |
| `input` | dropped with everything inside it |
| `link` | dropped with everything inside it |
| `meta` | dropped with everything inside it |
| `noscript` | dropped with everything inside it |
| `object` | dropped with everything inside it |
| `option` | dropped with everything inside it |
| `script` | dropped with everything inside it |
| `select` | dropped with everything inside it |
| `style` | dropped with everything inside it |
| `template` | dropped with everything inside it |
| `textarea` | dropped with everything inside it |
| `video` | dropped with everything inside it |
| `xml` | dropped with everything inside it |

## Attributes

Only these are read. Everything else is ignored, so `on*` handlers, `srcset`, `contenteditable`, `data-*` (other than the ones
listed) and the like never reach the model. Rows marked "loading only" are not read when pasting.

| Attribute | Read for |
| --- | --- |
| `align` | alignment, the old form (loading only) |
| `alt` | image description |
| `aria-checked` | task state |
| `aria-level` | heading level, with role="heading" |
| `bgcolor` | cell background (loading only) |
| `class` | task state and note markers, by name only |
| `color` | text color on font (loading only) |
| `colspan` | cell width in columns (at most 100) |
| `data-aria-level` | list level from a word processor |
| `data-caption` | image caption (at most 1000 characters) |
| `data-checked` | task state |
| `data-footnote-backref` | note back link, dropped |
| `data-footnote-ref` | note reference |
| `data-footnotes` | notes list |
| `data-listid` | list identity from a word processor |
| `data-note` | note id |
| `dir` | reading direction (ltr, rtl) |
| `height` | image or row height |
| `hidden` | element and its content dropped |
| `href` | link address, or note id |
| `id` | note id |
| `role` | heading, note and backlink roles |
| `rowspan` | cell height in rows (at most 100) |
| `span` | column span on col (at most 100) |
| `src` | image address |
| `start` | first number of a numbered list (0 to 99999) |
| `style` | the style properties below |
| `target` | _blank opens a link in a new tab |
| `type` | list marker (a, A, i, I, 1) and checkbox |
| `width` | image or column width |

## Style properties

Only these are read, and only the values the model accepts: a color is a hex value, a plain name or `rgb()`/`hsl()` with numbers; a
length is a number with a known unit. Anything else, `url()`, `expression()` and `var()` included, is ignored.

| Property | Read for |
| --- | --- |
| `background` | cell background (loading only) |
| `background-color` | text and cell background (loading only) |
| `border` | cell lines (loading only) |
| `border-bottom` | cell lines (loading only) |
| `border-left` | cell lines (loading only) |
| `border-right` | cell lines (loading only) |
| `border-top` | cell lines (loading only) |
| `color` | text color (loading only) |
| `display` | none drops the element (always); block with auto margins centers an image (loading only) |
| `float` | image to the left or right (loading only) |
| `font-style` | italic |
| `font-weight` | bold |
| `height` | row height (loading only) |
| `list-style-type` | list marker |
| `margin` | image centering (loading only) |
| `margin-left` | indent, image centering (loading only) |
| `margin-right` | indent (right to left), image centering (loading only) |
| `padding-left` | indent (loading only) |
| `text-align` | alignment (loading only) |
| `text-decoration` | underline and strikethrough |
| `text-decoration-line` | underline and strikethrough |
| `vertical-align` | superscript and subscript |
| `width` | column width |

## URL schemes

| Where | Allowed |
| --- | --- |
| Links (`href`) | Relative and fragment addresses, and the schemes in `linkSchemes` (standard: `http`, `https`, `mailto`, `tel`). Spaces, tabs, control characters and numeric entities inside the scheme do not hide it; an entity name the reader does not know stays as typed, so it cannot hide one either. An address with a backslash is refused. A link with no usable address is plain text |
| Images (`src`) | `http` and `https`, relative addresses (`a.png`, `/a.png`) and `//host` addresses, kept as written; and `data:` images of PNG, JPEG, GIF, WebP and BMP whose first bytes match (the bytes are trusted, not the declared type) and that are no longer than `maxDataImageLength`. `data:image/svg+xml` only through the SVG plugin. Everything else (`file:`, `blob:`, `javascript:`, `ftp:`) is refused. A relative address is drawn as it is when a document is loaded, and refused when pasting (unless `pasteRelativeImages` is on). An `http`, `https` or `//host` one is drawn only when the editor is set to `loadRemoteImages` |

## Limits and profiles

The host picks a profile and may change single choices (`content: { profile: "strict", maxDepth: 20 }` in the editor options).

| Choice | strict | standard (default) | loose |
| --- | --- | --- | --- |
| `linkSchemes` | http, https, mailto | http, https, mailto, tel | http, https, mailto, tel, sms, ftp, ftps |
| `styles` when loading | semantic | allowlist | allowlist |
| `pasteRelativeImages` | false | false | false |
| `maxDataImageLength` (characters) | 0 (no `data:` images) | 12,000,000 | 25,000,000 |
| `maxDepth` (nested elements) | 32 | 100 | 200 |
| `maxInputLength` (characters) | 1,000,000 | 50,000,000 | 200,000,000 |

`semantic` keeps meaning (bold, italic, underline, strikethrough, superscript and subscript, code, links, list markers, column widths);
`allowlist` also keeps text color, background color, alignment, indents, image placement, cell lines and row heights.
Pasting is always `semantic`, whatever the profile.

Other fixed limits: a cell spans at most 100 columns or rows, a list starts at 0 to 99,999, an image is under 100,000 pixels either
way, an image caption is cut at 1,000 characters, an indent is at most 8 steps, and a note id is 1 to 40 letters, digits, `_` or `-`.

## Loading and pasting

| | Loading | Pasting and dropping |
| --- | --- | --- |
| Style properties | The profile's `styles` | Always `semantic` |
| Empty paragraphs | Kept (they were written) | Dropped |
| A trailing run of non-breaking spaces | Kept | Dropped (a word processor's paragraph mark) |
| Image with a relative address (`a.png`, `/a.png`) | Kept | Refused (a pasted path would be fetched from the page's own origin), unless `pasteRelativeImages` |
| One-cell table | Kept | Unwrapped to its content |
| Limits and schemes | The profile's | The profile's |

## Rules

Each rule has a hostile-markup test, `rule N` in `policy.test.ts`.

1. **Active and embedding elements are dropped with their content.** Every element in the table marked "dropped" goes, and nothing
   inside it is read, whatever it holds.
2. **An attribute that is not listed is never read.** Event handlers, `srcset`, `style` values outside the table and the like change
   nothing about the result.
3. **A link keeps only an allowed scheme.** Capitals, entities, spaces, tabs and control characters inside the scheme do not get
   `javascript:`, `vbscript:`, `data:` or `file:` through. A refused link leaves its text.
4. **An image keeps only a remote address or real raster bytes** (and, when loading, a relative address). A declared type that does not match the bytes, an SVG, a `file:`
   or `javascript:` address, and a `data:` image over the limit are all refused. The image is left out; text around it stays.
5. **Hidden content is dropped.** An element with `hidden`, or `display: none` in its style, goes with its content.
6. **A style value that is not a plain color or length is ignored.** `url()`, `expression()`, `var()`, a second declaration smuggled in
   after a color, and a color with letters where numbers belong all give nothing.
7. **Numbers are bounded.** `colspan`, `rowspan` and `span` stop at 100; `start` outside 0 to 99,999, an image size of 100,000
   or more, and an indent above 8 steps are ignored or clamped. Table sizes never make the reader throw.
8. **Nesting is bounded.** An element nested deeper than `maxDepth` is left out, its content kept in the deepest element allowed.
   Any depth of markup is read without an error. (Text placed straight inside a `table`, outside a cell, belongs to no cell and goes.)
   Markdown follows the same setting: lists and quotes nest at most `maxDepth` levels, and never more than 24, and what is nested deeper
   stays as text in the deepest level. The time to read Markdown grows in proportion to its length: a paragraph of 200,000 lines, 60,000
   lines each inside 30 nested quotes, and a list 24 deep with 120,000 items each read in under a second (they took 12, 8 and 15 seconds
   before; the test is `the time to read Markdown grows with its length`), and the benchmark suite times these shapes
   (`docs/MEASUREMENTS.md`, "Markdown").
9. **Input is bounded.** Markup (or pasted text) longer than `maxInputLength` is refused whole: nothing is read, `onLimit` is told
   and the editor's warning handler is called. The document is not changed by a refused paste; a refused load gives an empty
   document.
10. **An unknown element is unwrapped.** A custom element, `label`, `mark` and the like give their text and nothing else. A table
    caption is not kept. Comments, doctypes, processing instructions and CDATA are dropped.
11. **Pasting reads meaning, not looks.** Colors, backgrounds, alignment, indents, image placement, cell lines and row heights are not
    read when pasting, in any profile.
12. **A profile only changes what this page says it changes.** `strict` has no `data:` images and no color or alignment on load;
    a single choice given with the profile wins over the profile.

What this page does not promise: that the result looks like the source. The editor keeps what it can express and drops the rest.
