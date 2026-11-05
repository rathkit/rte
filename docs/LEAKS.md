# Leaks

An editor that is destroyed gives everything back: its listeners, observers, timers, elements and memory. This is checked by making and destroying editors thousands of times and requiring that nothing is left. The checks run in CI in Chromium, Firefox and WebKit (`tools/leak`, the `browsers` job), and for each framework wrapper in the framework checks.

## What is checked

The rule: **after many editors have been made and destroyed, the page has the same counts as after a few.** The counts, taken by a probe that is given to the page before its own scripts run (`tools/leak/probe.mjs`), are the same in every engine, which is why they are the main check:

1. **Event listeners on the long-lived targets** (`window`, `document`, `<html>`, `<body>`, `<head>`). A listener on an element that is removed dies with it; one on the window outlives the editor and keeps it alive.
2. **Observers** (`MutationObserver`, `ResizeObserver`, `IntersectionObserver`) that still watch something on the page.
3. **Timers**: pending `setTimeout`, `setInterval`, animation frames and idle callbacks, after a 400 ms wait for the ordinary ones to run out.
4. **Elements** in the document, and style sheets.

Chromium also gets two checks the other engines cannot give, because only it can force a collection and read the heap:

5. **The heap**: after 3,000 editors made and destroyed, the heap (after two forced collections) is under 1 MB larger than after the first 200. A leak of one editor's size would be hundreds of megabytes.
6. **Collection**: 50 destroyed editors are held only by weak references; after a collection none is alive.

## What is made and destroyed

| Kind | What each cycle does | Cycles (full run) |
| --- | --- | --- |
| core | The standard editor with every plugin (lists, tables, find, autoformat, footnotes, word, SVG, images, and Markdown), loaded with a table, an image, a note and nested lists; then typing, Enter, pasting text and HTML, undo, redo, select all and a shortcut; then `destroy()` | 3,000 |
| ui | The same, with the standard interface, the selection toolbar and the context menu; a right click, the find shortcut, the toolbar shortcut, hover and focus on every button, an announcement; then `destroy()` of the interface and the editor | 400 each in three engines |
| element | `<rte-ui>` around `<rte-editor>`, added to the page, used, and removed | 400 |
| wrappers | Each of React (in StrictMode), Vue, Svelte, Angular (run-time compiled and ahead-of-time) and jQuery mounts and unmounts an editor through its own framework | 100 (Angular: 30) |

A deliberate leak (a window listener, an interval, an observer and an element, left behind on purpose) is made in every engine, to show that the probe sees each kind. Without that, a silent probe would look like a pass.

## What it found

The first run failed in every engine: **`Editor.destroy()` did not take away the plugins' page parts.** Plugins are added in the constructor, and the function that removes a plugin (and its page part, such as the table grips and the image handle) was dropped, so `destroy()` never called it. Each editor with the standard plugins left four listeners on the window (scroll and resize, for the grips and for the image handle) and was kept alive by them: about 50 KB of heap per editor, and none of 50 destroyed editors was collected. `destroy()` now removes every plugin that is still added, newest first. With the fix the counts are flat and the heap grows by about 0.1 KB per editor; without it, 18 of 18 wrapper checks and 11 of 17 page checks fail.

## Running it

```sh
pnpm build
RTE_PLAYWRIGHT=$PWD/tools/browser-checks/node_modules tools/leak/run.sh            # the full run, about two minutes
RTE_PLAYWRIGHT=$PWD/tools/browser-checks/node_modules tools/leak/run.sh --quick    # a tenth of the cycles
RTE_PLAYWRIGHT=... RTE_PACK=... tools/framework-checks/run.sh                      # the wrappers (the leak walk is at the end)
```

The page that makes the editors is `packages/rte-ui/demo/leak.html`. The wrapper checks are not part of CI: they need the frameworks installed and the bundler (`docs/SUPPORT.md`).

## Memory per undo step

The cost of one undo step is held by the benchmark budgets, not here: one step adds 0.4% of a 5,000-paragraph document, against a budget of 1% (`docs/MEASUREMENTS.md`, "Budgets").

## Not covered

Real memory pressure on a phone, a page left open for days, and a plugin written by someone else (a plugin that leaves a listener behind leaks, and the probe would show it if it were run with the editor; the host's own plugins can be added to `leak.html`).
