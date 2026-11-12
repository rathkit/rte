import type { Toolbar, ItemState, HeadlessEditor } from "@rathkit/rte-headless";
import type { Counts, UiItem } from "@rathkit/rte-core";
import type { TokenName } from "@rathkit/rte-themes";

/** The parts the interface is made of. Selectors and `classes` address them by these names (as `data-rte-part`). */
export type PartName =
  | "root" | "toolbar" | "button" | "select" | "separator" | "icon" | "label" | "content"
  | "menu-host" | "menu" | "menu-item" | "menu-separator" | "menu-keys" | "swatch" | "tooltip" | "status" | "source" | "shortcuts" | "floating" | "findbar" | "find-line" | "find-row" | "find-label" | "find-field" | "find-count"
  | "dialog" | "dialog-title" | "field-label" | "field-check" | "field" | "field-error" | "actions" | "action";

/** Words the interface says, by stable id. Each has a default in English; this table is also the way to translate it. */
export type MessageKey =
  | "toolbar.label" | "floating.label" | "context.label" | "dialog.ok" | "dialog.cancel" | "field.required" | "field.url"
  | "toggle.on" | "toggle.off"
  | "status.words" | "status.characters" | "status.selection"
  | "source.label" | "shortcuts.title" | "shortcuts.action" | "shortcuts.keys" | "shortcuts.close" | "shortcuts.leave" | "shortcuts.leaveKeys"
  | "find.find" | "find.replaceWith" | "find.previous" | "find.next" | "find.close" | "find.matchCase" | "find.wholeWord" | "find.replace" | "find.replaceAll" | "find.none" | "find.count" | "find.total"
  /**
   * Rename any item: `item.bold`, `item.link`; a select's choice: `item.block=1`; a dialog's field: `item.link.href`; a field's choice:
   * `item.image-properties.align=left`.
   */
  | `item.${string}`
  /** A command, as the keyboard shortcuts list names it: `command.format.bold`. */
  | `command.${string}`;

/**
 * Words that depend on a number: one form for each plural category the language has (the categories of `Intl.PluralRules`, such as
 * `one`, `two`, `few` and `many`), and `other`, which every language has and which is used when a form is missing.
 */
export interface PluralMessage {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/** What a key says: words, with `{name}` for a value, or a plural message. */
export type Message = string | PluralMessage;

/**
 * A language for the interface: plain data, kept in a module of its own so it is loaded only when it is wanted. It is a part of a style,
 * so `ui.setStyle({ ...style, ...pack })` puts it in place. Keys it lacks are said in English.
 */
export interface MessagePack {
  /** The language, as a BCP 47 tag (`de`, `ar`, `pt-BR`): it picks the plural rules and the way numbers are written. */
  readonly locale: string;
  /** Which way the language runs. `rtl` mirrors the toolbar, menus, tooltips and dialogs. Default: as the page around the editor. */
  readonly dir?: "ltr" | "rtl";
  readonly messages: Readonly<Partial<Record<MessageKey, Message>>>;
}

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
  /** Words, by stable id, over the English defaults. A plural message picks its form by the language in `locale`. */
  readonly messages?: Partial<Record<MessageKey, Message>>;
  /**
   * The interface's language (a BCP 47 tag): set as `lang` on the interface, not on the writing area, and used for plural rules and
   * numbers. Default: none, and English plural rules.
   */
  readonly locale?: string;
  /** The interface's direction, set as `dir` on the interface, not on the writing area. Default: as the page around the editor. */
  readonly dir?: "ltr" | "rtl";
  /** The one code hook, a last resort: replace the element of a part. It must follow the same accessibility rules. */
  readonly parts?: { readonly button?: (context: PartContext) => HTMLElement };
}

/** What the interface needs of an editor: the headless needs, and the element that is the editing surface. */
export type UiEditor = HeadlessEditor & {
  readonly element: HTMLElement;
  /** Words and characters, for the status line. Without it there is no status line. */
  counts?(): { readonly document: Counts; readonly selection: Counts };
  /** The document as HTML, for the source view. Without it there is no source view. */
  getHtml?(separator?: string): string;
  /** The part of the page between two positions, for painting matches. Without it matches are not painted. */
  rangeFor?(from: { path: number[]; offset: number }, to: { path: number[]; offset: number }): Range | null;
};

export interface UiOptions {
  /** The element the interface is built in. It gets the `rte-root` class. */
  readonly root: HTMLElement;
  readonly style?: StyleProvider;
  /** A line under the writing area with the number of words and characters. Default: on, when the editor can count. */
  readonly status?: boolean;
  /** Which set of interface items to draw. Default: the main toolbar. */
  readonly slot?: string;
  /**
   * A short row of formatting controls over selected text (the items of the `toolbar.floating` slot; when the slot is empty it gets the
   * common formatting controls). Default: off. It stays out of the way of touch selection, and Alt+F10 moves the focus into it.
   */
  readonly selectionToolbar?: boolean;
  /**
   * A menu of commands at the pointer on a right click (the items of the `menu.context` slot; when empty it gets undo, redo and the common
   * formatting controls). Default: off. It replaces the browser's menu, spelling suggestions included, so Shift + right click still opens the
   * browser's own, and a touch long-press is left to the browser.
   */
  readonly contextMenu?: boolean;
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
