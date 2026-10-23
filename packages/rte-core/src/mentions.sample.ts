// A sample plugin written the way an outside (or paid) plugin has to be: it imports types only, and gets everything else
// from the host it is handed. It adds one command, `acme.shout`, that upper-cases the selected text, and a key for it.
import type { Plugin } from "./plugin.ts";

export const shout: Plugin = {
  id: "acme.shout",
  api: ">=1 <2",
  setup(host) {
    host.command<void, never>({
      name: "acme.shout",
      label: "Shout",
      run: (ctx) =>
        ctx.apply("shout", (doc, sel) => {
          // Replace the selected text with its upper-case form, keeping the marks of the text before it.
          const text = host.ops.selectedText(doc, sel);
          return text === "" ? { doc, selection: sel } : host.ops.insertText(doc, sel, text.toUpperCase());
        }),
      state: (snap) => ({ enabled: host.ops.selectedText(snap.doc, snap.selection) !== "" }),
    });
    host.keybinding({ key: "Mod-Shift-u", command: "acme.shout" });
  },
};
