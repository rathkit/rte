# Measurements

Numbers are here only because they were measured, and each says how. They are not compared with anything. They are one run on one machine; a run on another machine will differ, which is why the checks use limits with room (and CI doubles the speed limits, see below).

## Size

`pnpm check:size` gzips the built JavaScript of each entry point (level 9) and compares it with the budget in the package's `package.json`. Without a minifier it gzips each file on its own and adds them up, which is an upper bound; that is what CI checks and what is quoted here. Comments are not in the shipped JavaScript. Date: 2026-10-24.

| Entry point | gzipped | budget |
| --- | --- | --- |
| `@rathkit/rte-core` (document model, import and export, commands, plugin host) | 37.1 KB | 60 KB |
| `@rathkit/rte-core/dom` (core + browser view) | 46.9 KB | 60 KB |
| `@rathkit/rte-core/lists` | 7.1 KB | 15 KB |
| `@rathkit/rte-core/tables` | 5.5 KB | 15 KB |
| `@rathkit/rte-core/find` | 2.4 KB | 15 KB |
| `@rathkit/rte-core/word` | 1.9 KB | 15 KB |
| `@rathkit/rte-core/svg` | 3.7 KB | 15 KB |
| `@rathkit/rte-core/images` | 2.9 KB | 15 KB |
| `@rathkit/rte-headless` | 7.4 KB | 12 KB |
| `@rathkit/rte-element` | 2.6 KB | 4 KB |
| `@rathkit/rte-ui` (without icons) | 9.5 KB | 25 KB |
| `@rathkit/rte-icons` (all) | 2.0 KB | 6 KB |
| `@rathkit/rte-react`, `-vue`, `-svelte`, `-jquery` | 1.0, 1.1, 0.6, 0.7 KB | 2 KB each |

The stylesheet is separate (`@rathkit/rte-ui/base.css`). A bundler that removes unused code will ship less than the sum, because plugins and icons are separate entry points. Minified figures are not published yet: the minifier used for them is not released.

## Speed

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

Typing in the middle of 5,000 paragraphs was 5 to 7 ms in earlier runs on this machine and 20 ms in this one, so single readings of that cell should not be trusted; the limit in the check is 30 ms.

The limits the checks enforce (the speed section fails above them): 10 ms per command at 1,000 paragraphs and 30 ms at 5,000 (p95), loading 1,000 paragraphs within 40 ms, a caret move within 30 ms, typing in a 500-cell table within 12 ms. CI runs on shared machines and multiplies all of them by 2.

## Memory

One undo step in a 5,000-paragraph document (6.2 MB of heap) adds 22.9 KB, 0.37% of the document. The check fails above 1%. Measured with Chromium's heap usage after a forced garbage collection, before and after 100 line breaks.
