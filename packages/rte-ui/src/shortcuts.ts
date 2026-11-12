// A list of the keys the editor answers to, read from the editor's own key map so it is never out of date: what each does, and the key.
import { createDialog, type Dialog } from "@rathkit/rte-headless";
import { keyOf } from "./messages.ts";
import type { UiEditor } from "./types.ts";

export interface ShortcutsOptions {
  readonly editor: UiEditor;
  readonly root: HTMLElement;
  readonly part: <E extends HTMLElement>(el: E, name: string) => E;
  readonly message: (key: string, fallback?: string) => string;
}

export interface Shortcuts {
  open(opener: HTMLElement): void;
  /** Words may have changed: write them again. */
  refresh(): void;
  destroy(): void;
}

let counter = 0;

export function createShortcuts(options: ShortcutsOptions): Shortcuts {
  const { editor, root, message } = options;
  const element = options.part(document.createElement("dialog"), "dialog");
  const titleId = `rte-shortcuts-title-${++counter}`;
  element.setAttribute("aria-labelledby", titleId);
  element.setAttribute("data-rte-shortcuts", "");
  const title = options.part(document.createElement("h2"), "dialog-title");
  title.id = titleId;
  const table = options.part(document.createElement("table"), "shortcuts");
  const actions = options.part(document.createElement("div"), "actions");
  const done = options.part(document.createElement("button"), "action");
  done.type = "button";
  done.setAttribute("data-primary", "");
  actions.appendChild(done);
  element.append(title, table, actions);
  root.appendChild(element);
  const from = { opener: null as HTMLElement | null };
  const dialog: Dialog = createDialog({ dialog: element, editor, get opener() { return from.opener; } });
  done.addEventListener("click", () => dialog.close("cancel"));

  const words = (): void => {
    title.textContent = message("shortcuts.title");
    done.textContent = message("shortcuts.close");
  };
  words();

  /** One row for each command that has a key, in the order the keys were added. */
  const fill = (): void => {
    const labels = new Map(editor.commands.list().map((c) => [c.name, c.label]));
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const key of ["shortcuts.action", "shortcuts.keys"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = message(key);
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    const seen = new Set<string>();
    for (const binding of editor.keymap.list()) {
      if (seen.has(binding.command)) continue;
      seen.add(binding.command);
      const keys = editor.keymap.shortcutFor(binding.command);
      if (!keys) continue;
      const row = document.createElement("tr");
      const what = document.createElement("td");
      what.textContent = message(keyOf.command(binding.command), labels.get(binding.command) ?? binding.command);
      const how = document.createElement("td");
      const kbd = document.createElement("kbd");
      kbd.textContent = keys;
      how.appendChild(kbd);
      row.append(what, how);
      body.appendChild(row);
    }
    table.replaceChildren(head, body);
  };

  return {
    open(opener) {
      from.opener = opener;
      fill();
      dialog.open();
    },
    refresh: words,
    destroy() { dialog.destroy(); element.remove(); },
  };
}
