# @rathkit/rte-vue

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor for Vue: a component and composables over the headless layer. A ref changes only when the value it holds does.

## Install

```sh
npm install @rathkit/rte-vue@next @rathkit/rte-core@next @rathkit/rte-headless@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless`, `vue` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it; `vue` comes from your own project.

## Example

```vue
<script setup>
import { shallowRef } from "vue";
import { RteEditor, useCommand } from "@rathkit/rte-vue";

const editor = shallowRef();
const bold = useCommand(editor, "format.bold");
</script>

<template>
  <button :aria-pressed="bold.active" @click="editor?.commands.run('format.bold')">Bold</button>
  <RteEditor label="Body" default-value="<p>Hello</p>" @ready="(e) => (editor = e)" @change="(html) => console.log(html)" />
</template>
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
