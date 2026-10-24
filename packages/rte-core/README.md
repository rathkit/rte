# @rathkit/rte-core

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor itself: the document model, HTML import and export, editing operations, commands and keys, the plugin host, the browser view, and the free plugins (lists, tables, find and replace, word-processor lists, SVG, images). The model does not touch the DOM, so it also runs in Node.

## Install

```sh
npm install @rathkit/rte-core@next
```

No dependencies, and nothing runs when it is installed.

## Entry points

- `@rathkit/rte-core`: model, import and export, engine (no DOM)
- `@rathkit/rte-core/dom`: the browser view (`Editor`)
- `@rathkit/rte-core/standard`: the editor with the free plugins already added (`createEditor`)
- `@rathkit/rte-core/lists`, `/tables`, `/find`, `/word`, `/svg`, `/images`: the plugins, one entry point each

## Example

```js
import { createEditor } from "@rathkit/rte-core/standard";

const editor = createEditor({
  element: document.querySelector("#editor"), // an empty <div> with an aria-label
  html: "<p>Hello</p>",
});

editor.commands.run("format.bold");       // every action is a named command
editor.subscribe(() => save(editor.getHtml()));
```

Give the element an `aria-label` (or `aria-labelledby`): an unnamed editor is announced as just "text box".

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
