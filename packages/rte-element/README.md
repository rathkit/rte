# @rathkit/rte-element

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor as custom elements, `<rk-editor>` and `<rk-toolbar>`, for any page or framework: form-associated (it submits its value, resets, restores), with properties, attributes and events.

## Install

```sh
npm install @rathkit/rte-element@next @rathkit/rte-core@next @rathkit/rte-headless@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```html
<script type="module">
  import "@rathkit/rte-element/define";
</script>

<form>
  <rk-editor name="body" label="Body"><p>Start here</p></rk-editor>
</form>
<script>
  document.querySelector("rk-editor").addEventListener("rk-change", (e) => console.log(e.detail.html));
</script>
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
