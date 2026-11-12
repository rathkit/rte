# What is tested

This page says what is checked, with which browsers, and what is not. It claims nothing beyond that.

## Browsers

Every browser check runs in all three engines of Playwright 1.64.1, headless, on Linux, and again with the engines of Playwright 1.63.0 ("Support window" below). The exact version of each engine, as the run reported it, is in the [compatibility matrix](#compatibility-matrix).

"Stands in for" is a statement about the engine, not about the product: the browser checks do not run Safari, Chrome or Edge themselves, and they do not run on macOS or Windows. The WebKit build on Linux is not Safari on macOS or iOS.

The packages are tested under Node 22.14.0 (the oldest that `engines` allows) and Node 26: every entry point that does not need a browser is imported with each of them from the packed tarballs, and the types are compiled as a user of the packages would.

## Support window

The policy: the current and the previous major version of Chrome, Edge and the other Chromium browsers, of Firefox and of Safari, and of the browsers on iOS and iPadOS (which all use WebKit) and on Android. A browser older than that is below the window.

How much of it is tested: the browser checks run twice in CI, on every pull request. The `browsers` job in CI uses the browsers of the Playwright release in `tools/browser-checks` (Playwright 1.64.1), and the `browsers-oldest` job runs the same checks with the browsers of the release before it (Playwright 1.63.0), pinned by its own lockfile in `tools/browser-checks/oldest`. The engine versions of both jobs, as each run reported them, are in the [compatibility matrix](#compatibility-matrix) below.

The older set is the floor that runs. When `tools/browser-checks` moves to a new Playwright release, `tools/browser-checks/oldest` moves to the release it replaces, and both columns change in the same pull request. Nothing checks by itself that the older column is at or below the previous major of each product on a given day: the owner confirms that when either pin moves. It was last confirmed on 2026-11-12 against the vendors' release pages: current stable Chrome 157, Firefox 159 and Safari 27, so the previous majors are 156, 158 and 26. The older column (Chromium 153, Firefox 155, WebKit 26.6) is at or below each previous major. The newer column (Chromium 156, Firefox 157, WebKit 27.2) is behind the current Chrome and Firefox because the Playwright browsers lag the products, so those two current versions are covered by the hand tests only until the pin moves. Both columns are Linux builds of the engines, not the products (see above). The phones are not in CI: Android was tested by hand (Chrome 156.0.8078.80 and Firefox 159.0.1 on 2026-11-10, "Touch and phones" below), and iOS and iPadOS have not been run.

Below the window nothing is promised: there is no reduced mode and no polyfill. What the editor does there is say so. When an editor is made it checks the platform features it calls with no fallback (`window.getSelection`, `InputEvent.prototype.getTargetRanges` for `beforeinput`, `MutationObserver`, `Element.prototype.replaceChildren`, `queueMicrotask`, `Array.prototype.at` and `Object.hasOwn`), and if any is missing it reports `unsupported-browser` to `onWarning` (by default, the console) with the names of the missing features ([`ERRORS.md`](ERRORS.md)). It still starts, because some of it may work, but nothing about how it behaves is promised. A page that wants a plain `<textarea>` or a message instead asks first:

```ts
import { missingFeatures } from "@rathkit/rte-core/dom";

if (missingFeatures().length > 0) showPlainTextarea();
else createEditor({ element });
```

`missingFeatures()` is safe to call on a server: in Node, with no DOM, it lists the browser features and does not throw. A browser check makes sure each engine in both columns lacks nothing, and that an editor made in a page with `getTargetRanges` taken away reports `unsupported-browser`, names it, and starts.

## Compatibility matrix

Which browsers, Node versions and frameworks, and the result of the last recorded run of each. The table is made by `tools/compat-matrix.mjs` from `docs/compat-matrix.json`, and that file is made only from the results files the checks leave behind, so nothing in it is typed by hand and a cell no run has filled says "not run".

How it is kept from drifting:

- The versions in it are the repository's own pins: both Playwright releases, the Node versions in `ci.yml` and `.node-version`, the framework versions in `tools/framework-checks` and the range each wrapper accepts. A tool test (`tools/compat-matrix.test.mjs`, in `pnpm test:tools`) fails when a pin changes and the matrix does not, and when this section is not exactly what the file renders to.
- Each CI run of the browser checks writes what each engine reported itself as and how its checks went (`RTE_RESULTS`), and `node tools/compat-matrix.mjs --check` fails the job when an engine is a version the matrix does not say. The check job does the same for the Node versions it ran. The results files are kept with the run as the artifacts `compat-browsers`, `compat-browsers-oldest` and `compat-node`.
- A check counts for the engine its name starts with; the speed and memory checks, which run in Chromium only, are counted apart (as `other` in the results file) and are not in the table.
- The counts are not compared, because they change whenever a check is added; each cell says the date and commit of the run its counts come from, and whether that run was in CI or local.

To record a CI run: `gh run download <run id> --pattern 'compat-*' --dir <folder>`, then `node tools/compat-matrix.mjs --record <folder>`, and commit the two files. A local run is recorded the same way from the files `RTE_RESULTS` names (with `RTE_COMMIT` set to the commit that ran); it says "a local run". The framework checks and the phones are not in CI, so their cells say "not run" until a run of `tools/framework-checks` with `RTE_RESULTS` is recorded (its counts are of the whole run, all five frameworks in three engines).

<!-- compat-matrix:start: made by tools/compat-matrix.mjs from docs/compat-matrix.json; do not edit by hand -->

| Engine | Version | Stands in for | CI job (Playwright) | Last recorded run |
| --- | --- | --- | --- | --- |
| Chromium | 156.0.8078.4 | Chrome, Edge and other Chromium browsers | `browsers` (1.64.1) | passed, 694 of 694 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| Firefox | 157.0 | Firefox | `browsers` (1.64.1) | passed, 673 of 673 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| WebKit | 27.2 | Safari (the Linux build is not Safari) | `browsers` (1.64.1) | passed, 686 of 686 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| Chromium | 153.0.8010.12 | Chrome, Edge and other Chromium browsers | `browsers-oldest` (1.63.0) | passed, 694 of 694 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| Firefox | 155.0 | Firefox | `browsers-oldest` (1.63.0) | passed, 673 of 673 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| WebKit | 26.6 | Safari (the Linux build is not Safari) | `browsers-oldest` (1.63.0) | passed, 680 of 680 ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |

| Device | Last recorded run |
| --- | --- |
| iOS and iPadOS | not run in CI |
| Android | not run in CI |

| Node | What runs | Last recorded run |
| --- | --- | --- |
| 22.14.0 | the oldest Node that `engines` allows: every entry point is imported from the packed packages (check:packages) | passed ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |
| 26 (26.13.1) | builds, tests and checks everything in the check job, and imports the packed packages | passed ([CI](https://github.com/rathkit/rte/actions/runs/43256430200), 2026-11-12, `b9d444d220e7`) |

| Framework | Wrapper | Versions the wrapper accepts | Version checked | Last recorded run |
| --- | --- | --- | --- | --- |
| React | `@rathkit/rte-react` | `>=18` | 19.3.1 | not run |
| Vue | `@rathkit/rte-vue` | `>=3.4` | 3.5.44 | not run |
| Svelte | `@rathkit/rte-svelte` | not stated | 5.57.2 | not run |
| Angular | `@rathkit/rte-angular` | `>=20.0.0` | 22.2.3 | not run |
| jQuery | `@rathkit/rte-jquery` | not stated | 4.0.0 | not run |

<!-- compat-matrix:end -->

### The file, for the site and anyone else

`docs/compat-matrix.json` in this repository (`https://raw.githubusercontent.com/rathkit/rte/main/docs/compat-matrix.json`) is the same data, for the site and anyone else who shows it. Schema version 1; a change that removes or renames a field raises `schemaVersion`.

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1` |
| `browsers[]` | One per CI job and engine: `job` (`browsers` or `browsers-oldest`), `engine` (`chromium`, `firefox`, `webkit`), `standsFor`, `playwright` (the pinned release), `version` (what the engine reported in the recorded run, or `null`), `result` |
| `devices[]` | `platform` (`iOS and iPadOS`, `Android`) and `result`; not in CI, so `not run` (hand tests are described in this page, not in the file) |
| `node[]` | `version` (exact, or a major when CI takes the newest of it), `role`, `ran` (the exact version of the recorded run, or `null`), `result` |
| `frameworks[]` | `name`, `package`, `wrapper`, `supports` (the wrapper's peer range, or `null` when it states none), `checked` (the version the framework checks pin), `result` |
| `result` | Either `{ "status": "not run" }`, or `{ "status": "passed" or "failed", "passed"?, "failed"?, "date", "commit", "source": "ci" or "local", "run" }`; `run` is the CI run's address, or `null` for a local run; the counts are there when the run counted checks |

## What the browser checks cover

About 2,000 checks per run, counted over the three engines, (`tools/browser-checks`): typing, Enter, Backspace and Delete, the system clipboard (copy, cut and paste of text and HTML), drag and drop of text, dropped and pasted images, input-method composition (Chromium only, through the debugging protocol, which simulates it), lists, tables, find and replace, the source view, the toolbar, menus, dialogs, tooltips, the custom element in a form, the styled interface in four themes with density and token changes, forced colors and reduced motion, a phone-sized viewport (touch in Chromium and WebKit, a narrow window in Firefox), and the speed and memory figures in `MEASUREMENTS.md`.

Paste conformance: 80 scrubbed clipboard captures from word processors and spreadsheets, and the office and mixed-source conformance suites, in the three engines.

## README examples

The example in each package's README is built exactly as written (bundled against the built packages and, for the wrapper packages, the real React, Vue, Svelte, Angular 22 and jQuery; Angular also as an ahead-of-time build with Angular's compiler and linker, templates type-checked against the wrapper) and run in all three engines: the editor appears with its name, typing is reported through the example's own callback, the Bold button works where the example has one, the interface gets its theme, and there is no error and no request for anything outside the page (`tools/framework-checks`, run locally with `RTE_PLAYWRIGHT` and `RTE_PACK` like the other framework checks).

## Touch and phones

`tools/browser-checks` runs the editor in a phone-sized window (390 by 844) with touch in Chromium and WebKit (Firefox has no touch emulation, so it runs the same window with a mouse): nothing scrolls sideways, every toolbar control is at least 24 px square and on the screen, menus, dialogs and the find bar fit, a tap leaves no tooltip, a tap on a table cell shows the width and height grips and a finger moves them (Chromium), a tap on an image shows its resize handle and a finger resizes it (Chromium), the window is turned to landscape and back with the selection kept and the selection toolbar inside the screen, and a touch long press is left to the browser. Making the rotation check found a fault: the selection toolbar was wider than a phone's editor and made the page scroll sideways by a few pixels; it now wraps onto a second row inside the editor. These are emulations in desktop engines: they do not run a soft keyboard, native selection handles, a real finger, or a real rotation. The steps in [`HAND-TESTING.md`](HAND-TESTING.md), "Phone and tablet", were run by hand on 2026-11-10 on a Pixel 10 XL Pro, in Firefox 159.0.1 and Chrome 156.0.8078.80. They found, and the editor now handles:

- the image resize handle and the table grips were too small to hit with a finger (the table grips are 30 px on a touch screen, the image handle has a 28 px target), and a long press on the image handle opened the browser's own menu over it;
- a finger on an image brought up the browser's own selection handles and Copy menu over the resize handle: under a touch the page now shows only a caret after the picked image, while the editor still treats the image as selected;
- a phone keyboard reports every key as key code 229 (`Unidentified`), which the selection toolbar took for a keyboard and so showed itself over the browser's menu;
- Chrome asks for a context menu when a finger lets go of a selection handle and names the pointer "mouse", which opened the editor's own menu; the last touch decides now;
- Chrome's keyboard takes an autocorrect suggestion as a delete and a type about 2 ms apart (no composition events), so one undo left part of the word; the two are one undo step now, and a suggestion that arrives as one replacement event is a step of its own;
- the numbered-list icon's digits ran together, and the two table menus shared one icon.

What is a limit of the platform, not the editor: Android strips formatting when anything is copied, before the editor sees a paste (so the formatted-paste step cannot be checked from Android sources that have no formatting to keep); and the heading list is the browser's own `<select>`, which Firefox for Android closes after two taps outside it and Chrome after one. Chrome on Android also will not open a page on a local network until "Nearby devices" is allowed, which only matters for hand testing.

Not run: iOS Safari and iPadOS (no device) and a tablet with a keyboard. The fixes were confirmed by hand in Chrome (the image handle and table grips also in Firefox).

## Server rendering

Every entry point of the packages that do not need a framework imports in Node with no DOM (`pnpm check:packages` does it, from the packed tarballs, with the oldest supported Node and the newest), including the custom elements: they extend a plain class where there is no `HTMLElement`, and `define()` does nothing where there is no `customElements`. The document model, the HTML importer and exporter, the engine and Markdown run in Node with no DOM.

`tools/framework-checks/ssr.sh` renders each wrapper with its framework's own server renderer (React's `renderToString`, Vue's `renderToString`, Svelte's server `render`) in a container with no network, and checks that it makes the named editing surface and nothing else (no editor, no content, no chrome: those appear when the page attaches the editor), that a command hook or composable with no editor yet renders off and disabled, and that nothing is said on the console while rendering. That run is local, like the framework checks, not part of CI.

`tools/ssr-apps/run.sh <app>` goes further with a real server-rendered app for each of Next.js 16.4.5, Nuxt 4.6.4, SvelteKit 3.1.1 and Angular 22.2.3 (`@angular/ssr`), each with its own lockfile. It builds the app and serves it from a container with no network, using the repository's built packages, and drives it in the three engines: the server's HTML has the named surface and no live surface or content; the browser then makes one live surface with that name and the content, typing reaches the document, nothing is said on the console (a hydration mismatch is an error or a warning there), and nothing is requested from outside the app. On 2026-11-09 all four passed in Chromium, Firefox and WebKit (23 of 23 checks each). Making the Angular app found a fault the render-only check could not: the directive made its editor on the server and failed there; it now makes it in the browser only. A deliberate difference between the server's text and the browser's, added to the Next.js app, was reported in all three engines (React error 418), so the check does catch a mismatch. That run is local too. Not checked: other versions of the four frameworks, the custom elements inside a server-rendered app, streaming and partial hydration, and rendering on an edge runtime. How to use each is in [`SERVER-RENDERING.md`](SERVER-RENDERING.md).

The whole framework check was also run, on 2026-11-03, against the published `0.1.0-alpha.4` packages with the oldest versions the wrappers allow of React, Vue and jQuery (React 18.3.1, Vue 3.4.38, jQuery 3.7.1): 522 of 522 passed in all three engines. That run is by hand, not in CI: copy `tools/framework-checks`, install those versions there (`pnpm add -D react@18.3.1 react-dom@18.3.1 vue@3.4.38 jquery@3.7.1 --ignore-workspace`), and run the script as above. The same run on Angular 21.2.26 and Angular 20.3.35 (TypeScript 5.9.3) also passed 522 of 522; Angular 20 was run with zone.js and again with `provideZonelessChangeDetection()`, because it needs one or the other (the check apps in the repository are written for Angular 22, where zoneless is the default, so the Angular 20 run changed how they bootstrap and nothing else). On 2026-11-06 the whole framework check was run again against the published `0.2.0-beta.0` packages, taken from the registry (the `rte-core` tarball matches the release's `SHA256SUMS`), with the versions in `tools/framework-checks` (React 19.3.1, Vue 3.5.44, Svelte 5.57.2, Angular 22.2.3, jQuery 4.0.0): 723 of 723 passed in all three engines. The oldest-version runs were not repeated for the beta. Real devices and screen readers have not been checked.

## Accessibility

What runs automatically:

- **An interface audit** on the styled interface with every part opened: each button, input, select, dialog and menu has an accessible name; ids are unique; `aria-controls`, `aria-labelledby` and `aria-describedby` point at things that exist; there is exactly one tab stop in the toolbar; menu items sit inside menus; `aria-pressed` values are valid; there is a live region; the writing area is a multiline textbox.
- **Contrast**: every theme's token pairs are computed against 4.5:1 for text and 3:1 for borders and focus rings (`rte-themes`).
- **Keyboard**: roving focus in the toolbar, arrow keys and type-ahead in menus, Escape to close menus, dialogs and tooltips and to return focus, focus returning to the opener, a focus ring that is 2px and solid, shortcuts announced with `aria-keyshortcuts`.
- **Forced colors and reduced motion**: pressed state keeps a real border, transitions stop.
- **Target size**: toolbar buttons are at least 24px square at a 390px wide viewport.
- **Announcements**: toggles, search results and counts are said through a polite live region.

What is not tested (the script for it is [HAND-TESTING.md](HAND-TESTING.md)): by hand with a screen reader (VoiceOver, NVDA, JAWS, TalkBack), with a real input method on macOS or Windows, on a real phone or tablet, with speech input, or with browser zoom and text-size settings. Anyone relying on those should treat this as unverified, and reports are welcome.

## Privacy and network

A browser check fails if the editor, the headless layer, the custom elements or the styled interface touch `localStorage`, `sessionStorage`, `document.cookie`, IndexedDB, the Cache API, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, workers or `sendBeacon` while a person types, formats, pastes, searches, opens the source view, and opens menus and dialogs, and a second check proves the watch itself sees each of those. Every page request outside the page's own files is refused and counted. Images from other sites are kept but not loaded unless the host allows it.

## What a published package holds

`pnpm check:packages` packs every package as `npm publish` would, installs the tarballs together with no registry, and checks that: only built files, the README and the license are inside; `exports` point at files that are there; nothing runs on install; no package has a runtime dependency; `npm ls --omit=dev` lists only these packages; the entry points import; and the types compile.
