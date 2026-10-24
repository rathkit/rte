# @rathkit/rte-react

> **Alpha** (0.1.0-alpha.0). Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor for React: a component and hooks over the headless layer. A component re-renders only when the value it reads changes. No editor or accessibility logic lives here.

## Install

```sh
npm install @rathkit/rte-react@next @rathkit/rte-core@next @rathkit/rte-headless@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless`, `react` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it; `react` comes from your own project.

## Example

```jsx
import { RteEditor, useCommand } from "@rathkit/rte-react";
import { useState } from "react";

function Bold({ editor }) {
  const bold = useCommand(editor, "format.bold");
  return <button aria-pressed={bold.active} onClick={() => editor.commands.run("format.bold")}>Bold</button>;
}

export function Field() {
  const [editor, setEditor] = useState();
  return (
    <>
      <Bold editor={editor} />
      <RteEditor label="Body" defaultValue="<p>Hello</p>" onReady={setEditor} onChange={(html) => console.log(html)} />
    </>
  );
}
```

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
