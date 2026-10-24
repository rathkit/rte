# @rathkit/rte-themes

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

Preset themes (light, dark, auto, high contrast) and a density setting, as CSS files of `--rk-*` custom properties, with tests that every pair of colors meets its contrast ratio.

## Install

```sh
npm install @rathkit/rte-themes@next
```

No dependencies, and nothing runs when it is installed.

## Example

```js
import "@rathkit/rte-ui/base.css";
import "@rathkit/rte-themes/light.css";
import "@rathkit/rte-themes/dark.css";   // chosen with style: { theme: "dark" }
```

The token names are also exported from the package entry point (`TOKENS`).

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
