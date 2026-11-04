# Plugins and entry points

The core is the part that every editor needs. Everything else is a plugin that uses only what any plugin is given. The status
of this API is experimental: it can still change until the same plugin has been shown to work with both a custom interface and
the styled one (see `HEADLESS.md`).

## Entry points of `@rathkit/rte-core`

| Entry | What it is | Size, gzipped and minified |
| --- | --- | --- |
| `@rathkit/rte-core` | Model, import and export, edit operations, the engine, commands, keys, the plugin host, paste | 17 KB |
| `@rathkit/rte-core/dom` | The browser view (`Editor`) | 3.5 KB more |
| `@rathkit/rte-core/lists` | Bulleted, numbered and definition lists: commands, Tab, Enter and Backspace in items, typed shortcuts | 3.5 KB |
| `@rathkit/rte-core/tables` | Insert a table; add and remove rows and columns; merge and split cells; column widths; header row; Tab and Shift+Tab between cells. See `TABLES.md` | 5 KB |
| `@rathkit/rte-core/find` | Find and replace: case and whole-word options, next and previous, replace one or all in a single undo step. See `COMMANDS.md` | 2 KB |
| `@rathkit/rte-core/autoformat` | Typed shortcuts: `# ` to `###### ` headings, `> ` quote, three backticks a code block, three dashes a rule, `**bold**`, `~~strike~~`, `*italic*`, `_italic_`, `` `code` ``, and a web address followed by a space becomes a link. One undo step takes a conversion back | 1.7 KB |
| `@rathkit/rte-core/markdown` | Markdown in plain-text paste, and Markdown out: `parseMarkdown`, `exportMarkdown`, `looksLikeMarkdown`, and a paste plugin. Off by default; see [MARKDOWN.md](MARKDOWN.md) | 13.6 KB |
| `@rathkit/rte-core/footnotes` | Footnotes: a numbered reference in the text, its note in a list at the end, kept together as people edit. In the standard editor; see [FOOTNOTES.md](FOOTNOTES.md) | 3.8 KB |
| `@rathkit/rte-core/word` | Reads lists the way word processors write them | 1.1 KB |
| `@rathkit/rte-core/svg` | The SVG cleaner; lets content carry SVG images once cleaned | 2.5 KB |
| `@rathkit/rte-core/images` | The image policy: upload hook, inline limit, reports | 1.2 KB |
| `@rathkit/rte-core/standard` | `createEditor()`: the editor with all of the above wired in except Markdown, which stays opt-in. Footnotes are on and can be left out with `footnotes: false` (so can `lists`, `tables`, `find` and `autoformat`) | |

Budgets are 60 KB for the core and 15 KB for each plugin. The sizes above come from `rathkit-pack`'s minifier and are provisional
while that is still changing; CI checks the stricter unminified number. `pnpm check:graph` fails if a core file imports a
plugin, so "core without plugins" stays true.

## What stays in the core, and why

A document with lists must load, draw, save and survive deleting across items with no plugin, so the core keeps the list and
definition-list model, their addressing, their import and export, and how they are drawn. What the plugin adds is the editing
behavior: the commands, the keys, how Enter, Backspace and paste work inside items, and the typed shortcuts. Without the lists
plugin, Enter in an item is a line break and blocks pasted into an item become lines of text in it.

## What a plugin can do (`PluginHost`)

| Hook | Use |
| --- | --- |
| `command(def)` | Add a named command with its state. |
| `keybinding(binding)` | Bind a key chord to a command. Two plugins claiming one chord give a warning and the first keeps it. |
| `behavior(kind, behavior)` | Own Enter, Backspace-at-start and paste in a kind of container (`li`, `dt`, `dd`). One plugin per kind. |
| `textTrigger(fn)` | See typed text before it is inserted and take it over (a list shortcut). |
| `importOptions({ sanitizeSvg, recognizers })` | Teach the importer: clean SVG images; recognize a source's markup. Recognizers return data, not importer internals. |
| `pasteTransform(fn)` | Change pasted blocks before they go in; may take time (an upload). |
| `fileHandler(fn)` | Turn pasted and dropped files into blocks. |
| `pasteHandler(fn)` | See the raw clipboard before anything is sanitized. |
| `copyFormat(fn)` | Add formats to what copy, cut and drag write (`{ "text/markdown": "..." }`), or replace the plain text. Gets the selected blocks. Later plugins win on the same type. |
| `normalize(fn)` | Put right what an edit left (a footnote whose reference was deleted). Runs after every edit that changes the document, on the result, inside the same undo step. Must return the same document when there is nothing to repair. |
| `ops` | The editing operations as plain functions, so a plugin does not import the editor. |

A plugin names the plugin API versions it supports (`api: ">=1 <2"`), and a mismatch fails when it is added. Removing a plugin takes
everything it added away. A plugin file should contain only `import type` lines from the core (`mentions.sample.ts` is checked for that).
The lists, tables, find, word, SVG and images plugins are built the same way, and a test (`plugins-use-host.test.ts`) fails if one of them takes anything from the core that is not also in `ops`, so an outside plugin can do everything these do through the host.

## The part that draws on the page (`view`)

A plugin can also carry a `view` function: the part that only makes sense in a browser, such as the handles at a table's edges or the
corner that resizes an image. The engine never calls it; the browser view (`Editor`, and `createEditor` from `standard`) calls it when
the plugin is added, hands it a `ViewHost`, and calls what it returns when the plugin or the editor is removed.

| `ViewHost` | Use |
| --- | --- |
| `element`, `engine`, `ops` | The element the editor is drawn in, the engine, and the editing toolkit. |
| `listen(target, type, handler)` | Add an event listener that is taken away with the plugin. |
| `onChange(fn)` | Called after the editor has drawn each change, with `{ docChanged, selectionChanged, focusMoved }`. |
| `quiet()` | Say that the page was just changed by this plugin, so the editor does not take it for an edit from outside. |
| `posFromDom(node, offset)`, `domFromPos(pos)` | Map between a place in the page and a position in the document. |

The tables and images entries use it (`tables/view.ts`, `images/view.ts`), so a page that does not use them does not pay for them:
cell marks, row and column handles and resizing come with `tables()`, and image selection and the resize handle come with `images()`.
The engine-only plugin without these is `./plugin.ts` inside the package. An editor built from the parts without those plugins
still shows and edits tables and images; it just has no handles.

## Sharing a key

Two plugins may want the same chord, as lists and tables both want Tab. A binding marked `stack: true` shares its chord with others that say so: they are tried in the order they were added, and the first whose command does something takes the key. A command that does not apply returns false, so the key falls to the next one, and finally to the browser. Without `stack`, the first binding keeps the chord and a warning names the second.

## Plugin state

A plugin that has state of its own (a search in progress) keeps it with `ctx.setPluginState(id, value)` and reads it as `snapshot.plugins[id]`, so command states and interfaces are plain functions of the snapshot. It is not part of the document and not an undo step.

## The public surface

Every name each package exports is listed in `tools/exports.snapshot.txt`, one line per name, marked `value` or `type`, under its entry point.
`pnpm check:exports` (run in CI after the build) fails when the real exports differ from the list, so an added, removed or renamed export
is a reviewed change: run `node tools/check-exports.mjs --update` and commit the new list with the change. The check also fails for a new
export with no doc comment; the names that still lack one are in `tools/exports.undocumented.txt`, and the check asks for a line to be
removed once its declaration has a comment.
