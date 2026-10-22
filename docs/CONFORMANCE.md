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

The free target is therefore the 104 other scenarios, and all of them pass. That count assumes the word-processor
recognizers listed in `PASTE.md` are free, which the owner has not confirmed; 16 of the 104 depend on them.

## Notes for the next slice

- Only the paste contract is exercised so far. Keyboard, selection, undo and the other areas will add
  their own suites.
- The editor draws the whole document again after every edit. That is fine for the paste suites and
  too slow for large documents; incremental drawing is on the list before the performance budget is tested.

## Known gaps in the editing view

- Input the view does not handle is blocked rather than left to the browser, which would edit the page
  behind the model. Dropping text or files onto the editor, spell-check replacements and similar actions do
  nothing yet. Word and line deletion, Enter, Backspace, Delete, typing, bold, italic, underline, undo and
  redo and paste do work.
- Input-method composition is reconciled after it ends by reading the text back from the page, with marks
  recovered from the markup. It has not been tested with a real input method.
- Remote images (`http`, `https`) are kept in the document but not drawn unless the host passes
  `loadRemoteImages: true`, so pasting never makes the browser fetch anything. `Editor.remoteImages()` lists them.
- The paste event path was exercised with a script-made event in Chromium and WebKit and with a real Ctrl+V in
  Chromium. Firefox cannot attach data to a script-made paste event, so only the direct `paste()` call is
  covered there.
