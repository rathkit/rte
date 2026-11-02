# Rathkit RTE

A rich text editor built from scratch, with zero runtime dependencies.

> Built from scratch. Ships with nothing else.

**Status: alpha.** `0.1.0-alpha.3` of all eleven packages is on npm under the `next` tag. The APIs will change between releases, and there is no API reference yet. Do not build on this.

```sh
npm install @rathkit/rte-core@next
```

Install with `@next`: the `latest` tag is npm's placeholder (`0.0.0-stage`), not a release.

Site: <https://rathkit.com>. Start with the [quick start](https://rathkit.com/docs/quick-start/) or the [RTE overview](https://rathkit.com/docs/rte/); to check what you installed, see [Verify a release](https://rathkit.com/docs/verify/).

## What this is

RTE is a rich text editor for the web. The core is written in TypeScript around a document model that does not touch the DOM, so it can be tested and reasoned about on its own. The framework wrappers and plugins are separate packages under the `@rathkit` npm scope; a reference server package, `rte-server`, is planned.

"Zero dependencies" is enforced, not just claimed. Every published package must have no `dependencies`, `optionalDependencies` or bundled dependencies, no install scripts, and only optional peer dependencies. CI fails if any of that changes.

## What it does today

Text with bold, italic, underline, strikethrough, code, super- and subscript, text and highlight colors, links and images; headings, paragraphs, block quotes, code blocks and rules; bulleted, numbered and definition lists; tables with merged cells, column widths and a header row; alignment and reading direction; find and replace; an HTML source view; word and character counts; paste cleaned up from word processors and spreadsheets. Every action is a named command (`docs/COMMANDS.md`), so toolbars, keys and scripts share one path.

## Packages

| Package | State |
| --- | --- |
| `@rathkit/rte-core` | Early. Document model, HTML import and export, editing operations, an engine with named commands, keys and a plugin host, a model-driven browser view, and the free standard plugins (lists, tables, find and replace, word-processor lists, SVG, images) as separate entry points. See `docs/PLUGINS.md` |
| `@rathkit/rte-headless` | Early. How a toolbar behaves for keyboard and assistive technology (roving focus, ARIA state, focus kept in the editor) a live-region announcer, menus, popovers and dialogs, with no markup or CSS |
| `@rathkit/rte-element` | Early. `<rk-editor>` and `<rk-toolbar>` custom elements: form-associated, with properties, attributes and events. See `docs/ELEMENT.md` |
| `@rathkit/rte-ui` | Early. The styled interface: toolbar and link dialog on the headless layer, themeable by preset, tokens, icons, classes and messages. See `docs/UI.md` |
| `@rathkit/rte-themes` | Early. Preset themes (light, dark, auto, high contrast) and density as token files, with tests for contrast |
| `@rathkit/rte-icons` | Early. The icon set, one SVG string each |
| `@rathkit/rte-react` | Early. `RteEditor`, `useRteEditor`, and the hooks `useCommand` and `useSelector`, over the headless layer; a component re-renders only when the value it reads changes |
| `@rathkit/rte-vue` | Early. `RteEditor` and the composables `useCommand` and `useSelector`, over the headless layer |
| `@rathkit/rte-svelte` | Early. Stores (`command`, `selector`) and the `use:rteEditor` action. Needs nothing from Svelte itself |
| `@rathkit/rte-angular` | Early. The `rteEditor` directive, signals (`commandState`, `selected`) and an Angular forms value accessor (`@rathkit/rte-angular/forms`). Written in the compiled form, so it needs no Angular compiler |
| `@rathkit/rte-jquery` | Early. `$(el).rkEditor(options)` over the custom element, with `rk:change` events |

All eleven are on npm at `0.1.0-alpha.3` under `next`. Only the reference server package, `rte-server`, is still to come.

## Development

Requires Node 26 and pnpm 12. Use pnpm, not npm.

```sh
pnpm install
pnpm check        # zero-deps check, typecheck, tests
pnpm build        # build every package
pnpm check:size   # gzip budget for built packages (after a build)
```

Individual checks:

```sh
pnpm check:zero-deps
pnpm check:denylist   # needs RATHKIT_DENYLIST; skipped locally if unset, required in CI
pnpm typecheck
pnpm test
```

Real-framework checks live in `tools/framework-checks`, a project of its own with its own lockfile (React, Vue, Svelte, Angular and jQuery, pinned exactly, with the same install rules). Nothing in it is part of the workspace or ships. It needs a browser driver and a bundler binary, so it is run locally, not in CI:

```sh
(cd tools/browser-checks && pnpm install --frozen-lockfile --ignore-scripts)
(cd tools/framework-checks && pnpm install --frozen-lockfile)
RTE_PLAYWRIGHT=tools/browser-checks/node_modules RTE_PACK=<rathkit-pack binary> tools/framework-checks/run.sh
```

The workspace is managed with Nx. The only development tools are `nx`, `typescript` and `@types/node`, pinned to exact versions. Tests use the built-in `node:test` runner on TypeScript files directly, with no test framework. Installs refuse packages published less than three days ago and refuse dependency build scripts unless they are explicitly allowed in `pnpm-workspace.yaml`.

## Releases

A release is a signed tag: the release workflow stages the packages with provenance, the owner approves the npm environment, and then approves the staged publish. `0.1.0-alpha.0` was published by hand, without provenance; `0.1.0-alpha.1` and `0.1.0-alpha.2` are GitHub pre-releases that never reached npm (the changelog says why); `0.1.0-alpha.3` is the first version the workflow published. To install it: `npm install @rathkit/rte-core@next`. How a release is made and verified, and what an alpha promises, is in [`docs/RELEASING.md`](docs/RELEASING.md) and [`docs/VERIFY.md`](docs/VERIFY.md); what is checked, in [`docs/SUPPORT.md`](docs/SUPPORT.md); measured sizes and speeds, in [`docs/MEASUREMENTS.md`](docs/MEASUREMENTS.md); the changes, in [`CHANGELOG.md`](CHANGELOG.md).

## Repository layout

```
packages/     published packages (one directory each)
tools/        repo checks run locally and in CI
docs/         design notes
```

## Community

Questions and discussion happen on [Discord](https://discord.gg/A5VBxgPaex). It is best-effort and
not a support commitment.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Everyone works from a fork, every commit is signed and carries a DCO sign-off, and the [Code of Conduct](CODE_OF_CONDUCT.md) and [AI policy](AI_POLICY.md) apply. Roles are in [GOVERNANCE.md](GOVERNANCE.md).

## License

[Apache-2.0](LICENSE)
