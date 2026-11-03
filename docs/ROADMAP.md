# Roadmap

What is left before RTE 1.0, in the order it is meant to be done. Each item has a stable ID and an issue, grouped in milestones named by
the version they are planned for; the issues are also in the RTE road to 1.0 project (board and table by milestone, track and priority).
A box is ticked in the commit that finishes the item, and the pull request says `Closes #N`. This is a plan, not a promise: the order
changes when real projects show what breaks.

Items marked *(maintainer)* need a decision or an action that only the maintainer can take. Items marked *(spike)* are a question to
answer, not a feature.

> **Draft, 2026-11-03.** The issues and the project do not exist on GitHub yet. `tools/roadmap/roadmap.json` holds them and
> `node tools/roadmap/apply.mjs --apply` creates them (it changes nothing without `--apply`); the links below are filled in by
> `node tools/roadmap/apply.mjs --doc` once they exist.

## What 1.0 means

1. **Drop-in.** A product that uses a mature editor today can replace it with RTE, keep its stored content, and change one integration
   point: a textarea upgrade, a custom element, a wrapper for its framework, or a script tag. There is a migration guide, a content
   migration tool that reports what would change, and drop-in entry points. Every area in the behavior notes the owner supplied
   (formatting, links, lists, tables, images, code, paste, dialogs, find, keyboard, selection, undo, read-only, filtering, themes,
   accessibility, language and direction, performance) is covered by an item here and by checks that pass in Chromium, Firefox and WebKit.
2. **Fast, small and lean, measured.** Every entry point has a size budget and every common action a time and memory budget, set from a
   measured baseline (0.2.0-beta.0), kept by CI gates, and published with the method in `docs/MEASUREMENTS.md`. A budget that is missed
   is listed there with the reason and an issue. Public statements follow the benchmark suite and never go ahead of it; whether and how
   they are compared with other products is decided in item 3.6, because this repository does not name other products and a comparison
   needs a benchmark anyone can run.
3. **Trustworthy.** A published stability policy and a frozen plugin API, a security review and fuzzing, an accessibility conformance
   report, screen reader and device results in `docs/SUPPORT.md`, complete docs and a migration guide, provenance and signed checksums on
   every release.

Pre-releases use `-alpha.N`, `-beta.N` and `-rc.N`; while the major version is 0, any release may change options, output and plugin
support (see the [changelog](../CHANGELOG.md)). Nx Release makes the next prerelease of the current line on its own; moving from alpha to
beta, and from beta to the release candidate, is a decision (`nx release --preid beta`, see [RELEASING.md](RELEASING.md)).

## Done

- [x] 0.1 The repositories are public, with rulesets, signed commits, a sign-off on every commit, and secret scanning on.
- [x] 0.2 Eleven packages with no runtime dependencies, published to `next` with provenance, signed checksums and a software bill of materials ([VERIFY.md](VERIFY.md)).
- [x] 0.3 Wrappers for React, Vue, Svelte, Angular and jQuery, and the custom element, with a page each on the site; the framework checks passed on the oldest and newest supported versions of React, Vue, jQuery and Angular ([SUPPORT.md](SUPPORT.md)).
- [x] 0.4 A plugin API with hooks for commands, keys, paste, copy, typed shortcuts, import, the page (`view`) and repair after edits (`normalize`).
- [x] 0.5 Lists with task items, tables with merge, split, widths, borders and backgrounds, images with a policy and an SVG cleaner, find and replace, footnotes, and Markdown in and out (opt-in).
- [x] 0.6 Word-processor paste recognizers and a scrubbed capture set; the free paste scenarios all pass in three engines ([CONFORMANCE.md](CONFORMANCE.md)).
- [x] 0.7 Code scanning and Dependabot alerts at zero, with a regression test for each pattern fixed.
- [x] 0.8 Hand-testing steps for devices and screen readers ([HAND-TESTING.md](HAND-TESTING.md)); the results are items 5.4, 5.3 and 5.2.

Waiting on the maintainer, tracked outside the milestones: the copyright holder in `NOTICE` (item 7.7) and the announcement (item 8.5).

## Decisions the plan needs

The *(maintainer)* items ask for these; each issue says what is being decided.

1. **Font family and size** (2.1): allow-listed values from a host-defined list, or leave them to host styles.
2. **Where product-specific migration mappings live** (4.11, 0.7.0-beta.0): the repository rule forbids naming other products, so option
   mappings and a compatibility layer need a home outside it (a private package, a separate repository, or a paid migration kit).
3. **Whether `rte-server` is part of 1.0** (0.7.0-beta.0), or only the upload and link-check contract.
4. **How performance is described publicly** (3.6, 0.2.0-beta.0).
5. **Whether beta follows the first four milestones or fewer.** The plan calls the first beta 0.2.0-beta.0 and keeps feature work
   in later betas, as the Pack roadmap does. Any milestone can be merged into its neighbor.

## Not in 1.0

Collaborative editing, comments and annotations anchored to ranges (the range decoration API is the groundwork), embedded media with
upload, native wrappers (Swift, Android) and hosted services. They are collected in the last item for the next roadmap. Premium work is
not in this public plan.

## Milestones

### 0.1.0-alpha.5

Stable base: the API surface and editing rules reviewed and written down, one error model, one content policy, read-only and disabled states complete.

- [ ] 1.1 Review the public exports of every package `P0`
- [ ] 1.2 Define the editor event and options contract `P0`
- [ ] 1.3 Audit undo and redo `P0`
- [ ] 1.4 Audit selection and caret rules `P0`
- [ ] 1.5 Audit Enter, Shift+Enter, Backspace and Delete at block edges `P0`
- [ ] 1.6 Complete and document the content filtering policy `P0`
- [ ] 1.7 Write the error and warning model `P1`
- [ ] 1.8 Read-only and disabled states `P1`

### 0.2.0-beta.0

Measure and gate: a benchmark suite with a stated method, numeric budgets, memory and leak tests, and CI gates for size and speed.

- [ ] 3.1 Benchmark suite and method `P0`
- [ ] 3.2 Write the budgets `P0`
- [ ] 3.3 Memory and leaks `P0`
- [ ] 3.4 Regression gates in CI `P0`
- [ ] 3.5 Throttled-CPU and low-memory runs `P2`
- [ ] 3.6 Decide how performance is described publicly *(maintainer)* `P0`

### 0.3.0-beta.0

Platforms and accessibility: server rendering, touch, input methods, screen readers, the keyboard and contrast audit, language packs, the browser support window and clipboard completeness.

- [ ] 5.1 Server-side use and server rendering `P0`
- [ ] 5.2 Touch and mobile pass `P0`
- [ ] 5.3 Input method (IME) pass `P0`
- [ ] 5.4 Screen reader pass `P0`
- [ ] 5.5 Keyboard, contrast, motion and zoom audit `P0`
- [ ] 5.6 Localization: stable message ids and language packs `P0`
- [ ] 5.7 Published compatibility matrix `P0`
- [ ] 5.8 Browser support window and older engines `P1`
- [ ] 1.9 Clipboard completeness `P0`
- [ ] 1.10 Grow the scrubbed paste captures `P1`

### 0.4.0-beta.0

Content features: formatting decisions, links and anchors, image upload, code blocks, table properties, lists and collapsible sections.

- [ ] 2.1 Decide font family and font size *(maintainer)* *(spike)* `P0`
- [ ] 2.2 Complete the link flows `P0`
- [ ] 2.3 Image upload flow and editing `P0`
- [ ] 2.4 Code blocks: language and highlighting `P0`
- [ ] 2.5 Tables: properties and accessibility `P0`
- [ ] 2.6 Block style presets `P0`
- [ ] 2.7 Font family and font size marks `P1`
- [ ] 2.8 Named anchors and heading ids `P1`
- [ ] 2.9 Collapsible sections `P1`
- [ ] 2.10 List polish `P1`
- [ ] 2.11 Decide the extra inline elements *(spike)* `P2`
- [ ] 2.12 Find and replace extras `P2`

### 0.5.0-beta.0

Interface and modes: toolbar configuration, consistent dialogs, the suggestion popup and range decorations, editing modes, the textarea upgrade, and embeds (phase 1).

- [ ] 6.1 Toolbar configuration and responsive layout `P0`
- [ ] 6.2 Dialogs: one consistent behavior `P0`
- [ ] 6.3 Range decoration API `P0`
- [ ] 6.4 Editing modes: inline, single-line and plain-text `P0`
- [ ] 6.5 Textarea upgrade path `P0`
- [ ] 6.6 Suggestion popup primitive `P1`
- [ ] 6.7 Fullscreen, print and export `P2`
- [ ] 2.13 Embeds, phase 1 (opt-in plugin) `P1`

### 0.6.0-beta.0

Speed and size met: typing cost independent of document size, very large documents, load throughput, a smaller core, lazy interface parts.

- [ ] 3.7 Keystroke cost independent of document size `P0`
- [ ] 3.8 Shrink the core `P0`
- [ ] 3.9 Very large documents `P1`
- [ ] 3.10 Load and import throughput `P1`
- [ ] 3.11 Lazy loading of interface parts `P1`
- [ ] 3.12 Style cost `P2`

### 0.7.0-beta.0

Adoption kit: migration guide and tool, content profiles, the script-tag build, starters, a playground, and the decisions on mappings and a reference server.

- [ ] 4.1 Migration guide `P0`
- [ ] 4.2 Content migration tool `P0`
- [ ] 4.3 Script-tag build `P0`
- [ ] 4.4 Content filtering profiles for legacy content `P1`
- [ ] 4.5 Compatibility layer, if decided `P1`
- [ ] 4.6 Starter templates and examples `P1`
- [ ] 4.7 Reference server decision and upload contract *(maintainer)* *(spike)* `P1`
- [ ] 4.8 Interactive playground `P2`
- [ ] 4.9 One-package install `P2`
- [ ] 4.10 Contribution guide for plugins `P2`
- [ ] 4.11 Decide how product-specific mappings are offered *(maintainer)* `P0`

### 0.8.0-beta.0

Frozen surface: the plugin API frozen, the API reference, guides, the support and deprecation policy, and the compatibility check between releases.

- [ ] 1.11 Freeze the plugin API for beta `P0`
- [ ] 1.12 Public API compatibility check `P0`
- [ ] 4.12 API reference `P0`
- [ ] 4.13 Guides and recipes `P0`
- [ ] 4.14 Support, deprecation and version policy `P0`
- [ ] 1.13 Stability policy for the options, events and plugin API `P0`

### 1.0.0-rc.1

Release candidate: security review, fuzzing, property tests, the accessibility conformance report, a soak test, reproducible builds, the alpha-only release rules lifted, two weeks with no new P0.

- [ ] 7.1 Independent security review `P0`
- [ ] 7.2 Fuzzing in CI `P0`
- [ ] 7.3 Property tests for the model `P0`
- [ ] 7.4 Accessibility conformance statement `P0`
- [ ] 7.5 Reproducible build check `P0`
- [ ] 7.6 Long-session soak test `P2`
- [ ] 7.7 Copyright holder, trademark notice and security contact *(maintainer)* `P0`
- [ ] 8.1 Release candidate cycle: two weeks with no new P0 *(maintainer)* `P0`
- [ ] 8.2 Lift the alpha-only release rules `P0`

### 1.0.0

The first stable release.

- [ ] 8.3 1.0.0 release *(maintainer)* `P0`
- [ ] 8.4 After 1.0: the next roadmap `P2`
- [ ] 8.5 Announcement and the what-is-tested statement *(maintainer)* `P1`

