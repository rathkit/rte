# Server rendering

The editor is made in the browser. A server renders the editing surface as an empty element with its name, and the page makes the editor there when it loads. Nothing in the packages needs a DOM until the editor is made, so a server-rendered app imports them, renders them and hydrates them with no warning.

What the server sends for each wrapper is the same thing: `<div aria-label="Body" data-rte-surface></div>` (Angular and the Svelte action add attributes of their own to it). There is no content and no toolbar in it: the document appears when the editor attaches. A command hook (`useCommand` and its equivalents) with no editor yet reports a command that is off and disabled, which is also what the server renders.

## What runs on a server

- `@rathkit/rte-core` (the model, `importHtml`, `exportHtml`, the engine, the standard plugins) and `@rathkit/rte-core/markdown` run in Node with no DOM, so a server can clean, convert or check a document.
- `@rathkit/rte-element` and `@rathkit/rte-ui/element` import in Node. Their `define()` calls do nothing there, so `import "@rathkit/rte-element/define"` is safe in a module a server also loads; the elements are defined when the same module loads in the browser.
- The headless helpers that touch the page (`createDialog` and the like) are for the client. Importing them on a server is safe; calling them needs a DOM.

## Next.js

Put the editor in a client component. The page itself can stay a server component.

```jsx
// app/surface.jsx
"use client";
import { RteEditor } from "@rathkit/rte-react";

export default function Surface() {
  return <RteEditor label="Body" defaultValue="<p>one two three</p>" />;
}
```

```jsx
// app/page.jsx (a server component)
import Surface from "./surface.jsx";

export default function Page() {
  return <Surface />;
}
```

## Nuxt

Use the component as it is. It needs no `<ClientOnly>` wrapper.

```vue
<script setup>
import { RteEditor } from "@rathkit/rte-vue";
</script>

<template>
  <RteEditor label="Body" default-value="<p>one two three</p>" />
</template>
```

## SvelteKit

The Svelte wrapper is an action. Write the surface as plain markup with its name and the `data-rte-surface` marker, so the server sends it; the action makes the editor on the client only.

```svelte
<script>
  import { rteEditor } from "@rathkit/rte-svelte";
</script>

<div aria-label="Body" data-rte-surface use:rteEditor={{ html: "<p>one two three</p>" }}></div>
```

## Angular

Angular's server renderer (`@angular/ssr`, with `provideServerRendering`) and `provideClientHydration()` work as they do for any component. The directive makes the editor only when the app runs in a browser.

```ts
import { Component } from "@angular/core";
import { RteEditor } from "@rathkit/rte-angular";

@Component({
  selector: "app-root",
  imports: [RteEditor],
  template: `<div rteEditor label="Body" defaultValue="<p>one two three</p>"></div>`,
})
export class App {}
```

The starting HTML given as a plain `defaultValue="…"` attribute is also in the server's HTML as that attribute (not as content). Bind it as `[defaultValue]="html"` if you would rather it were not.

## How it is checked

`tools/ssr-apps` has one small app for each of the four, built the way each framework's own server build does it, with its own lockfile (none of it is part of the main workspace, and none of it ships). `tools/ssr-apps/run.sh <app>` builds the app and serves it from a container with no network, using the repository's built packages, then drives it in Chromium, Firefox and WebKit (the engines are in [`SUPPORT.md`](SUPPORT.md)). For each app it checks that:

- the HTML the server sends has the named surface, and no live editing surface or content;
- the browser makes one live surface with the same name, with the content, and typing reaches the document;
- nothing is said on the console (a hydration mismatch is an error or a warning there) and nothing is requested from outside the app.

The run is local, like the other framework checks, not part of CI. Not checked: other versions of the four frameworks than the ones in each app's lockfile (Next.js 16.4.5, Nuxt 4.6.4, SvelteKit 3.1.1, Angular 22.2.3), the custom elements inside a server-rendered app, streaming and partial hydration modes, and rendering on an edge runtime instead of Node.
