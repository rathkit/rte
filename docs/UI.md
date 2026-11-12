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

Every element carries `data-rte-part`: `root`, `toolbar`, `button`, `select`, `separator`, `icon`, `label`, `content`, `menu-host`, `menu`, `menu-item`, `menu-separator`, `menu-keys`, `floating`, `tooltip`, `dialog`, `dialog-title`,
`field-label`, `field`, `field-error`, `actions`, `action`. Selectors and the `classes` option address parts by these names, never by class,
so the inside of the interface can change without breaking a theme. The only class is `rte-root`, which scopes everything to one editor.
Nothing reaches outside it, and tokens are never set on `:root`, so two editors on a page can differ.

## Tokens

Plain CSS custom properties (35 now, at most 50), named for roles, not values.

| Group | Tokens |
| --- | --- |
| Color | `--rte-bg`, `--rte-surface`, `--rte-surface-raised`, `--rte-fg`, `--rte-fg-muted`, `--rte-border`, `--rte-border-subtle`, `--rte-accent`, `--rte-accent-fg`, `--rte-accent-subtle`, `--rte-danger`, `--rte-selection-bg`, `--rte-control-hover`, `--rte-control-active`, `--rte-brand`, `--rte-brand-text` |
| Space | `--rte-space-1` to `--rte-space-4`, `--rte-control-size` (a control is at least 24 px, the WCAG 2.2 target size; 32 px by default) |
| Shape | `--rte-radius-s`, `--rte-radius-m`, `--rte-border-width` |
| Focus | `--rte-focus-color`, `--rte-focus-width`, `--rte-focus-offset` |
| Type | `--rte-font-ui`, `--rte-font-content`, `--rte-font-heading`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height` |
| Motion, depth | `--rte-motion-duration`, `--rte-shadow-popover` |

## Presets

`light`, `dark`, `auto` (follows the system, and `data-rte-scheme="light"` or `"dark"` overrides it), and `high-contrast`, each a small CSS file of token
values (under 1 KB gzipped). Density (`compact`, `comfortable`) changes space and control size, whatever the theme. The tests compute the contrast of every
pair in every theme: text is at least 4.5:1, the edges of controls and the focus ring at least 3:1. The brand is Rathkit's: Prussian blue and brass, with
Archivo for headings and Instrument Sans for text; fonts are named in the tokens but not loaded, so load them yourself or the system font is used.

## The style provider

Plain data, no code needed except for `parts`:

```ts
interface StyleProvider {
  theme?: string;                        // a preset name: sets data-rte-theme
  scheme?: "light" | "dark";
  density?: "compact" | "comfortable";
  tokens?: Partial<Record<TokenName, string>>;   // set on the root; beats the preset
  icons?: Record<string, string | (() => Node)>; // SVG markup you trust, or a function; the rest fall back to the defaults
  classes?: Partial<Record<PartName, string>>;   // extra classes on every element of a part
  messages?: Partial<Record<MessageKey, Message>>;// every word the interface says, by stable id: words, or plural forms
  locale?: string;                               // the interface's language: `lang`, plural rules, numbers
  dir?: "ltr" | "rtl";                           // the interface's direction; default: the page's
  parts?: { button?: (context) => HTMLElement }; // last resort: your own element for a button (it must still be accessible)
}
ui.setStyle(next);   // switch at run time: nothing is rebuilt
ui.setStyle({ ...next, ...pack });   // a message pack ({ locale, dir, messages }) is part of a style
```

Order of precedence: the defaults in `base.css` (light values, used only if no theme is loaded), then the preset, then `tokens`, then your CSS.
Icons are parsed by the browser inside a `<template>` and must be exactly one `<svg>` with no script or event handlers, or they are ignored and the item shows
its words instead. `messages` can rename any item (`item.bold`), a select's choices, a dialog's fields, the dialog buttons, and what is announced ("{label} on").
Other languages, plural forms, the keys and right-to-left interfaces are in [LOCALIZATION.md](LOCALIZATION.md).

## Accessibility the interface adds on the headless layer

A visible focus ring (on the editor, inside its border, while the writing area has the focus), a pressed state that does not rely on color (a thicker bottom edge and a border), tooltips with the key (`Bold (Ctrl+B)`; see below), forced-colors rendering with real borders and outlines, no animation when the person prefers reduced motion, and spoken confirmation
when a toggle is pressed. Controls keep their name from `aria-label`, so an icon-only toolbar is still named. The headless layer supplies roving focus,
`aria-pressed`, `aria-disabled`, and the dialog and menu behavior. The keyboard, contrast, motion and zoom audit, with a result for each surface, is [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Menus and tooltips

A `menu` item in the interface list is drawn as a button that opens a list of commands (the Table menu is one). It is the headless menu: arrow keys move through the entries, typing jumps to one, Enter or Space chooses, Escape closes and returns the focus to the button, and a click elsewhere closes it. An entry whose command is unavailable stays reachable and says `aria-disabled`; a toggle entry is a `menuitemcheckbox` with `aria-checked`, and a check mark in front of it so the state never depends on color. After a choice the focus goes back to the editor, and toggles are announced.

Tooltips are one shared element (`data-rte-part="tooltip"`, `role="tooltip"`) put under the control it is for. The tip shows after a pause when the pointer rests on a control and at once when the keyboard focuses it; it is dismissed with Escape (anywhere on the page) without moving the pointer or the focus; the pointer can move onto it without it going away; and it goes when the pointer or focus leaves. The words are the control's accessible name already, so the tip is not announced a second time. Controls carry the tip text in `data-rte-tip`.

## Selection toolbar and context menu

Both are off unless asked for: `createUi(editor, { root, selectionToolbar: true, contextMenu: true })`. They are made from interface items like the main toolbar, so they have the same names, icons, keys, dialogs and disabled and pressed states, and the same keyboard behavior from the headless layer.

The **selection toolbar** (`data-rte-part="floating"`, `role="toolbar"`) shows over selected text, or under it when there is no room above, and follows the page when it scrolls. It reads the `toolbar.floating` slot; when that slot is empty it is given bold, italic, underline, strike, code, link, unlink and clear formatting, copied from the main toolbar. It waits until the pointer is released, so it does not flicker while a selection is dragged; it stays away after a touch, where the browser draws its own handles and menu; and it hides when the caret is collapsed or the focus leaves the editor. Alt+F10 moves the focus into it (the arrow keys then move between controls), and Escape puts the focus back in the editor and hides it until the selection changes. A control's tip is dismissed by the first Escape, so closing the bar can take two.

The **context menu** opens on the right button, at the pointer (or at the selection, from the keyboard: Shift+F10 or the menu key), kept inside the window. The automated checks press the key in Chromium only; the other engines are covered by the hand-testing script. It reads the `menu.context` slot; when that slot is empty it is given undo, redo and the common formatting controls. It is a menu in the usual sense: arrow keys, type-ahead, Enter or Space to choose, Escape to close with the focus back in the editor. It replaces the browser's menu, which has spelling suggestions and the system's own entries, so two ways to the browser's menu are kept: Shift with the right button, and a touch long-press. Leave `contextMenu` off if those suggestions matter more than the shortcuts.

Either list is yours to change: add items to `toolbar.floating` or `menu.context` with `editor.ui.add` before creating the interface, and the defaults are not added. Words: `floating.label` and `context.label` name the two for assistive technology.

## As an element: `<rte-ui>`

`@rathkit/rte-ui/element` gives the same interface to the editor element, by attributes, for pages and frameworks that use `<rte-editor>` (from `@rathkit/rte-element`):

```html
<rte-ui theme="light" selection-toolbar context-menu>
  <rte-editor label="Notes"></rte-editor>
</rte-ui>
```

Register it with `import "@rathkit/rte-ui/element/define"` (or call `defineUi()` from `@rathkit/rte-ui/element`; the name is `rte-ui` unless you pass another). Load `base.css` and a theme's CSS as usual. The interface is drawn inside the `<rte-editor>`, so its value, form behavior, properties and events are unchanged.

Attributes: `theme`, `scheme` and `density` (changing them restyles at once); `selection-toolbar`, `context-menu` and `status="false"` (changing them builds the interface again; the document is kept). The `styleProvider` property takes everything attributes cannot say (icons, messages, tokens, classes), and `ui` is the interface once it is built. In a framework, use the element in a template like any custom element; it is checked in React, Vue, Angular and Svelte (see [ELEMENT.md](ELEMENT.md#in-a-framework), including the one Vue detail). The framework wrappers (`rte-react` and the others) stay without a styled interface; to give one of them the styled interface, call `createUi` with the editor it makes.

## Find bar and status line

When the editor has the find plugin, a bar sits between the toolbar and the writing area (`data-rte-part="findbar"`). It opens with the toolbar button or Mod-f, with the focus in the search box. Enter and Shift+Enter move between matches, Escape closes it and puts the focus back in the editor. It holds no search logic: it reads `find.set` and runs the `find.*` commands. Matches are painted with the page's highlight registry (`::highlight(rte-find)`, `rte-find-current`) where the browser has one, so nothing in the document changes; the match being looked at is the selection, and is painted 3:1 darker than the others so it is not told apart by hue alone. The count is announced once typing pauses.

A status line (`data-rte-part="status"`) under the writing area shows the words and characters, or the selected words against the whole. It is recounted at most a few times a second. Turn it off with `status: false`.

## HTML source

When the editor can give its HTML, a toolbar button (`source`) swaps the writing area for a text box with the document's HTML, one block to a line. Closing it with the button applies what was typed through `document.setHtml`, so it is read like anything pasted (what is not allowed is dropped) and is one undo step. Escape closes it and throws the changes away. While it is open the other buttons do nothing.

## Special characters and keyboard shortcuts

A Special characters menu inserts common symbols (currency, dashes, arrows, comparison signs) through `text.insert`. A Keyboard shortcuts button opens a dialog listing every command that has a key, read from the editor's own key map, so it follows whatever the host has rebound. When a list or a table takes Tab, it also says how to leave the writing area: Escape, then Tab (`shortcuts.leave`, `shortcuts.leaveKeys`).
