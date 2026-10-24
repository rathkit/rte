# @rathkit/rte-jquery

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor for jQuery: `$(el).rkEditor(options)` over the custom element, with `rk:change` events. Works with jQuery 3 and 4.

## Install

```sh
npm install @rathkit/rte-jquery@next @rathkit/rte-core@next @rathkit/rte-element@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-element` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```js
import $ from "jquery";
import "@rathkit/rte-element/define";
import { install } from "@rathkit/rte-jquery";

install($);
$("#editor").rkEditor({ label: "Body", html: "<p>Hello</p>" });
$("#editor").on("rk:change", (event, html) => console.log(html));
$("#editor").rkEditor("html");               // read it; rkEditor("html", "<p>x</p>") replaces it
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
