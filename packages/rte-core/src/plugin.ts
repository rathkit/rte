// The plugin contract. A plugin never imports the editor at run time: it is handed the editor and a toolkit of the
// editing operations when it is set up, and may import types from here for checking. EXPERIMENTAL: this surface can
// still change until the same plugin has been shown to work with both a custom interface and the styled one.
import type { CommandDef, Unsubscribe } from "./commands.ts";
import type { Engine } from "./engine.ts";
import type { KeyBinding } from "./keymap.ts";
import type { Ops } from "./ops.ts";
import type { PasteHandler } from "./paste.ts";

export const PLUGIN_API_VERSION = 1;

/** What a plugin sees of the editor: the same object a host gets, nothing more. */
export type EditorHandle = Pick<Engine, "snapshot" | "apply" | "commands" | "subscribe" | "select" | "keymap" | "warn">;

export interface PluginHost {
  readonly editor: EditorHandle;
  /** The editing operations, so a plugin does not import the editor to use them. */
  readonly ops: Ops;
  command<A, V>(def: CommandDef<A, V>): void;
  keybinding(binding: KeyBinding): void;
  pasteHandler(handler: PasteHandler): void;
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
