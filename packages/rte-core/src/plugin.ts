// The plugin contract. A plugin never imports the editor at run time: it is handed the editor and a toolkit of the
// editing operations when it is set up, and may import types from here for checking. EXPERIMENTAL: this surface can
// still change until the same plugin has been shown to work with both a custom interface and the styled one.
import type { ContainerBehavior, ContainerKind, TextTrigger } from "./behaviors.ts";
import type { CommandDef, Unsubscribe } from "./commands.ts";
import type { Engine } from "./engine.ts";
import type { ImportOptions } from "./import.ts";
import type { KeyBinding } from "./keymap.ts";
import type { Block } from "./model.ts";
import type { Ops } from "./ops.ts";
import type { PasteHandler } from "./paste.ts";

export const PLUGIN_API_VERSION = 1;

/** Looks at blocks about to be pasted and returns the blocks to insert. May take time (an upload); then the paste waits. */
export type PasteTransform = (blocks: readonly Block[]) => readonly Block[] | Promise<readonly Block[]>;

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
export type EditorHandle = Pick<Engine, "snapshot" | "apply" | "commands" | "subscribe" | "select" | "keymap" | "warn" | "importOptions">;

export interface PluginHost {
  readonly editor: EditorHandle;
  /** The editing operations, so a plugin does not import the editor to use them. */
  readonly ops: Ops;
  command<A, V>(def: CommandDef<A, V>): void;
  keybinding(binding: KeyBinding): void;
  pasteHandler(handler: PasteHandler): void;
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
}

export interface Plugin {
  /** Unique and namespaced: `rathkit.table`, `acme.mentions`. Command names should start with it. */
  readonly id: string;
  /** The plugin API versions it supports: `1`, `1.x`, or a range such as `>=1 <3`. A mismatch fails when it is added. */
  readonly api: string;
  setup(host: PluginHost): void | Unsubscribe;
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
