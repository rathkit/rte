# Rathkit RTE: Headless-first UI architecture

Status: PROPOSAL, with the owner's decisions of 2026-10-22 applied (see "Decisions" at the end). Built so far (2026-10-23): the engine,
commands, key map and plugin host; the interface-item registry (`engine.ui`, in the core, filled by the editor and by plugins);
and `@rathkit/rte-headless` with the toolbar behavior, the announcer, disclosure/menu behavior (arrows, type-ahead, Escape, dismissal) and
the dialog behavior (native `<dialog>` or a focus-trapped fallback, field checks that link errors by `aria-describedby`). `@rathkit/rte-element` (`<rte-editor>`, `<rte-toolbar>`), `@rathkit/rte-ui` (the styled interface, see `UI.md`), `@rathkit/rte-themes` and `@rathkit/rte-icons`. Not built yet: the
React, Vue, Svelte, Angular and jQuery wrappers. The item descriptors live in the core, not in `rte-headless`, so that
a plugin can add items without depending on a user-interface package. Basis: the repo as it stands (`rte-core` model, edit, import, export, paste, `dom/view.ts`, `dom/render.ts`; `docs/DISTRIBUTION.md`), plus general web-platform and accessibility standards.

## 0. Recommendation in one paragraph

Build headless first, and make it the plugin API. Put the **command registry, state queries, subscriptions, keymap and plugin host inside `rte-core`** (about 6 KB of the 60 KB budget), because plugins and every UI depend on them. Put **interaction state machines and accessibility rules** (toolbar, menu, popover, dialog, live region) in a separate small package, `rte-headless`. Build the **styled UI** (`rte-ui`) as a plain-DOM consumer of `rte-headless`, with no privileged access. Ship themes as CSS-variable files (`rte-themes`) and icons as individually importable SVG strings (`rte-icons`). Wrappers (`rte-react`, `rte-vue`, `rte-svelte`) are thin adapters over one subscription primitive. If the styled UI cannot be built using only public headless APIs, the API is wrong; that test is the project's main quality gate.

## 1. Layering

```
rte-core          model, edit ops, import/export, paste, Editor view,
                  commands + state + subscriptions + keymap + plugin host     (no UI items)
rte-headless      UI-item descriptors, toolbar/menu/popover/dialog machines,
                  focus + ARIA + announcer rules                              (DOM helpers, no styles)
rte-ui            styled toolbar, menus, dialogs built on rte-headless        (JS + base CSS)
rte-themes        preset theme CSS files (token values only)
rte-icons         icon set, one module per icon
rte-element        <rte-editor> custom element (web components), the base for other wrappers
rte-react / rte-vue / rte-svelte / rte-angular / rte-jquery   adapters
rte-plugin-<name> (@rathkit) and @rathkit-pro/rte-plugin-<name>
```

Rules: arrows point only downward. Core knows nothing about toolbars. `rte-headless` knows nothing about CSS, class names or SVG. `rte-ui` imports only public exports of the packages above it, and CI enforces this with an import-graph check, the same way `check:zero-deps` works today.

Why not fold headless into core: UI-item descriptors, menu and dialog machines are not needed by server-side or embedded-without-chrome users, and the 60 KB budget is shared with the editing engine. Why not fold it into `rte-ui`: that is exactly what would force consumers to import styled code to get behavior.

### What is headless today

- Document model (`model.ts`), selection (`path.ts`: `Pos`, `Selection`), pure edit functions (`edit.ts`: `toggleMark`, `insertBlocks`, `deleteWord`, `rangeHasMark`, ...), import/export, and the paste pipeline with `PasteHandler`. All DOM-free and testable in Node.
- `Editor` (`dom/view.ts`): owns doc, selection, undo/redo, `canUndo`/`canRedo`, `readOnly`, one coarse `onChange`, and a few imperative commands (`toggle`, `undo`, `redo`, `paste`).

### What is missing for a real headless API

| Gap | Today | Needed |
|---|---|---|
| Named commands | Methods on `Editor`; `apply()` is private | Registry: name, run, state query, metadata |
| Command state | `rangeHasMark` exists as a pure function; `canUndo` is a getter | `{enabled, active, value}` per command, cached |
| Subscriptions | One `onChange` firing on every edit, no payload | Versioned snapshot; per-command and per-selector subscriptions |
| Selection events | `selectionchange` is read privately | Selection change reaches subscribers, deduped |
| Keymap | Hardcoded in `onKeyDown` | Registry of key chords to command names, with conflict reporting |
| Block and link commands | Not in `edit.ts` (no heading, list toggle, align, link set) | Pure functions first, then commands |
| Transactions | Plugins cannot run an edit | `ctx.apply(kind, op)` as a public method |
| UI machines | None | Menu, popover, dialog, toolbar in `rte-headless` |
| Focus and ARIA | `role=textbox`, `aria-multiline` only | Rules in section 5 |
| Plugin host | `pasteHandlers` option only | `Plugin` interface with commands, keybindings, UI items, handlers |

## 2. Headless API sketches

### 2.1 Commands and state

```ts
// rte-core
export interface CommandState<V = unknown> {
  readonly enabled: boolean;
  readonly active: boolean;      // e.g. bold at the caret
  readonly value?: V;            // e.g. current heading level, link href, color
}
export interface CommandDef<A = void, V = unknown> {
  readonly name: string;                               // "format.bold", "block.heading", "history.undo"
  run(ctx: CommandContext, arg: A): boolean;           // false = not applicable, nothing changed
  state?(snap: EditorSnapshot): CommandState<V>;       // pure, cheap, no DOM reads
  readonly label: string;                              // default English, overridable (i18n key = name)
}
export interface CommandContext {
  readonly snapshot: EditorSnapshot;
  apply(kind: string, op: (doc: Doc, sel: Selection) => EditResult): void;  // the public form of Editor.apply
  focus(): void;
}
export interface EditorSnapshot {                      // immutable, replaced per change
  readonly version: number;
  readonly doc: Doc; readonly selection: Selection;
  readonly readOnly: boolean; readonly focused: boolean;
}

editor.commands.run("format.bold");
editor.commands.state("format.bold");                  // { enabled, active }
```

Names are stable strings, namespaced (`format.*`, `block.*`, `list.*`, `history.*`, `insert.*`, plugin names prefixed with the plugin id). Typed through a module-augmentable `CommandMap` interface, so `run("block.heading", 2)` is checked and plugins extend it.

### 2.2 Subscriptions

One primitive, built on the snapshot:

```ts
editor.subscribe(listener: (snap: EditorSnapshot, prev: EditorSnapshot) => void): Unsubscribe;
editor.select<T>(selector: (s: EditorSnapshot) => T, onChange: (v: T) => void, equals = Object.is): Unsubscribe;
editor.commands.subscribe(name, onChange: (s: CommandState) => void): Unsubscribe;
```

Implementation rule: after each transaction, the host recomputes `state()` only for commands that have subscribers, compares shallowly with the cached value, and notifies only on difference. The same cached object is returned until it changes, so `getSnapshot` is stable (required by framework external-store primitives). Notifications are batched to one microtask. Typing a character must not wake the "bold" button unless bold's state changed.

### 2.3 UI item descriptors (data, not markup)

```ts
// rte-headless
export type UiItem =
  | { kind: "button"; id: string; command: string; arg?: unknown; icon?: IconName; label?: string; group?: string; order?: number }
  | { kind: "toggle" /* same fields; aria-pressed from state.active */ }
  | { kind: "menu"; id: string; label: string; icon?: IconName; items: UiItem[] }
  | { kind: "select"; id: string; command: string; options: { value: unknown; label: string }[] }   // heading level, font size
  | { kind: "dialog"; id: string; command: string; fields: Field[]; validate?(v): string | undefined } // link, image
  | { kind: "separator" };

export interface Field { name: string; type: "text" | "url" | "number" | "color" | "choice"; label: string; required?: boolean; initial?(snap): unknown }

editor.ui.items("toolbar.main"): readonly UiItem[];     // slot contents, ordered, filtered by plugin availability
editor.ui.subscribe("toolbar.main", cb);
```

Items reference commands by name only. Disabled and pressed state are never stored on the descriptor; they come from `commands.state`. Slots are named: `toolbar.main`, `toolbar.floating`, `menu.context`, `menu.slash`, `statusbar`. A consumer may ignore every item and call `commands.run` directly.

### 2.4 Keybindings

```ts
interface KeyBinding { key: string; command: string; arg?: unknown; when?: "always" | "selection" | "collapsed" }
// "Mod" resolves to Meta on Apple platforms, Ctrl elsewhere. Chords are normalized from event.key + modifiers.
editor.keymap.list(): KeyBinding[];     // so a UI can show shortcuts in tooltips and a help dialog
editor.keymap.override(binding | { key, command: null });  // consumers can rebind or unbind
```

Later registrations win only if they come from the consumer; two plugins claiming the same chord produce a dev-time warning and the first-registered wins. The keymap is the single source for tooltip text (`aria-keyshortcuts`).

### 2.5 Plugins

```ts
export interface Plugin {
  readonly id: string;                         // "rathkit.table" or "acme.mentions"
  readonly api: string;                        // supported plugin API range, checked at register (DISTRIBUTION 1.3 rule 6)
  setup(host: PluginHost): void | (() => void);
}
export interface PluginHost {
  readonly editor: EditorHandle;               // same object a consumer gets, nothing more
  command<A, V>(def: CommandDef<A, V>): void;
  keybinding(b: KeyBinding): void;
  ui(slot: string, item: UiItem): void;
  pasteHandler(h: PasteHandler): void;
  copyFormat(f: CopyFormatter): void;          // extra clipboard formats on copy, cut and drag
  blockType?(def: BlockTypeDef): void;         // model + render + import/export, for tables, embeds
}
```

Plugins receive `PluginHost` at `setup`, so they do not import `rte-core` at runtime (consistent with DISTRIBUTION 1.3 rule 5). A plugin never emits markup or CSS for its UI: it contributes descriptors and command logic. Therefore the same plugin appears in the styled toolbar, in a custom React toolbar built from `editor.ui.items`, or nowhere if the consumer ignores it. A paid plugin that needs a rich panel (e.g. a table grid picker) declares a `{kind: "panel"; name}` item, and each UI layer supplies a renderer for the panel name; headless consumers get the data and the commands (`table.insert`, args `{rows, cols}`) and can build their own picker.

Core plugins ship in `rte-core`'s repo but as separate entry points so the 60 KB core-without-plugins number is real.

## 3. Styled layer and theming

### 3.1 Mechanism

Plain CSS custom properties, no runtime, no preprocessor. Styled components are built from DOM elements carrying stable `data-rte-part` attributes (`toolbar`, `button`, `menu`, `menu-item`, `dialog`, `field`, `popover`, `content`). Selectors target those parts, never class names, so internal restructuring does not break themes.

- **Light DOM, not Shadow DOM.** Custom properties inherit through shadow boundaries, so tokens would work either way. The deciding factor is the editing surface: selection APIs across shadow roots are inconsistent in WebKit and Firefox, and `aria-labelledby`/`aria-controls` cannot cross roots. We keep everything in the light DOM and scope by `.rte-root`.
- **Cascade layers.** All shipped CSS lives in `@layer rathkit.base, rathkit.theme;`. Unlayered consumer CSS beats it without specificity fights.
- **Scoping.** Tokens are declared on `.rte-root` (or any `[data-rte-theme]` element), so two editors on one page differ by putting a different `data-rte-theme` or inline custom properties on each root. Never `:root` in shipped CSS.

### 3.2 Token set (documented, versioned, semantic)

Names use `--rte-` and describe roles, not values.

| Group | Tokens |
|---|---|
| Color | `--rte-bg`, `--rte-surface`, `--rte-surface-raised`, `--rte-fg`, `--rte-fg-muted`, `--rte-border`, `--rte-accent`, `--rte-accent-fg`, `--rte-danger`, `--rte-selection-bg`, `--rte-control-hover`, `--rte-control-active` |
| Space | `--rte-space-1` to `--rte-space-4`, `--rte-control-size` (hit target, min 24px per WCAG 2.2 target size; default 32px) |
| Shape | `--rte-radius-s`, `--rte-radius-m`, `--rte-border-width` |
| Focus | `--rte-focus-color`, `--rte-focus-width`, `--rte-focus-offset` |
| Type | `--rte-font-ui`, `--rte-font-content`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height` |
| Motion | `--rte-motion-duration`, set to 0 under `prefers-reduced-motion` |
| Depth | `--rte-shadow-popover` |

Density is a token bundle, not a separate system: `[data-rte-density="compact|comfortable"]` sets space and `--rte-control-size`. Cap: 50 tokens in v1. A token we cannot justify in docs does not ship.

### 3.3 Light, dark, forced colors

Presets define light values on `.rte-root` and dark values under `@media (prefers-color-scheme: dark)` guarded by `:where(.rte-root:not([data-rte-scheme="light"]))`, plus an explicit `[data-rte-scheme="dark"]` override. Under `@media (forced-colors: active)` the base layer maps tokens to system colors (`CanvasText`, `Canvas`, `Highlight`, `ButtonText`, `LinkText`) and draws borders on buttons and focus with real `outline` (not box-shadow, which vanishes). Pressed state must use a non-color cue (border or `aria-pressed` styling with an indicator), required by WCAG 1.4.1.

### 3.4 Presets and runtime switching

`rte-themes` ships `light`, `dark`, `auto` (follows OS), `compact`, `high-contrast`, each a standalone CSS file at 4 KB gzipped or less, and a small JS-free switch: set `data-rte-theme="name"` on the root. Themes are plain CSS files, so they are cacheable, self-hosted and CSP-friendly (no inline styles required; the inline-token path uses the CSSOM, `style.setProperty`, which CSP style-src permits).

### 3.5 Icons

`rte-icons` exports one module per icon: `export const bold = '<svg ...>'` (24x24 viewBox, `currentColor`, no fixed size). With `sideEffects: false` and named exports, bundlers drop unused icons; each is about 300 bytes. `rte-ui` imports only the icons it renders from a single internal `defaultIcons` map in a separate entry point (`rte-ui/icons-default`), so a consumer who supplies all icons never ships the default set. Icons are injected via a parsed `<template>` clone, never `innerHTML` of untrusted text; consumer SVG strings are the consumer's trust decision and documented as such.

### 3.6 The style provider contract

"Hooking into a style provider" means exactly this object, plain data, no code required:

```ts
export interface StyleProvider {
  theme?: string;                                          // preset name → sets data-rte-theme
  scheme?: "light" | "dark" | "auto";
  density?: "compact" | "comfortable";
  tokens?: Partial<Record<TokenName, string>>;             // applied as custom properties on the root
  icons?: Partial<Record<IconName, string | (() => Node)>>;// SVG string or factory; missing names fall back to defaults
  classes?: Partial<Record<PartName, string>>;             // extra classes appended per part (utility-class systems)
  messages?: Partial<Record<MessageKey, Message>>;         // labels, tooltips, announcements; words or plural forms (LOCALIZATION.md)
  parts?: Partial<Record<PartName, (ctx: PartContext) => HTMLElement>>;  // escape hatch: replace one part's element
}
createUi(editor, { root, style: provider });
ui.setStyle(next);                                         // runtime switch; diffs and updates, no remount
```

Resolution order: defaults, then preset, then `tokens`, then consumer CSS. `parts` is the only code hook and is deliberately last-resort; `PartContext` exposes the same headless state the default part uses, so a replacement part is still accessible if it follows the rules in section 5. The three consumer paths map cleanly: (1) `theme: "dark"`, (2) pass a `StyleProvider`, (3) skip `rte-ui` and use `rte-headless`.

## 4. Framework wrappers

Principle: wrappers contain zero editor logic and zero accessibility logic. They do three things: mount and destroy an `Editor`, expose subscriptions in the framework's reactive idiom, and render descriptors if the consumer wants help.

- React: `useEditor(options)`, `useCommand(editor, name)` implemented with `useSyncExternalStore(commands.subscribe, () => commands.state(name))`, `useSelector(editor, selector)`. Components `<Toolbar>` can render `ui.items()` using headless machines.
- Vue: composables returning `shallowRef` updated by `commands.subscribe`; disposed with `onScopeDispose`.
- Svelte: stores implementing `subscribe(run)` directly. Our `Unsubscribe`-returning signature is chosen to satisfy the Svelte store contract, so the store is a one-line adapter.
- Angular: a standalone component and directives that mount the editor outside Angular's change detection (`NgZone.runOutsideAngular`), with `commands.subscribe` bridged to signals. It also implements the forms `ControlValueAccessor` so it works with `ngModel` and reactive forms.
- Web components: `@rathkit/rte-element` registers `<rte-editor>` (and `<rte-toolbar>`). It uses the light DOM, like the styled UI, so selection and ARIA references behave. Attributes and properties mirror the options, events carry the state changes, and it joins forms through `ElementInternals`. It works in any page or framework with no build step, and the jQuery wrapper and server-rendered integrations sit on top of it.
- jQuery: a plugin (`$(el).rteEditor(options)`, with `.rteEditor("getHtml")`-style method calls and `rte:change` events) over the custom element, for pages that still use it.

Each wrapper is under its budget (see section 6) and needs only a conformance test: "after N edits, the number of re-renders of the bold button equals the number of bold state changes". Controlled value (`html` in/out) is deliberately limited to `onChange` plus `setHtml`, because round-tripping a document through a framework's state on every keystroke fights the caret.

## 5. Accessibility

### The headless layer guarantees (consumer cannot easily get this wrong)

1. **Toolbar machine** provides roving tabindex (one tab stop, arrows move, Home/End jump, Escape returns focus to the editor), `role="toolbar"`, `aria-orientation`, and wraps the item-to-element binding in a function `bindToolbar(root, items)` that sets `aria-pressed`, `aria-disabled` (not `disabled`, so disabled buttons remain focusable and discoverable) and `aria-keyshortcuts` from command state and keymap. Items without a label throw in development.
2. **Focus preservation.** Buttons never steal the editor selection: the machine cancels `mousedown` default on toolbar controls, and commands run against the stored model selection, then `ctx.focus()` returns to the editor. This is also why the model-owned selection matters.
3. **Menu and popover machines**: `aria-haspopup`, `aria-expanded`, `aria-controls`, arrow-key navigation, type-ahead, Escape closes and restores focus to the opener, outside-click and focus-out dismissal.
4. **Dialog machine**: focus moves in, Tab is trapped (or uses the native `<dialog>` with `showModal()` when available, which is preferred because it gives the inert background for free), labelled by title, Escape cancels, and focus returns to the invoking control (or to the editor if the opener is gone). Validation errors are linked with `aria-describedby` and announced.
5. **Announcer**: a single polite live region owned by the editor, `editor.announce(message)`, used for state changes with no visible focus move ("Bold on", "Link added", "Table 3 by 4 inserted"). Messages come from the `messages` table so they localize.
6. **Editor surface**: `role="textbox"`, `aria-multiline`, `aria-readonly` kept in sync, `aria-label` or `aria-labelledby` required at construction (warn in development), and `aria-describedby` for instructions on shortcuts.
7. **Motion**: machines never animate; they expose `data-state` attributes only, and animation is CSS gated by `prefers-reduced-motion`.

### Added only by the styled layer

Visible focus ring and 3:1 contrast tokens, minimum target size, forced-colors rendering, non-color pressed indicators, tooltips (shown on focus as well as hover, dismissible, hoverable per WCAG 1.4.13), and shipped default labels in English. The styled layer is tested with automated checks and manual screen-reader passes; the headless layer is tested by asserting ARIA output from the machines in a DOM test environment, since a custom UI cannot be tested by us.

## 6. Budgets and constraints

| Package | Gzipped budget (JS) | Notes |
|---|---|---|
| `rte-core` | 60 KB total, command/state/keymap/plugin host at most 7 KB of it | Core plugins stay at 15 KB or less each |
| `rte-headless` | 12 KB | Machines are small state tables plus DOM binders |
| `rte-ui` | 25 KB JS + 8 KB base CSS | Excludes icons |
| `rte-themes` | 4 KB per preset | Token values only |
| `rte-icons` | 0.4 KB per icon, about 14 KB for the full default set | Tree-shakeable |
| `rte-react`, `rte-vue`, `rte-svelte`, `rte-jquery` | 2 KB each | Externalize the framework as an optional peer |
| `rte-angular` | 3 KB | Components, directives and the forms accessor; Angular is an optional peer |
| `rte-element` | 4 KB | The custom element, with form association and the attribute and event mapping |

`pnpm check:size` already reads `rathkit.budgetGzipKB` per package; extend it to a `budgets` map per entry point. Everything is zero-dependency, self-hosted, with no network calls (the style provider takes strings and CSS, never URLs fetched at runtime; fonts are the consumer's). Free/paid: `rte-headless` and the plugin API are free; paid plugins register through `PluginHost` only. CI includes a test that a sample paid-style plugin, written outside the repo's internals, adds a command, keybinding, toolbar item and dialog that render in both `rte-ui` and a bare-bones custom UI. Behavior must hold in Chromium, Firefox and WebKit; the machine tests run in all three.

## 7. Risks, trade-offs, build order

**Costs.** The command, state, item and provider shapes become a public contract that is hard to change after 1.0. Two modes need testing: headless conformance and styled. **Mitigation:** mark the whole surface `experimental` until the styled UI and one paid-style plugin have shipped against it, and keep the styled UI as the first consumer.

**Benefits.** The plugin API stops being a separate artifact; paid plugins can add UI; frameworks get thin wrappers; the three theming paths are three levels of the same stack rather than three products.

**What can go wrong.**
- *Leaky abstraction:* descriptors cannot express a rich panel, so plugins add private DOM. Counter: the `panel` item with named renderers and the external plugin test.
- *Theming too weak:* tokens cannot restyle structure. Counter: `parts` escape hatch and stable `data-rte-part` selectors; do not add more token knobs to chase edge cases.
- *Theming too heavy:* a provider that becomes a runtime. Counter: the provider is data; the only code is `parts` and icon factories.
- *State churn:* command state recomputed on every keystroke. Counter: lazy evaluation for subscribed commands only, with a benchmark in CI at 100 KB of text.
- *Focus bugs from toolbar clicks* are the most common failure; machines own this once, not each consumer.

**Build order (from today's code).**
1. Extract `Editor.apply` into a public `ctx.apply`; add `EditorSnapshot` and `subscribe`/`select` to `Editor` (replaces `onChange`, keep as alias).
2. Add the missing pure edit functions (set block type, heading level, list toggle and indent, align, set link) in `edit.ts` with tests, since commands wrap them.
3. Command registry with `state()`; port `toggle`, `undo`, `redo`, `paste` into named commands; add `commands.subscribe` with caching.
4. Move `onKeyDown` bindings into the keymap registry.
5. `Plugin`/`PluginHost`; port the paste handler into it. Write the external-style sample plugin as a test.
6. `rte-headless`: toolbar machine and announcer first, then menu, popover, dialog.
7. `rte-ui` with base CSS and the `light` preset; token docs page; forced-colors and reduced-motion checks.
8. `rte-icons`, `rte-themes` remaining presets, `StyleProvider` and `setStyle`.
9. `rte-element` first, because the jQuery wrapper and any server-rendered integration sit on it, then `rte-react` (it exercises the external-store requirement hardest), then Vue, Svelte and Angular, then jQuery.
10. Integrations that come after v1: Blazor and AngularJS wrappers, and platform packages for WordPress, Laravel, Django, Ruby on Rails and similar, plus a Bootstrap-matched theme. The goal is to match the integrations that the leading commercial rich text editors offer. The list of integrations to match has not been compiled yet; it will be built in the private research area, not in this repo.

## Decisions

Decided by the owner on 2026-10-22. Where this differs from the default that was proposed, it says so.

| Decision | Result |
|---|---|
| Is the command/plugin host part of core's 60 KB? | Yes, at most 7 KB |
| Package name for the headless layer | `@rathkit/rte-headless`; styled is `@rathkit/rte-ui` |
| Shadow DOM or light DOM for styled UI | Light DOM with cascade layers and `data-rte-part` |
| Custom Elements wrapper (`<rte-editor>`) | **In v1** (was: later), as `@rathkit/rte-element` |
| Framework wrappers in v1 | **React, Vue, Svelte, Angular, web components and jQuery** (was: React, Vue, Svelte) |
| Token count cap and naming prefix | **50 tokens** (was: 40), `--rte-` |
| Whether `parts` (element replacement) ships in v1 | Yes, documented as last resort |
| Are `rte-icons` and `rte-themes` separate from `rte-ui` | Yes, separate packages |
| API stability label | `experimental` until the external-plugin test passes against both UIs |
| Plugin panels (rich UI from plugins) | Named `panel` items with per-UI renderers |
| Does the styled UI default to English labels only | Yes; other languages come as message packs with stable ids and plural forms, and only English ships (see `LOCALIZATION.md`) |
| Later integrations | Blazor, AngularJS, and platform packages (WordPress, Laravel, Django, Ruby on Rails and the like), a Bootstrap-matched theme. The aim is to match the integrations of the leading commercial editors; the list is still to be compiled |
