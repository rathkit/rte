# @rathkit/rte-headless

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

How a toolbar, menu, dialog, tooltip and live announcement should behave for the keyboard and assistive technology, with no markup or CSS of its own. Draw the elements yourself and this makes them behave (roving focus, ARIA state, focus returned to the editor); also external stores for any framework.

## Install

```sh
npm install @rathkit/rte-headless@next @rathkit/rte-core@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```js
import { createToolbar } from "@rathkit/rte-headless";

const toolbar = createToolbar(editor, { label: "Formatting" });
// Mark each control you draw with data-rk-item="<id>" (ids are in toolbar.items), then:
toolbar.bind(document.querySelector("#my-toolbar"));
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
