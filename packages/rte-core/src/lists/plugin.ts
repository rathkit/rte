// Lists as a plugin: bulleted, numbered and definition lists, Tab to move items, Enter and Backspace in items, and the typed
// shortcuts. It uses only what any plugin gets from the host.
import type { Plugin } from "../plugin.ts";
import { listCommands, listKeys } from "./commands.ts";
import { definitionBehavior } from "./definitions.ts";
import { listBehavior, listShortcut } from "./lists.ts";

export interface ListsOptions {
  /** Deepest allowed nesting of lists. Default: no limit. */
  readonly maxDepth?: number;
  /** Tab and Shift+Tab move items in and out. Off: the browser keeps Tab for moving focus. Default on. */
  readonly indentOnTab?: boolean;
  /** Typing `* `, `- ` or `1. ` at the start of a paragraph starts a list. Default on. */
  readonly shortcuts?: boolean;
}

export function lists(options: ListsOptions = {}): Plugin {
  return {
    id: "rathkit.lists",
    api: "1",
    setup(host) {
      for (const command of listCommands(options.maxDepth ?? Number.POSITIVE_INFINITY)) host.command(command);
      if (options.indentOnTab ?? true) for (const key of listKeys) host.keybinding(key);
      host.behavior("li", listBehavior);
      host.behavior("dt", definitionBehavior);
      host.behavior("dd", definitionBehavior);
      if (options.shortcuts ?? true) host.textTrigger((doc, sel, typed) => (typed === " " ? listShortcut(doc, sel) : undefined));
    },
  };
}
