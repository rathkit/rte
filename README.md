# Rathkit RTE

A rich text editor built from scratch, with zero runtime dependencies.

> Built from scratch. Ships with nothing else.

**Status: pre-alpha.** The core of an editor exists and passes its paste conformance suites, but it is far from complete. Nothing is published to npm and the APIs will change. Do not build on this.

Site: <https://rathkit.com>

## What this is

RTE is a rich text editor for the web. The core is written in TypeScript around a document model that does not touch the DOM, so it can be tested and reasoned about on its own. Framework wrappers, plugins and a server package are planned as separate packages under the `@rathkit` npm scope.

"Zero dependencies" is enforced, not just claimed. Every published package must have no `dependencies`, `optionalDependencies` or bundled dependencies, no install scripts, and only optional peer dependencies. CI fails if any of that changes.

## Packages

| Package | State |
| --- | --- |
| `@rathkit/rte-core` | Early. Document model, HTML import and export, editing operations, an engine with named commands, keys and a plugin host, a model-driven browser view, and the free standard plugins (lists, word-processor lists, SVG, images) as separate entry points. Not published. See `docs/PLUGINS.md` |
| `@rathkit/rte-headless` | Early. How a toolbar behaves for keyboard and assistive technology (roving focus, ARIA state, focus kept in the editor) a live-region announcer, menus, popovers and dialogs, with no markup or CSS. Not published |
| `@rathkit/rte-element` | Early. `<rk-editor>` and `<rk-toolbar>` custom elements: form-associated, with properties, attributes and events. Not published. See `docs/ELEMENT.md` |
| `@rathkit/rte-ui` | Early. The styled interface: toolbar and link dialog on the headless layer, themeable by preset, tokens, icons, classes and messages. Not published. See `docs/UI.md` |
| `@rathkit/rte-themes` | Early. Preset themes (light, dark, auto, high contrast) and density as token files, with tests for contrast. Not published |
| `@rathkit/rte-icons` | Early. The icon set, one SVG string each. Not published |

More packages (the other framework wrappers, server) will appear here as they are built.

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
pnpm check:denylist   # needs RTE_DENYLIST; skipped locally if unset, required in CI
pnpm typecheck
pnpm test
```

The workspace is managed with Nx. The only development tools are `nx`, `typescript` and `@types/node`, pinned to exact versions. Tests use the built-in `node:test` runner on TypeScript files directly, with no test framework. Installs refuse packages published less than three days ago and refuse dependency build scripts unless they are explicitly allowed in `pnpm-workspace.yaml`.

## Repository layout

```
packages/     published packages (one directory each)
tools/        repo checks run locally and in CI
docs/         design notes
```

## Contributing

The project is not ready for outside contributions yet. Issues are welcome once the first alpha is out.

## License

[Apache-2.0](LICENSE)
