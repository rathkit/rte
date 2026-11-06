## 0.2.0-beta.0 (2026-11-06)

Published to the `next` dist-tag only. This is the first beta, and it is about measuring: the benchmark suite and its method now live in their own repository (`rathkit/rte-bench`) and run in a container; CI enforces numeric size and speed budgets against the base commit; there are memory and leak checks, runs at a slower CPU, and a low-memory run. `docs/MEASUREMENTS.md` has the figures and how each was taken. Markdown is now read in time proportional to its length, and its nesting limit follows the content profile. Nothing in this release breaks the API of `0.1.0-alpha.5`, but a beta can still change options, output and plugin support.

### Features

- **tools:** add the benchmark suite and its method ([#9](https://github.com/rathkit/rte/issues/9))
- **tools:** write the budgets for speed, memory and cold start ([#10](https://github.com/rathkit/rte/issues/10))
- **tools:** fail a change that grows a size or slows a command beyond a margin ([#12](https://github.com/rathkit/rte/issues/12))

### Fixes

- **core:** destroy() takes away every plugin, and add the leak test ([#11](https://github.com/rathkit/rte/issues/11))
- **markdown:** read Markdown in time proportional to its length ([9b6295d](https://github.com/rathkit/rte/commit/9b6295d))
- **tools:** leave the first small document out of the memory comparison ([dbae906](https://github.com/rathkit/rte/commit/dbae906))

### Internal changes

- **bench:** the harness moves to rathkit/rte-bench ([b0c5ab7](https://github.com/rathkit/rte/commit/b0c5ab7))

### Documentation

- say alpha.5 is on npm ([3a2f412](https://github.com/rathkit/rte/commit/3a2f412))
- **contributing:** the rule for describing performance ([5197fc8](https://github.com/rathkit/rte/commit/5197fc8))
- **measurements:** republish the figures from the container run ([0ebe0f5](https://github.com/rathkit/rte/commit/0ebe0f5))
- **measurements:** add 6x CPU and low-memory figures, tick 3.5 ([#13](https://github.com/rathkit/rte/issues/13))
- **measurements:** add the Markdown reading figures ([#80](https://github.com/rathkit/rte/issues/80))
- **roadmap:** add 3.13, benchmarks in their own repository ([36cd181](https://github.com/rathkit/rte/commit/36cd181))
- **roadmap:** tick 3.13, benchmarks are in rathkit/rte-bench ([#82](https://github.com/rathkit/rte/issues/82))

### Build

- **release:** accept beta versions and say beta in the package READMEs ([a50b53f](https://github.com/rathkit/rte/commit/a50b53f))

### Continuous integration

- pin every runner image to ubuntu-24.04 ([90aceee](https://github.com/rathkit/rte/commit/90aceee))
- key the browser cache by runner image ([c71fe22](https://github.com/rathkit/rte/commit/c71fe22))
- **bench:** run the gate in the rte-bench container ([f9b5899](https://github.com/rathkit/rte/commit/f9b5899))

## 0.1.0-alpha.5 (2026-11-04)

Published to the `next` dist-tag only. This alpha renames things and tightens how content and problems are handled, so expect to change code that uses earlier alphas.

- **Breaking: the `rk-` prefix is now `rte-`** (elements, attributes, CSS classes and custom properties), custom element classes end in `Element`, and each exported name now comes from one entry point only (`tools/exports.snapshot.txt` lists them).
- **A written content policy** (`docs/CONTENT-POLICY.md`) with `strict`, `standard` and `loose` profiles, limits on nesting depth and input size, and a `content` attribute on the element. Pasting an image with a relative address is refused unless the host opts in with `pasteRelativeImages`.
- **One warning channel**: problems are reported as `{ code, message }` through `onWarning`, and a plugin that fails is isolated and rolled back instead of taking the editor down.
- **Read-only and disabled** are real states, with the right ARIA and focus behavior, and the React, Vue, Svelte, Angular and jQuery wrappers take a `disabled` option.
- A nested list item that holds only a sub-list now shows its bullet.

### Features

- report ready, change, focus, blur and selection the same way everywhere ([#2](https://github.com/rathkit/rte/issues/2))
- add a disabled prop to the framework wrappers and check the sizing handles ([456734d](https://github.com/rathkit/rte/commit/456734d))
- **core:** write down the content policy, bound depth and input size, add profiles ([#6](https://github.com/rathkit/rte/issues/6))
- **core:** report problems on one channel with codes and isolate failing plugins ([#7](https://github.com/rathkit/rte/issues/7))
- **core:** make read-only reachable, add a disabled state, and check every input path ([#8](https://github.com/rathkit/rte/issues/8))
- **element:** choose the content profile with a content attribute ([3613647](https://github.com/rathkit/rte/commit/3613647))
- **tools:** check the public exports of every package against a snapshot ([#1](https://github.com/rathkit/rte/issues/1))

### Fixes

- **core:** read trailing spaces, equals signs and addresses in one pass ([9d946e8](https://github.com/rathkit/rte/commit/9d946e8))
- **core:** end an undo step when the caret moves, give compositions their own step, restore redo caret ([#3](https://github.com/rathkit/rte/issues/3))
- **core:** keep the caret in text next to rules, delete rules first, end a triple click at the block ([#4](https://github.com/rathkit/rte/issues/4))
- **core:** make Enter, Backspace and Delete finish at block edges ([#5](https://github.com/rathkit/rte/issues/5))
- **core:** show the marker on an empty list item that holds a nested list ([1415dfc](https://github.com/rathkit/rte/commit/1415dfc))
- **core:** refuse images with a relative address when pasting ([ecc244b](https://github.com/rathkit/rte/commit/ecc244b))
- **deps:** use patched undici and minimatch in the development tools ([8a616f7](https://github.com/rathkit/rte/commit/8a616f7))
- **deps:** keep minimatch at the version nx can use ([19500d0](https://github.com/rathkit/rte/commit/19500d0))
- **element:** check for an empty value without a backtracking pattern ([532d7f4](https://github.com/rathkit/rte/commit/532d7f4))
- **svg:** refuse a comment nested in a comment ([3bebbbe](https://github.com/rathkit/rte/commit/3bebbbe))
- **svg:** cut comments out until none is left ([bf1dad6](https://github.com/rathkit/rte/commit/bf1dad6))
- **svg:** cut comments out in a bounded number of passes ([4e29dee](https://github.com/rathkit/rte/commit/4e29dee))
- **tools:** read each fixture once and encode every @ in a package url ([97c743c](https://github.com/rathkit/rte/commit/97c743c))

### Internal changes

- ⚠️  export each name from one entry point only ([fffac2a](https://github.com/rathkit/rte/commit/fffac2a))
- ⚠️  name custom element classes with an Element suffix ([457f9fc](https://github.com/rathkit/rte/commit/457f9fc))
- ⚠️  rename the rk- prefix to rte- ([9c46bed](https://github.com/rathkit/rte/commit/9c46bed))

### Documentation

- update the status line for the public alpha ([55138ad](https://github.com/rathkit/rte/commit/55138ad))
- **embeds:** scope embedded pages, videos and media ([85ef0f0](https://github.com/rathkit/rte/commit/85ef0f0))
- **embeds:** record the owner's decisions ([20cf65e](https://github.com/rathkit/rte/commit/20cf65e))
- **packages:** drop the version from the alpha notice in the package READMEs ([521eb60](https://github.com/rathkit/rte/commit/521eb60))
- **readme:** say alpha.4 is on npm and list footnotes and Markdown ([481fb0c](https://github.com/rathkit/rte/commit/481fb0c))
- **roadmap:** draft the road to 1.0 in the shape of the Pack roadmap ([964b6ed](https://github.com/rathkit/rte/commit/964b6ed))
- **roadmap:** link the roadmap items to their issues and project ([7b5436f](https://github.com/rathkit/rte/commit/7b5436f))
- **roadmap:** rte-server is part of 1.0; the project is public ([df158b6](https://github.com/rathkit/rte/commit/df158b6))
- **support:** record the run on the oldest React, Vue and jQuery the wrappers allow ([6b660d2](https://github.com/rathkit/rte/commit/6b660d2))
- **support:** record the Angular 20 and 21 runs ([08f77f1](https://github.com/rathkit/rte/commit/08f77f1))

### Tests

- **core:** keep long runs of one character fast in four places ([33b3e5b](https://github.com/rathkit/rte/commit/33b3e5b))
- **core:** fix test typing so typecheck passes again ([0f33477](https://github.com/rathkit/rte/commit/0f33477))

### Continuous integration

- run the release dry run on every change ([545130d](https://github.com/rathkit/rte/commit/545130d))

### ⚠️  Breaking Changes

- rename the rk- prefix to rte-  ([9c46bed](https://github.com/rathkit/rte/commit/9c46bed))
- name custom element classes with an Element suffix  ([457f9fc](https://github.com/rathkit/rte/commit/457f9fc))
- export each name from one entry point only  ([fffac2a](https://github.com/rathkit/rte/commit/fffac2a))

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
