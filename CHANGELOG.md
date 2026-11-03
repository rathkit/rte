## 0.1.0-alpha.4 (2026-11-03)

Published to the `next` dist-tag only. Footnotes and Markdown are new, and the interface can now be had as one element.

- **Footnotes are part of the standard editor.** Numbered references with an end list of notes, read and written in HTML (and in Markdown when that plugin is on). Pages built with `createEditor()` or the standard plugins get them; pass `footnotes: false` to leave them out. Pages assembled from single plugins are unchanged.
- **Markdown is opt-in**: `@rathkit/rte-core/markdown` reads and writes it, and can handle paste and copy as Markdown.
- **New plugin hooks**: `view` (a plugin brings its own code for the page) and `normalize` (repair the document after each edit, in the same undo step). Table and image handles moved out of the core into their plugins. The API may still change between alphas.

### Features

- **core:** read and write Markdown, with an opt-in paste plugin ([b981dd2](https://github.com/rathkit/rte/commit/b981dd2))
- **core:** copy hook for plugins, copy as Markdown, and Markdown reference links ([161f6c2](https://github.com/rathkit/rte/commit/161f6c2))
- **core:** list items hold code, quotes, paragraphs and rules after their text ([3968c62](https://github.com/rathkit/rte/commit/3968c62))
- **core:** read and write inline HTML tags for underline, super and subscript in Markdown ([0f3546d](https://github.com/rathkit/rte/commit/0f3546d))
- **footnotes:** add footnotes with numbered references and an end list of notes ([74a801e](https://github.com/rathkit/rte/commit/74a801e))
- **standard:** add footnotes to the standard editor, with footnotes: false to leave them out ([b39deb7](https://github.com/rathkit/rte/commit/b39deb7))
- **ui:** add an optional selection toolbar and context menu ([0345114](https://github.com/rathkit/rte/commit/0345114))
- **ui:** add the rk-ui element for the styled interface ([cb9cf8b](https://github.com/rathkit/rte/commit/cb9cf8b))

### Fixes

- **core:** rename the per-block footnote scan helper ([983794b](https://github.com/rathkit/rte/commit/983794b))
- **ui:** return focus to the editor after a dialog opened from the selection toolbar or context menu ([403e306](https://github.com/rathkit/rte/commit/403e306))

### Internal changes

- **view:** let plugins bring their own page code, moving table and image handles out of the core ([5b7992a](https://github.com/rathkit/rte/commit/5b7992a))

### Documentation

- bring the README up to date with what is on npm ([b2e3ac7](https://github.com/rathkit/rte/commit/b2e3ac7))
- bring the release docs up to date with the first releases ([db12a48](https://github.com/rathkit/rte/commit/db12a48))
- add the hand-testing script for screen readers, input methods and phones ([9e62b95](https://github.com/rathkit/rte/commit/9e62b95))
- **changelog:** say which versions never reached npm ([2720f77](https://github.com/rathkit/rte/commit/2720f77))
- **readiness:** mark the publish checklists as snapshots ([376a081](https://github.com/rathkit/rte/commit/376a081))
- **readiness:** record that @rathkit-pro is claimed and secret scanning is on ([a060e7e](https://github.com/rathkit/rte/commit/a060e7e))

### Tests

- **ui:** check rk-ui from React, Vue and Angular templates ([263573e](https://github.com/rathkit/rte/commit/263573e))
- **ui:** check rk-ui from a Svelte template ([cd6bcdc](https://github.com/rathkit/rte/commit/cd6bcdc))

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
