# @rathkit/rte-ui

> **Beta.** Not for production yet: the APIs may still change between releases. Published to the `next` tag only.

The styled interface: a toolbar, menus, dialogs, find bar, status line and tooltips on the headless layer, with an optional selection toolbar and context menu, themeable by preset, tokens, icons, classes and messages.

## Install

```sh
npm install @rathkit/rte-ui@next @rathkit/rte-core@next @rathkit/rte-headless@next @rathkit/rte-themes@next @rathkit/rte-icons@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless`, `@rathkit/rte-themes`, `@rathkit/rte-icons` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```js
import { createEditor } from "@rathkit/rte-core/standard";
import { createStandardUi } from "@rathkit/rte-ui/standard";
import "@rathkit/rte-ui/base.css";
import "@rathkit/rte-themes/light.css";

const root = document.createElement("div");
document.body.append(root);
const surface = document.createElement("div");
surface.setAttribute("aria-label", "Body");

const editor = createEditor({ element: surface, html: "<p>Hello</p>" });
editor.subscribe(() => console.log(editor.getHtml()));
createStandardUi(editor, { root, style: { theme: "light" } });
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
