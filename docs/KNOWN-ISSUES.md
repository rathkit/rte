# Known issues

What does not work, what has not been tried, and what may change, for the beta on npm. It was written for the first people to try RTE. It lists the faults and the gaps we know of; it cannot list the ones we do not. Anything you find that is not here belongs in an [issue](https://github.com/rathkit/rte/issues/new/choose) with the bug template.

Each section says where the detail lives. Where the result of a check is stated, it comes from the page named, and the page says when and how it was run.

## What may change between betas

While the version starts with 0, any release may change options, events, output (the exact HTML written for an edge case), message ids and the plugin API (`docs/ROADMAP.md`, `docs/RELEASING.md`). A beta goes to the `next` tag only (`npm install @rathkit/rte-core@next`). Every release's notes in `CHANGELOG.md` list what could break an upgrade. Nothing is frozen until the release candidate, and the policy that says what will be frozen is not written yet ([#67](https://github.com/rathkit/rte/issues/67)).

## Not tested on a real device or program

- **Input methods (IME).** Composition is tested only in Chromium, through the debugging protocol, which simulates it. A real input method (Japanese, Chinese, Korean, or a phone keyboard's composing text) on a real operating system has not been tried, except the phone keyboard's autocorrect, which was tried on one Android phone (`docs/CONFORMANCE.md`, `docs/SUPPORT.md`). [#17](https://github.com/rathkit/rte/issues/17).
- **Screen readers.** The interface follows the roles and names the checks can read, and `docs/ACCESSIBILITY.md` lists what an automated audit can and cannot say. No screen reader (NVDA, JAWS, VoiceOver, TalkBack) has been used with the editor. There is no accessibility conformance claim. [#18](https://github.com/rathkit/rte/issues/18), [#71](https://github.com/rathkit/rte/issues/71).
- **iOS Safari, iPadOS, and a tablet with a keyboard.** Not run. Android was tried by hand on one phone in Chrome and Firefox (`docs/SUPPORT.md`, "Touch and phones"). [#83](https://github.com/rathkit/rte/issues/83).
- **macOS and Windows.** The browser checks run on Linux. The WebKit build used is not Safari, and the Chromium build is not Chrome or Edge (`docs/SUPPORT.md`).
- **The framework wrappers (React, Vue, Svelte, Angular, jQuery).** Their checks (723 in three engines, with the versions in the compatibility matrix) passed in a local run on 2026-11-18. They are not in CI, and they run against the workspace build, bundled with the Pack beta, not against the packages installed from npm, so a wrapper page's example is checked as written but not from a registry install.

## Accessibility gaps

The audit in `docs/ACCESSIBILITY.md` found and fixed seven faults. It leaves three limits and seven things it cannot judge:

- the checkbox in the link dialog and the arrow of the block-type list are drawn by the browser, and their contrast is not measured;
- on a light theme a find match stands out from plain text by hue more than by lightness;
- the high-contrast setting of the system (`prefers-contrast: more`) changes nothing by itself; the high-contrast theme is the host's choice (forced colors is followed);
- real browser zoom and font-size settings, real Windows High Contrast, text spacing, the context menu key in Firefox and WebKit, and the products themselves (Safari, Chrome, Edge) are not checked.

## Right-to-left

The interface mirrors in a right-to-left language (toolbar order and arrow keys, tooltips, menus, the context menu), checked in Chromium, Firefox and WebKit with an Arabic test pack. The selection toolbar and the find bar were not checked in right-to-left. Key names such as `Ctrl+B` are not translated. The two packs in the repository are test fixtures, not translations: no language ships.

## Paste

- Fidelity is tested with 80 real captures and 84 hand-reconstructed approximations of word processors, online editors, spreadsheets, mail and web pages (`docs/PASTE.md`). The reconstructions show structure, not what a particular product writes. More real captures are wanted ([#24](https://github.com/rathkit/rte/issues/24)).
- Pasted spreadsheet styling (fills, number formats, typed values) and headings inferred from looks are not in the free tier (`docs/PASTE.md`).
- Seen and not fixed: word-processor comment text pastes as body text between rules; word-processor footnotes paste as `[1]` links that point nowhere; a lazy-load placeholder picture on a web page pastes as a blank picture; a heading's `#` permalink stays inside the heading; task-list items keep a `list-style-type: none` style; table captions are dropped.
- Android removes formatting from the clipboard before any page sees it, so formatted paste on a phone gives plain text (`docs/SUPPORT.md`).
- `docs/CLIPBOARD.md`, "Known gaps": a clipboard with only `text/markdown` is ignored; text wins over files; an image pasted into a code block is dropped without a message; an image on the clipboard is not checked in Firefox and in the older WebKit; a drag between two editors copies instead of moving.
- WebKit writes some spaces next to inline tags as non-breaking spaces, and the editor keeps them (`docs/CONFORMANCE.md`).

## Editing

- With a caret, a mark command (bold, italic) chooses the mark for the next typed text, but not for text typed through an input method or pasted (`docs/CONFORMANCE.md`).
- Lists with several blocks in one item, and numbering styles beyond what import reads, are not built (`docs/LISTS.md`). Tables are measured up to 20,000 cells (`docs/MEASUREMENTS.md`); beyond that is not measured.
- Remote images are kept but not drawn unless the host passes `loadRemoteImages: true`, so that pasting never makes the browser fetch anything.
- Undo and redo are tested, including a phone keyboard's autocorrect (one step) and typing runs (`docs/HISTORY.md`); a very long session (hours) has not been soaked ([#73](https://github.com/rathkit/rte/issues/73)).

## Security and checking

- The sanitizer and the model have unit tests, browser checks and a leak check, but no fuzzing in CI ([#69](https://github.com/rathkit/rte/issues/69)), no property tests ([#70](https://github.com/rathkit/rte/issues/70)) and no independent review ([#68](https://github.com/rathkit/rte/issues/68)). Report a suspected vulnerability privately (the organization's security policy, linked from the issue chooser).
- Packages have no dependencies and nothing that runs on install, and every release can be verified (`docs/VERIFY.md`).

## Speed, size and memory

Figures are in `docs/MEASUREMENTS.md`, each with how it was taken, from the benchmark suite in [rte-bench](https://github.com/rathkit/rte-bench). They are measurements of one machine and one run, not promises.
