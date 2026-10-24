# @rathkit/rte-icons

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

The icon set the interface uses, one SVG string each, 24 by 24, drawn in the current text color.

## Install

```sh
npm install @rathkit/rte-icons@next
```

No dependencies, and nothing runs when it is installed.

## Example

```js
import { bold, defaultIcons } from "@rathkit/rte-icons";

const button = document.createElement("button");
button.setAttribute("aria-label", "Bold");
button.innerHTML = bold;                      // one icon, so a bundler keeps only what you import
document.body.append(button);

console.log(Object.keys(defaultIcons).length, "icons by the names interface items use");
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
