import type { Toolbar, ItemState, HeadlessEditor } from "@rathkit/rte-headless";
import type { UiItem } from "@rathkit/rte-core";
import type { TokenName } from "@rathkit/rte-themes";

/** The parts the interface is made of. Selectors and `classes` address them by these names (as `data-rk-part`). */
export type PartName =
  | "root" | "toolbar" | "button" | "select" | "separator" | "icon" | "label" | "content"
  | "menu-host" | "menu" | "menu-item" | "menu-separator" | "menu-keys" | "tooltip"
  | "dialog" | "dialog-title" | "field-label" | "field" | "field-error" | "actions" | "action";

/** Words the interface says. Each has a default in English; this table is also the way to translate it. */
export type MessageKey =
  | "toolbar.label" | "dialog.ok" | "dialog.cancel" | "field.required" | "field.url"
  | "toggle.on" | "toggle.off"
  /** Rename any item: `item.bold`, `item.link`, and so on. */
  | `item.${string}`;

/** What a replacement part gets: the same headless state the default part uses, and a way to run the item. */
export interface PartContext {
  readonly item: UiItem;
  readonly state: ItemState;
  /** Runs the item's command (a toggle or button) or, for a select, with the chosen value. */
  run(value?: unknown): boolean;
}

/** Everything about how the interface looks, as plain data. No code is needed for the first four. */
export interface StyleProvider {
  /** A preset name from `@rathkit/rte-themes` (`light`, `dark`, `auto`, `high-contrast`). Load that theme's CSS file. */
  readonly theme?: string;
  readonly scheme?: "light" | "dark";
  readonly density?: "compact" | "comfortable";
  /** Token values, applied as custom properties on the root: beats the preset. */
  readonly tokens?: Partial<Record<TokenName, string>>;
  /** SVG markup (trusted: it is yours) or a function that makes a node. Missing names fall back to the defaults, if any. */
  readonly icons?: Readonly<Record<string, string | (() => Node)>>;
  /** Extra classes added to every element of a part, for utility-class systems. */
  readonly classes?: Partial<Record<PartName, string>>;
  readonly messages?: Partial<Record<MessageKey, string>>;
  /** The one code hook, a last resort: replace the element of a part. It must follow the same accessibility rules. */
  readonly parts?: { readonly button?: (context: PartContext) => HTMLElement };
}

/** What the interface needs of an editor: the headless needs, and the element that is the editing surface. */
export type UiEditor = HeadlessEditor & { readonly element: HTMLElement };

export interface UiOptions {
  /** The element the interface is built in. It gets the `rk-root` class. */
  readonly root: HTMLElement;
  readonly style?: StyleProvider;
  /** Which set of interface items to draw. Default: the main toolbar. */
  readonly slot?: string;
  /**
   * Style that every `setStyle` is layered on top of: icons and messages given here stay unless the new style gives the same name.
   * This is how the standard interface keeps its default icons when the theme is switched.
   */
  readonly defaults?: Pick<StyleProvider, "icons" | "messages">;
}

export interface Ui {
  readonly root: HTMLElement;
  readonly toolbar: Toolbar;
  /** Changes how the interface looks, now: nothing is rebuilt. */
  setStyle(next: StyleProvider): void;
  /** Says something to assistive technology. */
  announce(message: string): void;
  destroy(): void;
}
