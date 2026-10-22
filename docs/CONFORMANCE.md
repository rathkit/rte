# Conformance

The editor is checked against requirement suites kept outside this repo. A suite drives an editor page
through a small contract, `window.__conf`, and compares what comes out by meaning. The page for this
editor is `packages/rte-core/conformance/index.html`. It uses only the editor's public API.

## Running a suite

The suites and their runner live in a separate, read-only folder. Point two variables at it and at a
Playwright install, then run:

    RTE_CONFORMANCE_DIR=<folder that holds conformance/run-conformance.js> \
    RTE_PLAYWRIGHT=<node_modules folder that contains playwright> \
    pnpm build && tools/conformance/run.sh 'conformance/suites/import-sources/scenarios/*.json' \
      conformance/suites/import-sources/expected [--browser firefox|webkit]

`tools/conformance/run.sh` starts a small local server (`tools/conformance/serve.mjs`) and runs the suite
in a private network namespace that has only a loopback interface, so a pasted fixture cannot make the
browser fetch anything from the internet. Playwright is not a dependency of this repo.

## Results (2026-10-22)

| Suite | Scenarios | Passing, each engine |
| --- | --- | --- |
| Word-processor paste | 16 | 16 on Chromium, Firefox and WebKit |
| Paste from other sources | 134 | 104 on Chromium, Firefox and WebKit |

A plain contenteditable page with the browser's own editing passes 33 of the 134.

The 30 scenarios that do not pass are all spreadsheet range pastes from two sources that put cell
formatting in a `<style>` block of numbered classes (a desktop spreadsheet application and one
browser-based spreadsheet). Reading those classes is part of the paid paste pack (see `PASTE.md`),
so the free editor is not expected to pass them. They are:

- every `src-sheet-*-desktopsheet-*` scenario for the range and hidden-row cases (15 or 18 per platform set)
- the `src-sheet-*-websheet-a-*` range and hidden-row scenarios on Chromium and Firefox

The free target is therefore the 104 other scenarios, and all of them pass. The word-processor
recognizers listed in `PASTE.md` are free (owner decision, 2026-10-22), and 16 of the 104 depend on them.

## Notes for the next slice

- Only the paste contract is exercised so far. Keyboard, selection, undo and the other areas will add
  their own suites.
- The editor draws the whole document again after every edit. That is fine for the paste suites and
  too slow for large documents; incremental drawing is on the list before the performance budget is tested.

## Browser checks

`tools/browser-checks/run.sh` drives the real editor with real events in Chromium, Firefox and WebKit, in the
same network-less namespace. It needs `RTE_PLAYWRIGHT` (a `node_modules` folder with Playwright) and a built
editor. It covers typing, Enter, Backspace, word deletion, bold and undo, copy, cut and paste with the real keys,
the system clipboard, dragging text, dropping image files, input the editor does not handle, an
input-method composition in Chromium, every scrubbed capture in `fixtures/paste` (nothing may make a request
outside the machine), and speed. 66 checks pass.

Speed on the machine it was written on, Chromium, paragraphs of about ninety characters with three marks each:

| Paragraphs | Set content | One keystroke | Budget |
| --- | --- | --- | --- |
| 1,000 | 22 ms | 0.8 ms | set 40 ms, one command 10 ms |
| 5,000 | 155 ms | 4 ms | one command 30 ms |

Unchanged blocks are kept between edits, so a keystroke costs the changed paragraph, not the document.

## Known gaps in the editing view

- A real input method on a real operating system (macOS, Windows) has not been tried. Composition is tested
  only in Chromium through the debugging protocol, which simulates it. The caret and text land correctly there.
- Spelling-correction replacement is handled (the word the browser targets is replaced, not the word at the
  caret) but has not been tried with a real spell checker.
- Some input types are blocked and reported through `onUnhandledInput`: justification, indent, transpose,
  yank and the like. They wait for the commands behind them.
- WebKit rewrites copied HTML and turns some spaces next to inline tags into non-breaking spaces. The editor
  keeps them as written, so text pasted in WebKit can carry `&nbsp;` where Chromium has a plain space.
- A table is drawn again as a whole when any cell changes. Large tables have not been measured.
- Touch input, mobile keyboards and screen readers are untested.
- Remote images (`http`, `https`) are kept in the document but not drawn unless the host passes
  `loadRemoteImages: true`, so pasting never makes the browser fetch anything. `Editor.remoteImages()` lists them.
- Firefox cannot attach data to a script-made paste event, so that path is covered there only by the system
  clipboard and the direct `paste()` call, both of which pass.
