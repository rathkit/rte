# Clipboard: copy, cut, paste, drag and drop

What the editor writes when content leaves it, what it reads when content comes in, and where each case is checked. Every row below
was run in Chromium, Firefox and WebKit by `tools/browser-checks/run.mjs`, unless the row says otherwise. The checks for this page are named
"clipboard: …" (the matrix block); the older ones it also leans on are named in the "Check" column. A row marked **not checked** says
why. How pasted HTML is cleaned is in [PASTE.md](PASTE.md) and [CONTENT-POLICY.md](CONTENT-POLICY.md); images are in
[IMAGES.md](IMAGES.md); Markdown is in [MARKDOWN.md](MARKDOWN.md).

The clipboard in these checks is the real one: the page writes it from a click (`navigator.clipboard.write`), and the paste is a
real Ctrl+V. Copy and cut are a real Ctrl+C and Ctrl+X, and drags are real mouse drags, except where a row says the drop is made up.

## What leaves the editor

Copy, cut and a drag that starts in the editor write the same formats, built from the editor's model, not the page's markup.

| Format | Written | Check |
| --- | --- | --- |
| `text/html` | Always: the selected blocks, structure kept (a part of a list is a list, a range of cells is a table, a rule between two selected blocks comes along) | "copy writes the model's html and text", "clipboard: copy across a rule writes the rule" |
| `text/plain` | Always: a line per block; the cells of one table row are separated by tabs | "clipboard: copy of a cell range writes a table and tab-separated rows" |
| `text/markdown` | With the Markdown plugin (`copy: "markdown"`, the default); `copy: "plain"` also makes the plain text Markdown | "clipboard: copy writes html, plain text and, with the Markdown plugin, Markdown" |
| Other formats | A plugin may add any with the `copyFormat` hook ([PLUGINS.md](PLUGINS.md)) | A unit test checks that a formatter that throws is skipped; **not checked** in a browser |
| Files | None: copy writes only the formats above, so an image goes as an `<img>` in the HTML (read from the code) | **Not checked** |

Where the selection is:

| Selection | What is written | Check |
| --- | --- | --- |
| Text in a paragraph, heading or list | The HTML of that part, and its text | "copy writes the model's html and text" |
| Text in a code block | `<pre>` with the code, and the code as it is (line breaks, indentation) | "clipboard: copy in a code block writes the code as it is" |
| A range of table cells | A table of those cells, and tab-separated rows | "clipboard: copy of a cell range writes a table and tab-separated rows" |
| Across a horizontal rule | The rule is written; cut removes it with the rest | "clipboard: copy across a rule writes the rule", "clipboard: cut across a rule takes the rule with it" |
| Read-only editor | Copy and cut both write; cut deletes nothing | "clipboard: read-only: copy and cut write, nothing is deleted, paste is refused" |

A cell holding more than one paragraph puts each on its own line in the plain text, which breaks the row shape for a spreadsheet. The
HTML keeps it right.

## What comes into the editor

The editor reads `text/html` when there is any, otherwise `text/plain`. Files are read only when the clipboard has neither. Plugins'
paste handlers see the raw clipboard (HTML, plain text, RTF, and the list of formats) before the built-in handling.

Every cell of this grid is one check, named "clipboard: grid: *source* pasted into a *place*" (for example "clipboard: grid: plain text
pasted into a cell range"). The caret is inside the text of the place, so the results show what joins on either side of it.

| Source on the clipboard | `paragraph` | `code block` | `cell` | `cell range` | `list item` |
| --- | --- | --- | --- | --- | --- |
| `html`: HTML with plain text (a web page, a word processor, another editor) | Cleaned HTML, joined at the caret | The plain text, as it is | The blocks, inside the cell | The blocks in the first cell; the other selected cells are emptied | Each block an item, joined at the caret |
| `one cell`: one copied spreadsheet cell (a one-cell table) | Its text | Its text | Its text | Fills every selected cell | Its text |
| `plain text` | A paragraph per part between blank lines | As it is | Paragraphs, inside the cell | Paragraphs in the first cell; the others are emptied | An item per part |
| `tab-separated text` (a spreadsheet, a terminal) | Text with tabs, a line break per line | As it is | Fills the cells from this one, growing the table if needed | Fills the cells from the first selected one | Text with tabs and line breaks |
| `Markdown text`: plain text that looks like Markdown (with the Markdown plugin) | Heading text joined at the caret, then the list | As it is | The structure, inside the cell | The structure in the first cell; the others are emptied | An item per line |
| `an image`: an image file, nothing else (Chromium and WebKit) | An image, through the image policy | **Nothing goes in**: a code block holds only text | An image in the cell | An image in the first cell; the others are emptied | An image in the item |

More, each with its own check:

| Case | Result | Check |
| --- | --- | --- |
| A table pasted into a cell | Fills the cells from that one and grows the table | "clipboard: a table pasted into a cell fills the cells and grows the table" |
| A list pasted into a list item | Joins the list | "clipboard: a list pasted into a list item joins the list" |
| A file that is not an image | Ignored unless a plugin's file handler takes it | Checked by drop: "clipboard: a dropped file that is not an image is ignored"; **not checked** by paste |
| Anything, into a read-only editor | Refused | "clipboard: read-only: copy and cut write, nothing is deleted, paste is refused" (plain text), "access (readonly): a paste event and a cut event change nothing" (Chromium and WebKit) |
| The scrubbed captures from word processors and spreadsheets (`fixtures/paste`) | Every one pasted; none makes a request outside the machine, none throws | "… captures pasted, none made an outside request"; what they turn into is checked by the conformance suites ([CONFORMANCE.md](CONFORMANCE.md)) |
| An image on the clipboard in Firefox, and in the older WebKit of the older CI job | **Not checked** (see "Known gaps") | — |

## Between two editors on one page

| Action | Result | Check |
| --- | --- | --- |
| Select all, copy in one, paste into an empty other | The same document, rules, tables, code and nested lists included | "clipboard: everything copied in one editor pastes the same in another" |
| Cut in one, paste in the other | The text moves | "clipboard: cut in one editor and paste in another moves the text" |
| Drag from one to the other | **Copies.** The target shows a copy cursor and the source keeps the text | "clipboard: a drag from one editor to another copies", "clipboard: and back" |

Each editor knows only its own drags, so a drag into another editor is a copy, even when both are on the same page. Making it a move would
need the two to share state, which breaks once a page loads two copies of the package.

## Drag and drop

| Action | Result | Check |
| --- | --- | --- |
| Drag a selection within the editor | Moves it (Ctrl or Alt held at the drop copies; that is **not checked**) | "dragging text moves it" |
| Drag out into a text field on the page | Moves it: the field gets the text, the editor loses it | "clipboard: a drag out into a text field on the page moves the text" |
| Drag out onto a part of the page that takes no drop | Nothing changes | "clipboard: a drag out to a place that takes no drop leaves the text" |
| Drop HTML from outside | Goes in where it is dropped, cleaned as a paste is | "clipboard: markup dropped from outside goes in where it is dropped" (the drop event is made up) |
| Drop an image file | An image, through the image policy | "a dropped image file becomes an image", and the image checks |
| Drop any other file | Ignored unless a plugin's file handler takes it | "clipboard: a dropped file that is not an image is ignored" (made-up drop) |
| Drop into a read-only editor | Refused | "access (readonly): dropping text, markup and files changes nothing" (made-up drops) |
| Drag to another application | **Not checked**: the browser hands the formats above to the system; what the other application reads is up to it | — |

## Limits

| Limit | What happens | Check |
| --- | --- | --- |
| `content.maxInputLength` (characters; 1,000,000 strict, 50,000,000 standard, 200,000,000 loose; see [CONTENT-POLICY.md](CONTENT-POLICY.md)) | Plain text longer than this is refused whole and reported as `content-too-long` ([ERRORS.md](ERRORS.md)). In a code block too | "clipboard: plain text past the input limit is refused and reported", "clipboard: plain text past the input limit is refused in a code block too" |
| The same, for HTML | HTML longer than the limit is not read; the plain text beside it is pasted instead, and the refusal is reported | "clipboard: markup past the input limit falls back to the plain text, and is reported" |
| `maxLength` (the document's length) | A paste that would pass it is refused whole, not cut short | "clipboard: a paste past maxLength is refused whole" |
| Images | Size limits and uploads are the image policy's ([IMAGES.md](IMAGES.md)) | The image checks |

How long a large paste takes is not given here; measured figures are only in [MEASUREMENTS.md](MEASUREMENTS.md).

## Known gaps

- **A clipboard with only `text/markdown`** (and no plain text or HTML) is ignored. Seen with a made-up paste event in Chromium and
  WebKit; not a browser check.
- **Text wins over files.** When the clipboard has text or HTML and a file, the file is not read (seen with made-up paste events in
  Chromium and WebKit; not a browser check). So a file copied in a file manager that also puts its name on the clipboard pastes as the
  name, and an image copied from a web page that also writes `<img src>` pastes as that address, which is then handled as any pasted
  image address is ([IMAGES.md](IMAGES.md)), not as a file.
- **An image pasted into a code block is dropped without a word.** A code block holds only text; no warning is reported.
- **An image on the clipboard in Firefox, and in the older WebKit of the older CI job (26.6), is not checked.** As the browser checks run
  them, these engines hand the paste event an empty clipboard for an image written by the page (the check asks the browser itself, before
  the editor sees the event, and leaves the rows out when nothing arrives), so the file route is checked there only by drop.
- **Dragging out deleted the text in Firefox** when the drop landed where nothing takes a drop; this is fixed and checked, but it was
  seen only in the Firefox build that Playwright runs and has not been confirmed by hand.
- **Clipboard formats on phones** are as [SUPPORT.md](SUPPORT.md) says: Android strips formatting before the editor sees a paste.
