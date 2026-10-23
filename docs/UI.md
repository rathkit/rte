# The styled interface and theming

`@rathkit/rte-ui` draws a toolbar and dialogs from the editor's interface items, on top of `@rathkit/rte-headless`, and styles them with tokens.
There are three ways to use the editor's interface, in order of effort: pick a theme, give a style provider, or skip this package and draw your own
from `@rathkit/rte-headless`.

```js
import { createEditor } from "@rathkit/rte-core/standard";
import { createStandardUi } from "@rathkit/rte-ui/standard";   // with the default icons
const editor = createEditor({ element: document.createElement("div"), html });
const ui = createStandardUi(editor, { root: document.querySelector("#editor"), style: { theme: "auto" } });
```

Load `@rathkit/rte-ui/base.css` and the theme files you use (`@rathkit/rte-themes/light.css`, `dark.css`, `auto.css`, `high-contrast.css`, `density.css`).
All shipped CSS is in cascade layers, so your own unlayered CSS wins without a specificity fight.

## Parts

Every element carries `data-rk-part`: `root`, `toolbar`, `button`, `select`, `separator`, `icon`, `label`, `content`, `menu-host`, `menu`, `menu-item`, `menu-separator`, `menu-keys`, `tooltip`, `dialog`, `dialog-title`,
`field-label`, `field`, `field-error`, `actions`, `action`. Selectors and the `classes` option address parts by these names, never by class,
so the inside of the interface can change without breaking a theme. The only class is `rk-root`, which scopes everything to one editor.
Nothing reaches outside it, and tokens are never set on `:root`, so two editors on a page can differ.

## Tokens

Plain CSS custom properties (35 now, at most 50), named for roles, not values.

| Group | Tokens |
| --- | --- |
| Color | `--rk-bg`, `--rk-surface`, `--rk-surface-raised`, `--rk-fg`, `--rk-fg-muted`, `--rk-border`, `--rk-border-subtle`, `--rk-accent`, `--rk-accent-fg`, `--rk-accent-subtle`, `--rk-danger`, `--rk-selection-bg`, `--rk-control-hover`, `--rk-control-active`, `--rk-brand`, `--rk-brand-text` |
| Space | `--rk-space-1` to `--rk-space-4`, `--rk-control-size` (a control is at least 24 px, the WCAG 2.2 target size; 32 px by default) |
| Shape | `--rk-radius-s`, `--rk-radius-m`, `--rk-border-width` |
| Focus | `--rk-focus-color`, `--rk-focus-width`, `--rk-focus-offset` |
| Type | `--rk-font-ui`, `--rk-font-content`, `--rk-font-heading`, `--rk-font-mono`, `--rk-font-size`, `--rk-line-height` |
| Motion, depth | `--rk-motion-duration`, `--rk-shadow-popover` |

## Presets

`light`, `dark`, `auto` (follows the system, and `data-rk-scheme="light"` or `"dark"` overrides it), and `high-contrast`, each a small CSS file of token
values (under 1 KB gzipped). Density (`compact`, `comfortable`) changes space and control size, whatever the theme. The tests compute the contrast of every
pair in every theme: text is at least 4.5:1, the edges of controls and the focus ring at least 3:1. The brand is Rathkit's: Prussian blue and brass, with
Archivo for headings and Instrument Sans for text; fonts are named in the tokens but not loaded, so load them yourself or the system font is used.

## The style provider

Plain data, no code needed except for `parts`:

```ts
interface StyleProvider {
  theme?: string;                        // a preset name: sets data-rk-theme
  scheme?: "light" | "dark";
  density?: "compact" | "comfortable";
  tokens?: Partial<Record<TokenName, string>>;   // set on the root; beats the preset
  icons?: Record<string, string | (() => Node)>; // SVG markup you trust, or a function; the rest fall back to the defaults
  classes?: Partial<Record<PartName, string>>;   // extra classes on every element of a part
  messages?: Partial<Record<MessageKey, string>>;// every word the interface says, which is also how to translate it
  parts?: { button?: (context) => HTMLElement }; // last resort: your own element for a button (it must still be accessible)
}
ui.setStyle(next);   // switch at run time: nothing is rebuilt
```

Order of precedence: the defaults in `base.css` (light values, used only if no theme is loaded), then the preset, then `tokens`, then your CSS.
Icons are parsed by the browser inside a `<template>` and must be exactly one `<svg>` with no script or event handlers, or they are ignored and the item shows
its words instead. `messages` can rename any item (`item.bold`), the dialog buttons, and what is announced ("{label} on").

## Accessibility the interface adds on the headless layer

A visible focus ring, a pressed state that does not rely on color (a thicker bottom edge and a border), tooltips with the key (`Bold (Ctrl+B)`; see below), forced-colors rendering with real borders and outlines, no animation when the person prefers reduced motion, and spoken confirmation
when a toggle is pressed. Controls keep their name from `aria-label`, so an icon-only toolbar is still named. The headless layer supplies roving focus,
`aria-pressed`, `aria-disabled`, and the dialog and menu behavior.

## Menus and tooltips

A `menu` item in the interface list is drawn as a button that opens a list of commands (the Table menu is one). It is the headless menu: arrow keys move through the entries, typing jumps to one, Enter or Space chooses, Escape closes and returns the focus to the button, and a click elsewhere closes it. An entry whose command is unavailable stays reachable and says `aria-disabled`; a toggle entry is a `menuitemcheckbox` with `aria-checked`, and a check mark in front of it so the state never depends on color. After a choice the focus goes back to the editor, and toggles are announced.

Tooltips are one shared element (`data-rk-part="tooltip"`, `role="tooltip"`) put under the control it is for. The tip shows after a pause when the pointer rests on a control and at once when the keyboard focuses it; it is dismissed with Escape (anywhere on the page) without moving the pointer or the focus; the pointer can move onto it without it going away; and it goes when the pointer or focus leaves. The words are the control's accessible name already, so the tip is not announced a second time. Controls carry the tip text in `data-rk-tip`.

## Find bar and status line

When the editor has the find plugin, a bar sits between the toolbar and the writing area (`data-rk-part="findbar"`). It opens with the toolbar button or Mod-f, with the focus in the search box. Enter and Shift+Enter move between matches, Escape closes it and puts the focus back in the editor. It holds no search logic: it reads `find.set` and runs the `find.*` commands. Matches are painted with the page's highlight registry (`::highlight(rk-find)`, `rk-find-current`) where the browser has one, so nothing in the document changes; the match being looked at is the selection. The count is announced once typing pauses.

A status line (`data-rk-part="status"`) under the writing area shows the words and characters, or the selected words against the whole. It is recounted at most a few times a second. Turn it off with `status: false`.

## HTML source

When the editor can give its HTML, a toolbar button (`source`) swaps the writing area for a text box with the document's HTML, one block to a line. Closing it with the button applies what was typed through `document.setHtml`, so it is read like anything pasted (what is not allowed is dropped) and is one undo step. Escape closes it and throws the changes away. While it is open the other buttons do nothing.
