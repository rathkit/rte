# @rathkit/rte-headless

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

How a toolbar, menu, dialog, tooltip and live announcement should behave for the keyboard and assistive technology, with no markup or CSS of its own. Draw the elements yourself and this makes them behave (roving focus, ARIA state, focus returned to the editor); also external stores for any framework.

## Install

```sh
npm install @rathkit/rte-headless@next @rathkit/rte-core@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```js
import { createEditor } from "@rathkit/rte-core/standard";
import { createToolbar } from "@rathkit/rte-headless";

const surface = document.createElement("div");
surface.setAttribute("aria-label", "Body");
document.body.append(surface);
const editor = createEditor({ element: surface, html: "<p>Hello</p>" });

// Draw the controls yourself and mark each with data-rk-item="<id>"; the toolbar makes them behave.
const bar = document.createElement("div");
const toolbar = createToolbar(editor, { label: "Formatting" });
for (const item of toolbar.items.filter((i) => i.kind === "button" || i.kind === "toggle")) {
  const button = document.createElement("button");
  button.setAttribute("data-rk-item", item.id);
  button.textContent = toolbar.state(item.id).label;
  bar.append(button);
}
document.body.prepend(bar);
toolbar.bind(bar);                            // roving focus, aria-pressed, focus kept in the editor
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
