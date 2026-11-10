// The plugin contract. A plugin never imports the editor at run time: it is handed the editor and a toolkit of the
// editing operations when it is set up, and may import types from here for checking. EXPERIMENTAL: this surface can
// still change until the same plugin has been shown to work with both a custom interface and the styled one.
import type { ContainerBehavior, ContainerKind, TextTrigger } from "./behaviors.ts";
import type { CommandDef, Unsubscribe } from "./commands.ts";
import type { Engine } from "./engine.ts";
import type { ImportOptions } from "./import.ts";
import type { KeyBinding } from "./keymap.ts";
import type { Block, Doc } from "./model.ts";
import type { EditResult, Pos, Selection } from "./path.ts";
import type { UiItem, UiSlot } from "./ui.ts";
import type { Ops } from "./ops.ts";
import type { PasteHandler } from "./paste.ts";

export const PLUGIN_API_VERSION = 1;

/** Looks at blocks about to be pasted and returns the blocks to insert. May take time (an upload); then the paste waits. */
export type PasteTransform = (blocks: readonly Block[]) => readonly Block[] | Promise<readonly Block[]>;

/**
 * Gives the formats a copy, cut or drag writes besides the editor's own HTML and plain text: `{ "text/markdown": "..." }`.
 * Return a format the editor already writes (`text/plain`, `text/html`) to replace it. Return undefined to add nothing.
 * Called once per copy with the selected blocks; it must be quick and must not change the document.
 */
export type CopyFormatter = (blocks: readonly Block[]) => Readonly<Record<string, string>> | undefined;

/**
 * Puts right what an edit left, such as a footnote whose reference was deleted. Runs after every edit that changes the document, on
 * the result, and returns the document and selection to use; the repair is part of the same undo step. It must be quick, and
 * must return the same document when there is nothing to put right.
 */
export type Normalizer = (doc: Doc, selection: Selection) => EditResult;

/** What changed in the editor, as the page-facing part of a plugin hears of it. */
export interface ViewChange {
  readonly docChanged: boolean;
  readonly selectionChanged: boolean;
  /** The editor gained or lost the focus. */
  readonly focusMoved: boolean;
}

/**
 * What the browser view gives the page-facing part of a plugin. Types that name the page (`HTMLElement`, `Node`) are written
 * as `object` here so this file stays free of the DOM; the plugin's view file knows what they are.
 */
export interface ViewHost {
  /** The element the editor is drawn in (an `HTMLElement`). */
  readonly element: object;
  readonly engine: Engine;
  readonly ops: Ops;
  /** Adds an event listener that is taken away again when the editor or the plugin is. */
  listen(target: object, type: string, handler: (event: never) => void): void;
  /** Called after the page was changed by the plugin itself, so the editor does not take it for a change from outside. */
  quiet(): void;
  /**
   * Shows the selection the editor holds as a caret at its end on the page, so a touch screen draws no handles and no Copy menu of its
   * own over it (a picked image, say). The editor's own selection is unchanged. It ends when the person moves the caret or touches
   * anything but an image, or when the editor's selection changes.
   */
  holdSelection(): void;
  /** Called after the editor has drawn each change. */
  onChange(listener: (change: ViewChange) => void): Unsubscribe;
  /** The position in the document for a place in the page (`Node`, offset), or null. */
  posFromDom(node: object, offset: number): Pos | null;
  /** The place in the page (`Node`, offset) for a position in the document, or null. */
  domFromPos(pos: Pos): { readonly node: object; readonly offset: number } | null;
}

/** The page-facing part of a plugin: set up once the editor has a page, returns what takes it away again. */
export type ViewExtension = (host: ViewHost) => void | Unsubscribe;

/** What a plugin needs of a file that was pasted or dropped. A browser `File` fits. */
export interface BlobLike {
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface FileLike extends BlobLike {
  readonly name: string;
  slice(start?: number, end?: number): BlobLike;
  text(): Promise<string>;
}

/** Turns pasted or dropped files into blocks, or returns undefined if it does not handle them. */
export type FileHandler = (files: readonly FileLike[]) => readonly Block[] | undefined | Promise<readonly Block[] | undefined>;

/** What a plugin sees of the editor: the same object a host gets, nothing more. */
export type EditorHandle = Pick<Engine, "snapshot" | "apply" | "commands" | "subscribe" | "select" | "keymap" | "warn" | "report" | "importOptions" | "ui">;

export interface PluginHost {
  readonly editor: EditorHandle;
  /** The editing operations, so a plugin does not import the editor to use them. */
  readonly ops: Ops;
  command<A, V>(def: CommandDef<A, V>): void;
  keybinding(binding: KeyBinding): void;
  pasteHandler(handler: PasteHandler): void;
  /** Adds a repair that runs after every edit that changes the document. */
  normalize(normalizer: Normalizer): void;
  /** Adds formats to what copy, cut and drag write to the clipboard. Later plugins win when two give the same type. */
  copyFormat(formatter: CopyFormatter): void;
  /** Takes over Enter, Backspace at the start, and paste inside a kind of container the plugin owns. One plugin per kind. */
  behavior(kind: ContainerKind, behavior: ContainerBehavior): void;
  /** Watches typed text before it is inserted, to turn a shortcut into something else. */
  textTrigger(trigger: TextTrigger): void;
  /** Adds to how HTML is imported everywhere (loading, paste, drop): an SVG cleaner, recognizers for a source's markup. */
  importOptions(options: Pick<ImportOptions, "sanitizeSvg" | "recognizers">): void;
  /** Changes pasted blocks before they are inserted. */
  pasteTransform(transform: PasteTransform): void;
  /** Handles pasted and dropped files. */
  fileHandler(handler: FileHandler): void;
  /** Puts an item in a place a user interface can read, such as the main toolbar. The item names a command; it holds no markup. */
  ui(slot: UiSlot, item: UiItem): void;
}

export interface Plugin {
  /** Unique and namespaced: `rathkit.table`, `acme.mentions`. Command names should start with it. */
  readonly id: string;
  /** The plugin API versions it supports: `1`, `1.x`, or a range such as `>=1 <3`. A mismatch fails when it is added. */
  readonly api: string;
  setup(host: PluginHost): void | Unsubscribe;
  /** Only in a browser: the part that draws and handles things on the page (table handles, say). The engine never calls it. */
  readonly view?: ViewExtension;
}

/** Whether a version satisfies a range written as `N`, `N.x`, `>=N`, `<N` or a pair like `>=1 <3`. */
export function satisfiesApi(range: string, version: number): boolean {
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const m = /^(>=|<=|>|<|=)?(\d+)(?:\.x|\.\d+)*$/.exec(part);
    if (!m) return false;
    const n = Number(m[2]);
    switch (m[1]) {
      case ">=": return version >= n;
      case "<=": return version <= n;
      case ">": return version > n;
      case "<": return version < n;
      default: return version === n;
    }
  });
}
