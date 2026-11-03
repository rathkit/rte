// Footnotes as a plugin: insert a note at the caret, jump between a reference and its note, and keep the notes list in step with the
// references after every edit. It uses only what any plugin gets from the host.
import type { Doc, Inline } from "../model.ts";
import type { Plugin } from "../plugin.ts";
import type { Path } from "../path.ts";
import { createReconciler } from "./reconcile.ts";

export interface FootnotesOptions {
  /** Ctrl+Alt+F inserts a note, Ctrl+Alt+Shift+F jumps between a reference and its note. Default on. */
  readonly keys?: boolean;
}

/** Where a reference with this id is, in reading order outside the notes list: the container and the offset just after it. */
function referenceAt(host: Parameters<Plugin["setup"]>[0], doc: Doc, id: string): { path: Path; offset: number } | undefined {
  const { ops } = host;
  for (const path of ops.containerPaths(doc)) {
    if (ops.isNotes(doc.blocks[path[0] as number])) continue;
    let offset = 0;
    for (const node of ops.getContent(doc, path)) {
      offset += node.type === "text" ? node.text.length : 1;
      if (node.type === "note" && node.id === id) return { path, offset };
    }
  }
  return undefined;
}

/** The reference next to the caret: just before it, or just after it. */
function nearby(content: readonly Inline[], offset: number): string | undefined {
  let at = 0;
  let found: string | undefined;
  for (const node of content) {
    const next = at + (node.type === "text" ? node.text.length : 1);
    if (node.type === "note" && (next === offset || at === offset)) found = found ?? node.id;
    at = next;
  }
  return found;
}

export function footnotes(options: FootnotesOptions = {}): Plugin {
  return {
    id: "rathkit.footnotes",
    api: "1",
    setup(host) {
      const { ops } = host;
      const reconcile = createReconciler(ops);
      host.normalize(reconcile);

      /** The note list item the position is in, when it is in a notes list. */
      const noteOf = (doc: Doc, path: Path): string | undefined => {
        const block = doc.blocks[path[0] as number];
        return block && ops.isNotes(block) && path.length >= 2 ? block.items[path[1] as number]?.id : undefined;
      };

      host.command({
        name: "footnote.insert", label: "Footnote",
        run: (ctx) => ctx.apply("footnote", (doc, sel) => {
          const here = ops.isCollapsed(sel) ? sel.focus.path : sel.anchor.path;
          if (ops.kindAt(doc, here) === "pre" || noteOf(doc, here) !== undefined || ops.isNotes(doc.blocks[here[0] as number])) return { doc, selection: sel };
          const cleared = ops.deleteSelection(doc, sel);
          const pos = cleared.selection.anchor;
          if (ops.kindAt(cleared.doc, pos.path) === "pre") return { doc, selection: sel };
          const used = new Set(ops.noteIds(cleared.doc));
          let n = used.size + 1;
          while (used.has(`n${n}`)) n++;
          const id = `n${n}`;
          const content = ops.getContent(cleared.doc, pos.path);
          const next = ops.normalizeInline([...ops.sliceInline(content, 0, pos.offset), { type: "note", id }, ...ops.sliceInline(content, pos.offset)]);
          const placed = reconcile(ops.setContent(cleared.doc, pos.path, next), ops.caret({ path: pos.path, offset: pos.offset + 1 }));
          // The caret goes into the new note, ready to be written.
          const block = placed.doc.blocks.findIndex((b) => ops.isNotes(b));
          const list = placed.doc.blocks[block];
          const index = list && ops.isNotes(list) ? list.items.findIndex((item) => item.id === id) : -1;
          return index === -1 ? placed : { doc: placed.doc, selection: ops.caret({ path: [block, index], offset: 0 }) };
        }),
        state: (snap) => {
          const path = snap.selection.focus.path;
          return { enabled: ops.kindAt(snap.doc, path) !== "pre" && noteOf(snap.doc, path) === undefined };
        },
      });

      // From a note to its reference, and from a reference (the caret beside it) to its note.
      host.command({
        name: "footnote.goto", label: "Go to footnote",
        mutates: false,
        run: (ctx) => {
          const snap = ctx.snapshot;
          const { path, offset } = snap.selection.focus;
          const inNote = noteOf(snap.doc, path);
          const id = inNote ?? nearby(ops.getContent(snap.doc, path), offset);
          if (id === undefined) return false;
          const target = inNote !== undefined ? referenceAt(host, snap.doc, id) : (() => {
            const b = snap.doc.blocks.findIndex((block) => ops.isNotes(block));
            const list = snap.doc.blocks[b];
            const i = list && ops.isNotes(list) ? list.items.findIndex((item) => item.id === id) : -1;
            return i === -1 ? undefined : { path: [b, i], offset: 0 };
          })();
          if (!target) return false;
          const there = ops.caret({ path: target.path, offset: target.offset });
          return ctx.apply("footnote-goto", (doc) => ({ doc, selection: there }));
        },
        state: (snap) => {
          const { path, offset } = snap.selection.focus;
          return { enabled: noteOf(snap.doc, path) !== undefined || nearby(ops.getContent(snap.doc, path), offset) !== undefined };
        },
      });

      // Copying text that has a reference takes the note with it, so pasting it elsewhere brings the note too.
      host.copyFormat((blocks) => {
        const wanted = ops.noteIds({ blocks });
        const list = host.editor.snapshot.doc.blocks.find((b) => ops.isNotes(b));
        if (wanted.length === 0 || !list || !ops.isNotes(list) || blocks.some((b) => ops.isNotes(b))) return undefined;
        const items = wanted.flatMap((id) => list.items.filter((item) => item.id === id));
        return items.length === 0 ? undefined : { "text/html": ops.exportHtml({ blocks: [...blocks, { ...list, items }] }) };
      });

      // Pasted notes whose ids are already in use here get ids of their own (a second Markdown text with a `[^1]`, say).
      host.pasteTransform((blocks) => {
        const pasted = blocks.flatMap((b) => (ops.isNotes(b) ? b.items.map((item) => item.id ?? "") : []));
        const taken = new Set([...ops.noteIds(host.editor.snapshot.doc), ...ops.noteIds({ blocks })]);
        const rename = new Map<string, string>();
        let n = taken.size;
        for (const id of pasted) {
          if (id === "" || rename.has(id) || !ops.noteIds(host.editor.snapshot.doc).includes(id)) continue;
          while (taken.has(`n${++n}`)) { /* the next free id */ }
          taken.add(`n${n}`);
          rename.set(id, `n${n}`);
        }
        if (rename.size === 0) return blocks;
        let doc: Doc = { blocks: blocks.map((b) => (ops.isNotes(b) ? { ...b, items: b.items.map((item) => (item.id !== undefined && rename.has(item.id) ? { ...item, id: rename.get(item.id) as string } : item)) } : b)) };
        for (const path of ops.containerPaths(doc)) {
          const content = ops.getContent(doc, path);
          if (content.some((node) => node.type === "note" && rename.has(node.id))) doc = ops.setContent(doc, path, content.map((node): Inline => (node.type === "note" && rename.has(node.id) ? { type: "note", id: rename.get(node.id) as string } : node)));
        }
        return doc.blocks;
      });

      if (options.keys ?? true) {
        host.keybinding({ key: "Mod-Alt-f", command: "footnote.insert" });
        host.keybinding({ key: "Mod-Alt-Shift-f", command: "footnote.goto" });
      }
      host.ui("toolbar.main", { kind: "button", id: "footnote", command: "footnote.insert", icon: "footnote", group: "insert", order: 4 });
    },
  };
}
