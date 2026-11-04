# Measurements

Numbers are here only because they were measured, and each says how. They are not compared with anything. They are one run on one machine; a run on another machine will differ, which is why the checks use limits with room (and CI doubles the speed limits, see below).

## Benchmark suite

`tools/bench` is the harness that produces speed and memory figures. It reports numbers; the browser checks below (the "Speed" section) are the separate pass or fail budgets. Anyone can reproduce a run from the repository.

```sh
pnpm build
pnpm --dir tools/browser-checks install --frozen-lockfile --ignore-scripts      # the browser driver, which is not a dependency of the workspace
node tools/browser-checks/node_modules/playwright/cli.js install chromium
RTE_PLAYWRIGHT=$PWD/tools/browser-checks/node_modules pnpm bench -- --out results.json --class "what this machine is"
```

`pnpm bench:quick` is the reduced run CI makes. Both start the conformance page on `127.0.0.1` with the network switched off (as the browser checks do), drive it in Chromium, print tables and, with `--out`, write a JSON file with every figure and the machine it came from.

### Method

- **Each figure is a series of runs** (30 in a full run, 8 in a quick one), reported as the median and the 95th percentile, in milliseconds. A command is timed from the call to the page having its layout (`getBoundingClientRect` is read after it), the same as the speed checks. Commands go through the editor's own entry points (`beforeinput` events, `paste`, `undo`), not through synthesized keystrokes, so the figure is the editor's work plus the browser's layout, without the browser's input pipeline.
- **Documents.** Paragraphs of about 90 characters with bold, italic and a link, at 1,000, 5,000 and 20,000 of them. Tables of 500, 5,000 and 20,000 cells, each cell with bold and italic text.
- **Scenarios.** Load (`setHtml`, warm); typing in the middle, at the top and at the end; Enter; joining blocks; pasting plain text (three paragraphs) and HTML (a hundred paragraphs); undo and redo of one step; undo with a history of 200 steps behind it; typing in a table cell, with a count of the other cells that were redrawn (it must be none).
- **Cold start.** A new browser context for each run, so nothing is cached: from navigation to the editor being ready, then the first load of 1,000 paragraphs (which pays for compiling the code), and the JavaScript the page fetched (uncompressed).
- **Memory.** The heap in use after a forced collection: an empty page, then with each size of document, then with 100 undo steps added. No other measurement runs at the same time.
- **Slow device.** The full run repeats the paragraph and table scenarios with the CPU throttled four times (`@4x`). That is Chromium's throttling, a stand-in for a slow device and not a measurement of one.
- **Machine class.** Every run records the CPU, threads, memory, operating system, Node, Chromium and Playwright versions and the commit, and the `--class` you give it. A figure is only comparable with another from the same class.
- **Alarms.** The harness exits with an error if a figure is above its alarm: about five times what the full run below found. That catches a mistake that makes something several times slower, and does not depend on the machine. CI runs the quick harness on a pinned runner image (`ubuntu-24.04`) and uploads the JSON as an artifact; it does not compare runs.

### Results

Full run of 2026-11-04 at commit `3a2f412`: developer laptop (Intel Core i7-11850H, 16 threads, 31 GB, Linux under WSL2), Node 26.12.0, Chromium 156.0.8078.4, Playwright 1.64.1, 30 runs per figure. Milliseconds, median / 95th percentile.

| | 1,000 paragraphs | 5,000 paragraphs | 20,000 paragraphs |
| --- | --- | --- | --- |
| Load a document | 20.5 / 27.8 | 95.3 / 139 | 442 / 672 |
| Type (middle) | 0.9 / 1.8 | 6.3 / 7.0 | 29.2 / 40.5 |
| Type (top / end) | 0.9 / 1.0 · 1.0 / 1.1 | 5.6 / 6.8 · 5.7 / 6.7 | 26.7 / 28.6 · 32.5 / 39.0 |
| Enter / join blocks | 0.9 / 1.6 · 1.0 / 1.4 | 6.0 / 9.9 · 6.4 / 10.2 | 28.9 / 33.6 · 29.2 / 33.9 |
| Paste text (3 paragraphs) | 1.1 / 1.5 | 9.2 / 10.9 | 31.1 / 96.7 |
| Paste HTML (100 paragraphs) | 4.4 / 7.0 | 11.4 / 14.8 | 34.6 / 38.7 |
| Undo / redo one step | 0.9 / 1.0 · 0.8 / 0.9 | 3.9 / 4.6 · 3.9 / 4.4 | 24.1 / 37.2 · 23.3 / 36.8 |
| Undo, 200 steps of history | 1.7 / 1.8 | 4.0 / 4.4 | 25.2 / 27.9 |

| | 500 cells | 5,000 cells | 20,000 cells |
| --- | --- | --- | --- |
| Load a table | 15.0 / 80.2 | 196 / 239 | 851 / 926 |
| Type in one cell | 5.2 / 6.1 | 8.8 / 10.1 | 34.8 / 41.8 |
| Other cells redrawn | 0 | 0 | 0 |

CPU 4x slower: typing in the middle of 1,000 / 5,000 paragraphs 6.0 / 10.0 and 23.2 / 38.4; loading them 95.0 / 131 and 419 / 485; typing in a cell of 500 / 5,000 cells 23.7 / 27.8 and 29.1 / 32.0.

Cold start: ready 82.4 ms (median of 10 runs from a new context), first load of 1,000 paragraphs 25.5 ms, 383 KB of JavaScript fetched (uncompressed, for the conformance page, which has the core and the browser view).

Memory: empty page 1.72 MB; a document adds 1.49 MB (1,000 paragraphs), 5.80 MB (5,000) and 22.9 MB (20,000); one undo step adds 0.02 MB, 0.40% of the 5,000-paragraph document.

What these say: through 5,000 paragraphs every command is inside a frame (16 ms) on this machine. At 20,000 paragraphs a keystroke takes about 30 ms, over a frame, and a document that long is better split. Tables are the same: 5,000 cells type within a frame, 20,000 do not. This run does not say how much of that time is the editor and how much is the browser laying out the page.

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
