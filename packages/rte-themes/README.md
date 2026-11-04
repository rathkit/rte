# @rathkit/rte-themes

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

Preset themes (light, dark, auto, high contrast) and a density setting, as CSS files of `--rte-*` custom properties, with tests that every pair of colors meets its contrast ratio.

## Install

```sh
npm install @rathkit/rte-themes@next
```

No dependencies, and nothing runs when it is installed.

## Example

```js
import { createEditor } from "@rathkit/rte-core/standard";
import { createStandardUi } from "@rathkit/rte-ui/standard";
import "@rathkit/rte-ui/base.css";
import "@rathkit/rte-themes/dark.css";

const root = document.createElement("div");
document.body.append(root);
const surface = document.createElement("div");
surface.setAttribute("aria-label", "Body");

const editor = createEditor({ element: surface, html: "<p>Hello</p>" });
editor.subscribe(() => console.log(editor.getHtml()));
createStandardUi(editor, { root, style: { theme: "dark" } });
```

The other presets are `light.css`, `auto.css` (follows the system's dark setting) and `high-contrast.css`, with `density.css` for compact and comfortable spacing; the token names are also exported from the package entry point (`TOKENS`).

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
