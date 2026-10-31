## 0.1.0-alpha.3 (2026-10-31)

The first version published to npm by the release workflow: staged with provenance and approved by the owner. Use this one.

### Continuous integration

- **release:** give npm a path it will not take for a repository ([3a9f7c8](https://github.com/rathkit/rte/commit/3a9f7c8))

## 0.1.0-alpha.2 (2026-10-31)

Not published to npm: the publish step failed on a file path before anything was staged. A GitHub pre-release only.

### Build

- **release:** sign the release tag and check for the signature ([cd4ac2c](https://github.com/rathkit/rte/commit/cd4ac2c))

## 0.1.0-alpha.1 (2026-10-30)

Not published to npm: its tag was created without a signature, so the publish job was cancelled before anything was staged. A GitHub pre-release only.

### Documentation

- **changelog:** drop a stale gap and note the hand-published first versions ([2448f61](https://github.com/rathkit/rte/commit/2448f61))

### Build

- **release:** sign off the release commit ([6f4ddb2](https://github.com/rathkit/rte/commit/6f4ddb2))

### Continuous integration

- **release:** stage the packages and leave the approval to the owner ([5f7cf76](https://github.com/rathkit/rte/commit/5f7cf76))

## [0.1.0-alpha.0] - 2026-10-30

The first alpha. Published to the `next` dist-tag only, never `latest`. Eleven packages, none with a runtime dependency. It is a first look, not something to build on: the APIs will change. These first versions were published by hand and carry no provenance statement; later releases are published by the release workflow and will.

### Packages

- `@rathkit/rte-core`: the document model, HTML import and export, editing operations, the engine (commands, keys, plugins), the browser view, and the free plugins as entry points (`/lists`, `/tables`, `/find`, `/word`, `/svg`, `/images`, `/standard`).
- `@rathkit/rte-headless`: how a toolbar, menu, dialog, tooltip and announcement behave for keyboard and assistive technology, with no markup or CSS.
- `@rathkit/rte-element`: `<rk-editor>` and `<rk-toolbar>` custom elements.
- `@rathkit/rte-ui`, `@rathkit/rte-themes`, `@rathkit/rte-icons`: the styled interface, four themes and a density setting, and the icon set.
- `@rathkit/rte-react`, `@rathkit/rte-vue`, `@rathkit/rte-svelte`, `@rathkit/rte-angular`, `@rathkit/rte-jquery`: wrappers. The Angular one is a directive, signals and an Angular forms value accessor.

### Editing

- Text: links that can open in a new tab, bold, italic, underline, strikethrough, code, superscript, subscript, text and highlight colors, links, images (resizable by dragging a corner or in a properties dialog, with a description, a position beside text and a caption; by address, paste or drop), special characters, clear formatting.
- Lists: marker style and starting number from a menu, and several paragraphs in one item.
- Tables: move rows and columns (a step, or by dragging a handle), handles for a finger, large tables measured; sort rows by a column (numbers by value, text by language), and drag a row's bottom edge to set its height.
- Typed shortcuts: headings, quotes, code blocks, rules, bold, italic, strike, code spans and web addresses turn into formatting as they are typed (the `autoformat` plugin; each kind can be turned off).
- Blocks: paragraphs, headings, block quotes, code blocks, horizontal rules, alignment, reading direction, indent.
- Lists: bulleted, numbered, definition and task lists with nesting, Tab and Shift+Tab, and typed shortcuts.
- Tables: insert, rows and columns, merge and split cells, header row, column widths (including dragging an edge), cell fill and borders, row heights, Tab between cells.
- Options: placeholder, maximum length, spellcheck, autofocus.
- Find and replace, an HTML source view, word and character counts, undo and redo, keyboard shortcuts list.
- Paste cleaned up from word processors and spreadsheets (80 scrubbed captures are the tests); the spreadsheet style-class case is a paid feature and not included.

### What is checked

Unit tests, 700+ browser checks in Chromium, Firefox and WebKit, an interface audit (names, ids, references, roles), contrast tests for every theme, a check that nothing is stored, no cookie is set and no request is made, size budgets, and a check of what would be published. See `docs/SUPPORT.md` and `docs/MEASUREMENTS.md` for exactly what and how.

### Known gaps

Touch input, real input methods (macOS, Windows) and screen readers have not been tested by hand. See `docs/CONFORMANCE.md` for the list.
