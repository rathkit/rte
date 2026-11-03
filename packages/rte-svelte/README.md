# @rathkit/rte-svelte

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor for Svelte: stores and an action over the headless layer. Svelte's store contract is a plain shape, so this package needs nothing from Svelte itself.

## Install

```sh
npm install @rathkit/rte-svelte@next @rathkit/rte-core@next @rathkit/rte-headless@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it.

## Example

```svelte
<script>
  import { rteEditor, command } from "@rathkit/rte-svelte";
  let editor;
  $: bold = editor && command(editor, "format.bold");
</script>

<button aria-pressed={$bold?.active} on:click={() => editor.commands.run("format.bold")}>Bold</button>
<div aria-label="Body" use:rteEditor={{ html: "<p>Hello</p>", onReady: (e) => (editor = e), onChange: (html) => console.log(html) }}></div>
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
