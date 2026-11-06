# Measurements

Numbers are here only because they were measured, and each says how. They are not compared with anything. They are one run on one machine; a run on another machine will differ, which is why the checks use limits with room (and CI doubles the speed limits, see below).

## Benchmark suite

The harness that produces the speed and memory figures is in its own repository, [rathkit/rte-bench](https://github.com/rathkit/rte-bench). It runs the built editor in Chromium inside a pinned container with no network, and its README has the method: how each figure is timed, the documents and scenarios, cold start, memory, the slow-device runs, the machine class recorded with every result, and how to reproduce a published figure. This repository keeps what the product owns: the limits (`tools/bench/budgets.json`), the approved increases (`tools/bench/accepted.json`), the sizes (`tools/size-baseline.json`), the page the harness drives (`tools/conformance`), and the figures below. The repository commit of the harness that gates a change is named in `tools/bench.ref`.

```sh
pnpm build
git clone https://github.com/rathkit/rte-bench ../rte-bench     # at the commit in tools/bench.ref
pnpm bench                  # the full method, in the container; add -- --out FILE or other options of rte-bench's run.mjs
pnpm bench:quick            # the reduced run CI makes
```

The container needs Docker or Podman (`CONTAINER=podman`). Limits are applied the same way in both: a figure over its budget in `tools/bench/budgets.json` fails the run, and CI runs the quick harness on a pinned runner image (`ubuntu-24.04`) with every budget widened three times (`--scale 3`). On a change it also runs the harness on the commit it builds on, on the same runner, and compares the two (see "Regression gates" below).

### Results

Full run of 2026-11-05 at commit `c71fe22`: developer laptop (Intel Core i7-11850H, 16 threads, 31 GB, Linux under WSL2), Node 26.12.0, Chromium 156.0.8078.4, Playwright 1.64.1, 30 runs per figure. Milliseconds, median / 95th percentile.

| | 1,000 paragraphs | 5,000 paragraphs | 10,000 paragraphs | 20,000 paragraphs |
| --- | --- | --- | --- | --- |
| Load a document | 19.9 / 26.8 | 96.3 / 197 | 197 / 362 | 421 / 750 |
| Type (middle) | 0.9 / 2.5 | 5.8 / 6.7 | 14.5 / 16.5 | 31.1 / 48.2 |
| Type (top · end) | 0.9 / 1.0 · 1.0 / 1.1 | 5.6 / 6.7 · 6.2 / 7.6 | 13.3 / 15.5 · 14.4 / 16.0 | 30.5 / 43.9 · 30.8 / 34.4 |
| Enter · join blocks | 1.0 / 1.6 · 1.0 / 1.2 | 5.7 / 7.8 · 5.8 / 7.1 | 13.5 / 15.6 · 14.0 / 15.9 | 29.2 / 34.1 · 30.5 / 33.1 |
| Paste text (3 paragraphs) | 1.1 / 1.3 | 5.8 / 7.2 | 15.3 / 18.0 | 30.8 / 34.0 |
| Paste HTML (100 paragraphs) | 4.6 / 7.1 | 10.9 / 14.5 | 19.7 / 24.1 | 36.7 / 209 |
| Undo · redo one step | 0.8 / 1.0 · 0.8 / 0.9 | 4.8 / 6.2 · 4.7 / 5.9 | 10.2 / 12.0 · 10.1 / 11.3 | 23.8 / 26.0 · 23.7 / 27.9 |
| Undo, 200 steps of history | 0.9 / 1.0 | 4.1 / 5.0 | 11.7 / 13.7 | 27.5 / 30.7 |

| | 500 cells | 5,000 cells | 20,000 cells |
| --- | --- | --- | --- |
| Load a table | 18.1 / 200 | 200 / 214 | 669 / 1359 |
| Type in one cell | 5.1 / 6.1 | 9.2 / 9.9 | 27.1 / 28.6 |
| Other cells redrawn | 0 | 0 | 0 |

CPU 4x slower: typing in the middle of 1,000 / 5,000 paragraphs 4.1 / 8.3 and 23.9 / 27.4; loading them 85.4 / 128 and 411 / 564; typing in a cell of 500 / 5,000 cells 24.5 / 26.9 and 32.2 / 46.3.

Cold start: ready 85.0 ms (median of 10 runs from a new context), first load of 1,000 paragraphs 24.6 ms, 383 KB of JavaScript fetched (uncompressed, for the conformance page, which has the core and the browser view).

Memory: empty page 1.72 MB; a document adds 1.49 MB (1,000 paragraphs), 5.78 MB (5,000), 10.3 MB (10,000) and 22.0 MB (20,000); one undo step adds 0.02 MB, 0.40% of the 5,000-paragraph document.

What these say: through 5,000 paragraphs every command is inside a frame (16 ms) on this machine, and at 10,000 inside two. At 20,000 paragraphs a keystroke takes about 30 ms, over a frame, and a document that long is better split. Tables are the same: 5,000 cells type within a frame, 20,000 do not. This run does not say how much of that time is the editor and how much is the browser laying out the page.

## Budgets

The numbers the project holds itself to. Bytes are in each package's `package.json` (`rathkit.budgets`, checked by `pnpm check:size` on every change); everything that is measured at run time is in `tools/bench/budgets.json` (checked by `pnpm bench` on the machine class below, and by CI with the widening above). A budget is set from the baseline run, with room for the noise between runs on the same machine (about 1.3 to 2 times the slowest figure seen), and is a promise for the reference machine class: Intel Core i7-11850H, 16 threads, 31 GB, Linux, Chromium 156. `tools/bench/limits.test.mjs` checks that both files are well formed; rte-bench checks that every budget names a figure the harness produces.

| What | Budget | Baseline |
| --- | --- | --- |
| A keystroke, Enter, join, paste of text, undo or redo (p95), 1,000 paragraphs | 5 ms | 1.0 to 2.0 ms |
| The same, 5,000 paragraphs: inside one frame | 16 ms | 4.5 to 10 ms |
| The same, 10,000 paragraphs: inside two frames | 24 ms | 12 to 16 ms |
| Paste of 100 paragraphs of HTML (p95), 1,000 / 5,000 / 10,000 paragraphs | 15 / 25 / 35 ms | 8 / 13 / 20 ms |
| Load a document (p95), 1,000 / 5,000 / 10,000 paragraphs | 40 / 250 / 500 ms | 29 / 150 / 344 ms |
| The same with the CPU 4x slower: commands at 1,000 / 5,000 paragraphs (p95) | 30 / 100 ms | 17 / 36 ms |
| Typing in a table cell (p95), 500 / 5,000 cells; other cells redrawn | 12 / 16 ms; none | 4.1 / 9.8 ms; none |
| Load a table (median), 500 / 5,000 cells | 50 / 300 ms | 15 / 215 ms |
| Cold start to ready (median) / first load of 1,000 paragraphs (median) | 250 / 60 ms | 83 / 26 ms |
| JavaScript fetched by the conformance page | 450 KB | 393 KB |
| Memory: one undo step, as a share of the document | 1% | 0.40% |
| Memory: a 5,000 / 10,000-paragraph document | 8 / 14 MB | 5.8 / 10.2 MB |

Not budgeted, only reported: documents of 20,000 paragraphs and tables of 20,000 cells (a keystroke takes about 30 ms in either).

**Size.** Gzipped, each file on its own (see "Size" below for the method). The budgets from the first release stand: they hold today, and what to change is the next feature's to say, not this item's.

| Entry point | gzipped | budget | left |
| --- | --- | --- | --- |
| `@rathkit/rte-core/dom` (core + browser view) | 58.8 KB | 60 KB | 1.2 KB |
| `@rathkit/rte-core` (core) | 47.4 KB | 60 KB | 12.6 KB |
| `@rathkit/rte-core/markdown` | 14.8 KB | 15 KB | 0.2 KB |
| `@rathkit/rte-core/tables` | 12.8 KB | 15 KB | 2.2 KB |
| `@rathkit/rte-core/lists` | 9.2 KB | 15 KB | 5.8 KB |
| `@rathkit/rte-ui` / with default icons / the element | 13.2 / 13.2 / 13.9 KB | 25 / 30 / 30 KB | 11.8 / 16.8 / 16.1 KB |
| `@rathkit/rte-headless` | 7.4 KB | 12 KB | 4.6 KB |
| `@rathkit/rte-element` | 3.3 KB | 4 KB | 0.7 KB |
| The other plugins (`autoformat`, `footnotes`, `find`, `word`, `svg`, `images`) | 1.9 to 5.7 KB | 15 KB each | 9.3 KB or more |
| The framework wrappers (`react`, `vue`, `svelte`, `angular`, `jquery`) | 0.7 to 1.6 KB | 2 KB each | 0.4 KB or more |

Recommendation, for the owner: keep every byte budget as it is. Three have little room and will be the first to need a decision: the core with the browser view (1.2 KB, and Embeds is estimated at about 1 KB), the Markdown plugin (0.2 KB) and the element (0.7 KB). Raising a budget is a change to its `package.json` in the same commit as the code that needs it, with the reason in the message. The numbers outside this repository that the targets were weighed against are not published here, by design: this page publishes only our own numbers and methods.

### Regression gates

A budget is a ceiling with room under it, so it cannot see a change that makes something twice as slow, or 800 bytes larger, while staying under it. Three gates compare a change with what it builds on:

- **Size.** `pnpm check:size` holds every entry point to the size recorded in `tools/size-baseline.json` plus a margin: the larger of 1% and 128 bytes. Growth beyond that fails with the old size, the new size and the way out. It also fails for an entry that has no recorded size, or that is recorded but no longer measured.
- **Speed and memory.** The `bench` job in CI builds the commit the change is based on (the base of a pull request, or the commit before a push), measures it with the same harness (rte-bench, at the commit in `tools/bench.ref`) on the same runner, measures this commit, and compares the two (`compare.mjs` in rte-bench, with `tools/bench/accepted.json`). Each side runs twice and the lower figure counts, so one noisy run does not fail a change. A timing (median) fails when it is both 1.5 times the base and more than 2 ms slower; the second condition keeps a 0.9 ms figure that reads 1.4 ms from being called a regression. Memory and fetched JavaScript fail at 1.1 times and 300 KB more (the first document measured after an empty page varies by about 190 KB between two builds of the same code, from one-time work the browser does, which a CI run showed; a leak or a bigger structure per paragraph is far above that at 5,000 paragraphs). Both sides are measured in the same job, so the difference is not the runner's.
- **Leaks.** `tools/leak` has no baseline: nothing may be left behind, so any growth fails (see `docs/LEAKS.md`).

**Recording an approved increase.** For size, run `pnpm check:size --record "why"` in the same commit as the code that grows it; the new size, the old size, the date and the reason are appended to `history` in `tools/size-baseline.json`, and the pull request shows the diff to the owner, who reviews every change (`CODEOWNERS`). For speed and memory, add the figure to `tools/bench/accepted.json` with the ratio that is allowed and the reason, in the same commit; remove it when the cost is paid back. Raising a budget in a `package.json` or `tools/bench/budgets.json` is the same kind of change and is reviewed the same way. Nothing raises a limit without an edit to one of these files.

**Shown to fail.** A deliberate 3 KB addition to the core's built file fails the size gate (`grew from 48571 to 51690 bytes (+3119), over the margin of 486 bytes`). A 6 ms delay in the editor's input handler fails the comparison for 17 figures (typing 1.0 ms became 7.1 ms with 1,000 paragraphs), where the budgets alone would have passed it: 7 ms is under the CI ceiling of 15 ms. Both are covered by tests (`tools/size-baseline.test.mjs` here, `compare.test.mjs` in rte-bench).

## Size

`pnpm check:size` gzips the built JavaScript of each entry point (level 9) and compares it with the budget in the package's `package.json`. Without a minifier it gzips each file on its own and adds them up, which is an upper bound; that is what CI checks and what is quoted here. Comments are not in the shipped JavaScript. Date: 2026-10-24.

| Entry point | gzipped | budget |
| --- | --- | --- |
| `@rathkit/rte-core` (document model, import and export, commands, plugin host) | 43.8 KB | 60 KB |
| `@rathkit/rte-core/dom` (core + browser view) | 54.0 KB | 60 KB |
| `@rathkit/rte-core/lists` | 9.1 KB | 15 KB |
| `@rathkit/rte-core/tables` | 12.8 KB | 15 KB |
| `@rathkit/rte-core/autoformat` | 1.7 KB | 15 KB |
| `@rathkit/rte-core/markdown` | 14.7 KB | 15 KB |
| `@rathkit/rte-core/footnotes` | 3.8 KB | 15 KB |
| `@rathkit/rte-core/find` | 2.4 KB | 15 KB |
| `@rathkit/rte-core/word` | 1.9 KB | 15 KB |
| `@rathkit/rte-core/svg` | 3.7 KB | 15 KB |
| `@rathkit/rte-core/images` | 5.6 KB | 15 KB |
| `@rathkit/rte-headless` | 7.4 KB | 12 KB |
| `@rathkit/rte-element` | 2.8 KB | 4 KB |
| `@rathkit/rte-ui` (without icons) | 9.7 KB | 25 KB |
| `@rathkit/rte-icons` (all) | 2.1 KB | 6 KB |
| `@rathkit/rte-react`, `-vue`, `-svelte`, `-jquery` | 1.0, 1.1, 0.6, 0.7 KB | 2 KB each |
| `@rathkit/rte-angular` (with and without the forms entry) | 1.4, 1.5 KB | 2 KB each |

The stylesheet is separate (`@rathkit/rte-ui/base.css`). A bundler that removes unused code will ship less than the sum, because plugins and icons are separate entry points. Minified figures are not published yet: the minifier used for them is not released.

## Speed (the browser checks)

`tools/browser-checks` (the "speed" section) drives the built editor in Chromium. Each figure is the 95th percentile of 20 runs of one command, measured from the call to the page having its layout (`getBoundingClientRect` is read after each), in milliseconds. "CPU 4x slower" uses Chromium's CPU throttling, which is a stand-in for a slow device, not a measurement of one. Documents are made of paragraphs with bold, italic and a link (about 90 characters each); the table has 500 cells with bold and italic text.

Run of 2026-10-24 (Linux under WSL2, Intel Core i7-11850H, 16 threads, 31 GB, Chromium 156.0.8078.4, Playwright 1.64.1):

| | 1,000 paragraphs | 5,000 paragraphs | 500-cell table |
| --- | --- | --- | --- |
| Load a document (warm / cold) | 19.6 / 29.0 | 100.8 / 81.5 | 29.3 |
| Type a character (middle of the document) | 1.7 | 20.1 | 7.1 (in one cell) |
| Type at the top | 0.9 | 5.5 | |
| Enter / join blocks / paste | 1.4 / 1.4 / 1.1 | 5.7 / 8.7 / 5.4 | |
| Same, CPU 4x slower: type / Enter | 5.6 / 5.4 | 24.8 / 27.3 | 19.6 |
| Move the caret with 56 commands subscribed | | 1.4 (12.9 at 4x) | |

Large tables, same machine and method, run of 2026-10-27 (typing in one cell; other cells redrawn: none):

| | 500 cells | 5,000 cells (100 by 50) | 20,000 cells (200 by 100) |
| --- | --- | --- | --- |
| Load a document | 55.6 | 174.7 | 904.0 |
| Type a character in one cell | 7.6 | 9.0 | 24.1 |
| Same, CPU 4x slower: load / type | 209.5 / 17.8 | 838.3 / 40.4 | 2512.5 / 176.4 |

The editor's own work for a keystroke in the 20,000-cell table is 0.04 ms (measured without a page); the rest is the browser laying out the table, which grows with the number of cells. A table of that size is slow to load and to type in on a slow device, and it is not something to build a form on; 5,000 cells types within a frame. The check enforces that typing redraws that one cell and no other, at 5,000 and 20,000 cells.

Typing in the middle of 5,000 paragraphs was 5 to 7 ms in earlier runs on this machine and 20 ms in this one, so single readings of that cell should not be trusted; the limit in the check is 30 ms.

The limits the checks enforce (the speed section fails above them): 10 ms per command at 1,000 paragraphs and 30 ms at 5,000 (p95), loading 1,000 paragraphs within 40 ms, a caret move within 30 ms, typing in a 500-cell table within 12 ms. CI runs on shared machines and multiplies all of them by 2.

## Memory

One undo step in a 5,000-paragraph document (6.2 MB of heap) adds 22.9 KB, 0.37% of the document. The check fails above 1%. Measured with Chromium's heap usage after a forced garbage collection, before and after 100 line breaks.
