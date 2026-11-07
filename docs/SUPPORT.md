# What is tested

This page says what is checked, with which browsers, and what is not. It claims nothing beyond that.

## Browsers

Every browser check runs in all three engines of Playwright 1.64.1, headless, on Linux (the numbers are of the build that ran on 2026-10-24):

| Engine | Version | Stands in for |
| --- | --- | --- |
| Chromium | 156.0.8078.4 | Chrome, Edge and other Chromium browsers |
| Firefox | 157.0 | Firefox |
| WebKit | 27.2 (Playwright's build for Linux) | Safari |

"Stands in for" is a statement about the engine, not about the product: the browser checks do not run Safari, Chrome or Edge themselves, and they do not run on macOS or Windows. The WebKit build on Linux is not Safari on macOS or iOS.

The packages are tested under Node 22.14.0 (the oldest that `engines` allows) and Node 26: every entry point that does not need a browser is imported with each of them from the packed tarballs, and the types are compiled as a user of the packages would.

## What the browser checks cover

About 740 checks per run (`tools/browser-checks`): typing, Enter, Backspace and Delete, the system clipboard (copy, cut and paste of text and HTML), drag and drop of text, dropped and pasted images, input-method composition (Chromium only, through the debugging protocol, which simulates it), lists, tables, find and replace, the source view, the toolbar, menus, dialogs, tooltips, the custom element in a form, the styled interface in four themes with density and token changes, forced colors and reduced motion, a phone-sized viewport (touch in Chromium and WebKit, a narrow window in Firefox), and the speed and memory figures in `MEASUREMENTS.md`.

Paste conformance: 80 scrubbed clipboard captures from word processors and spreadsheets, and the office and mixed-source conformance suites, in the three engines.

## README examples

The example in each package's README is built exactly as written (bundled against the built packages and, for the wrapper packages, the real React, Vue, Svelte, Angular 22 and jQuery; Angular also as an ahead-of-time build with Angular's compiler and linker, templates type-checked against the wrapper) and run in all three engines: the editor appears with its name, typing is reported through the example's own callback, the Bold button works where the example has one, the interface gets its theme, and there is no error and no request for anything outside the page (`tools/framework-checks`, run locally with `RTE_PLAYWRIGHT` and `RTE_PACK` like the other framework checks).

The whole framework check was also run, on 2026-11-03, against the published `0.1.0-alpha.4` packages with the oldest versions the wrappers allow of React, Vue and jQuery (React 18.3.1, Vue 3.4.38, jQuery 3.7.1): 522 of 522 passed in all three engines. That run is by hand, not in CI: copy `tools/framework-checks`, install those versions there (`pnpm add -D react@18.3.1 react-dom@18.3.1 vue@3.4.38 jquery@3.7.1 --ignore-workspace`), and run the script as above. The same run on Angular 21.2.26 and Angular 20.3.35 (TypeScript 5.9.3) also passed 522 of 522; Angular 20 was run with zone.js and again with `provideZonelessChangeDetection()`, because it needs one or the other (the check apps in the repository are written for Angular 22, where zoneless is the default, so the Angular 20 run changed how they bootstrap and nothing else). On 2026-11-06 the whole framework check was run again against the published `0.2.0-beta.0` packages, taken from the registry (the `rte-core` tarball matches the release's `SHA256SUMS`), with the versions in `tools/framework-checks` (React 19.3.1, Vue 3.5.44, Svelte 5.57.2, Angular 22.2.3, jQuery 4.0.0): 723 of 723 passed in all three engines. The oldest-version runs were not repeated for the beta. Server-side rendering, real devices and screen readers have not been checked.

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
