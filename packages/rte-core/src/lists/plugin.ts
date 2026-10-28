// Lists as a plugin: bulleted, numbered and definition lists, Tab to move items, Enter and Backspace in items, and the typed
// shortcuts. It uses only what any plugin gets from the host.
import type { Plugin } from "../plugin.ts";
import type { UiItem } from "../ui.ts";
import { listCommands, listKeys, taskKeys } from "./commands.ts";
import { definitionBehavior } from "./definitions.ts";
import { LIST_STYLES, listBehavior, listShortcut } from "./lists.ts";

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
      host.ui("toolbar.main", { kind: "toggle", id: "list-bulleted", command: "list.bulleted", icon: "list-bulleted", group: "lists", order: 1 });
      host.ui("toolbar.main", { kind: "toggle", id: "list-numbered", command: "list.numbered", icon: "list-numbered", group: "lists", order: 2 });
      // The marker of the list the caret is in, and the number a numbered list starts at.
      const STYLE_LABELS: Readonly<Record<string, string>> = {
        decimal: "1, 2, 3", "decimal-leading-zero": "01, 02, 03", "lower-alpha": "a, b, c", "upper-alpha": "A, B, C", "lower-roman": "i, ii, iii",
        "upper-roman": "I, II, III", "lower-greek": "α, β, γ", disc: "Disc", circle: "Circle", square: "Square",
      };
      host.ui("toolbar.main", {
        kind: "menu", id: "list-style", label: "List style", icon: "list-numbered", group: "lists", order: 5,
        items: [
          { kind: "toggle", id: "list-style-default", command: "list.style", arg: "", label: "Default" },
          ...[...LIST_STYLES.ol, ...LIST_STYLES.ul].map((name): UiItem => ({ kind: "toggle", id: `list-style-${name}`, command: "list.style", arg: name, label: STYLE_LABELS[name] ?? name })),
          { kind: "separator", id: "list-style-sep" },
          { kind: "button", id: "list-paragraph", command: "list.paragraph" },
          { kind: "dialog", id: "list-start", command: "list.start", label: "Start at…", fields: [{ name: "start", type: "number", label: "Start counting at (empty for 1)" }] },
        ],
      });
      host.ui("toolbar.main", { kind: "toggle", id: "list-check", command: "list.checklist", icon: "checklist", group: "lists", order: 4 });
      host.ui("toolbar.main", { kind: "toggle", id: "list-definition", command: "list.definition", icon: "list-definition", group: "lists", order: 3 });
      if (options.indentOnTab ?? true) for (const key of listKeys) host.keybinding(key);
      for (const key of taskKeys) host.keybinding(key);
      host.behavior("li", listBehavior);
      host.behavior("dt", definitionBehavior);
      host.behavior("dd", definitionBehavior);
      if (options.shortcuts ?? true) host.textTrigger((doc, sel, typed) => (typed === " " ? listShortcut(doc, sel) : undefined));
    },
  };
}
