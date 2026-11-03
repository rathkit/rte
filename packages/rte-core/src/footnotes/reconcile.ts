// Keeps the notes list and the references in step. A reference is an inline `note`; its note is the item of the notes list with the same
// id. After every edit this puts right what the edit could not know about: a deleted reference takes its note with it (kept for a moment, so
// a cut and paste brings the text back), a new reference gets an empty note, the notes follow the order of the references, there is one
// notes list, and an item that has no id of its own (Enter in a note made one) goes back into the note before it as another paragraph.
import type { Block, Doc, Inline, List, ListItem, ItemChild } from "../model.ts";
import type { Ops } from "../ops.ts";
import type { EditResult, Pos, Selection } from "../path.ts";

type Notes = List & { notes: true };

/** Where an old item of a notes list went: its place in the new list, and how far its text and children moved. */
interface Moved { readonly index: number; readonly add: number; readonly childAdd: number }

const MAX_KEPT = 64;

export function createReconciler(ops: Ops): (doc: Doc, sel: Selection) => EditResult {
  const kept = new Map<string, ListItem>();
  const keep = (id: string, item: ListItem): void => {
    kept.delete(id);
    kept.set(id, item);
    if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value as string);
  };
  const paragraph: Inline = { type: "br", paragraph: true };

  /** Another paragraph of the same note. Text after children becomes a paragraph child, so the order of the note is kept. */
  const join = (a: ListItem, b: ListItem): { item: ListItem; add: number; childAdd: number } => {
    if (a.children.length > 0 && b.content.length > 0) {
      const text: ItemChild = { type: "p", content: b.content };
      return { item: { ...a, children: [...a.children, text, ...b.children] }, add: 0, childAdd: a.children.length };
    }
    // The break is kept even when the new paragraph is still empty (Enter at the end of a note).
    const both = a.content.length > 0;
    return {
      item: { ...a, content: ops.normalizeInline([...a.content, ...(both ? [paragraph] : []), ...b.content]), children: [...a.children, ...b.children] },
      add: both ? ops.inlineLength(a.content) + 1 : ops.inlineLength(a.content), childAdd: a.children.length,
    };
  };

  return (doc, sel) => {
    let current = doc;
    const found = ops.noteIds(current);
    const lists = current.blocks.flatMap((block, b) => (ops.isNotes(block) ? [b] : []));
    if (found.length === 0 && lists.length === 0) return { doc, selection: sel };

    // A reference repeated (pasted while the original is still there) becomes a reference to a copy of the note.
    const copies = new Map<string, string>();
    if (new Set(found).size !== found.length) {
      const used = new Set(found);
      const seen = new Set<string>();
      const fresh = (): string => { for (let n = used.size + 1; ; n++) if (!used.has(`n${n}`)) { used.add(`n${n}`); return `n${n}`; } };
      for (const path of ops.containerPaths(current)) {
        if (lists.includes(path[0] as number)) continue;
        const content = ops.getContent(current, path);
        if (!content.some((n) => n.type === "note" && seen.has(n.id))) { for (const n of content) if (n.type === "note") seen.add(n.id); continue; }
        current = ops.setContent(current, path, content.map((n): Inline => {
          if (n.type !== "note") return n;
          if (!seen.has(n.id)) { seen.add(n.id); return n; }
          const id = fresh();
          copies.set(id, n.id);
          return { type: "note", id };
        }));
      }
    }
    const ids = ops.noteIds(current);

    // The notes now in the document, as one run of items; an item with no id of its own continues the one before it.
    const groups = new Map<string, ListItem>();
    const moved = new Map<number, Moved>();
    // Items before the first note that has an id join it (or the first reference's note, when none has an id).
    let lead: ListItem | undefined;
    const leading: number[] = [];
    let last: string | undefined;
    let flat = 0;
    const order = ids.filter((id, i) => ids.indexOf(id) === i);
    for (const b of lists) {
      (current.blocks[b] as Notes).items.forEach((item) => {
        const id = item.id;
        if (id !== undefined && !groups.has(id)) {
          const joined = lead ? join(lead, item) : { item, add: 0, childAdd: 0 };
          groups.set(id, joined.item === item ? item : { ...joined.item, id });
          last = id;
          for (const n of leading) moved.set(n, { index: order.indexOf(id), add: moved.get(n)?.add ?? 0, childAdd: 0 });
          moved.set(flat, { index: order.indexOf(id), add: joined.add, childAdd: joined.childAdd });
          lead = undefined;
          leading.length = 0;
        } else if (last !== undefined) {
          const { item: next, add, childAdd } = join(groups.get(last) as ListItem, item);
          groups.set(last, next);
          moved.set(flat, { index: order.indexOf(last), add, childAdd });
        } else {
          const joined = lead ? join(lead, item) : { item, add: 0, childAdd: 0 };
          lead = joined.item;
          moved.set(flat, { index: -1, add: joined.add, childAdd: joined.childAdd });
          leading.push(flat);
        }
        flat++;
      });
    }
    if (lead && order[0] !== undefined) {
      const target = order[0];
      groups.set(target, groups.has(target) ? join(lead, groups.get(target) as ListItem).item : { ...lead, id: target });
      for (const n of leading) moved.set(n, { index: 0, add: moved.get(n)?.add ?? 0, childAdd: 0 });
    }

    for (const [id, item] of groups) if (!order.includes(id)) keep(id, item);
    const wanted = order.map((id): ListItem => {
      const have = groups.get(id);
      if (have) return have.id === id ? have : { ...have, id };
      const source = copies.get(id);
      const old = kept.get(id) ?? (source !== undefined ? groups.get(source) : undefined);
      kept.delete(id);
      return { ...(old ?? { content: [], children: [] }), id };
    });

    const first = lists[0];
    const only = first !== undefined ? (current.blocks[first] as Notes) : undefined;
    if (lists.length === 1 && only && only.items.length === wanted.length && only.items.every((item, i) => item === wanted[i]) && current === doc) return { doc, selection: sel };

    const block: Notes | undefined = wanted.length > 0 ? { ...(only ?? { type: "ol" as const }), type: "ol", notes: true, items: wanted } : undefined;
    const blocks: Block[] = [];
    const newIndex = new Map<number, number>();
    current.blocks.forEach((b, i) => {
      if (i === first) { if (block) { newIndex.set(i, blocks.length); blocks.push(block); } }
      else if (!lists.includes(i)) { newIndex.set(i, blocks.length); blocks.push(b); }
    });
    const at = first === undefined && block ? blocks.length : (newIndex.get(first as number) ?? 0);
    if (first === undefined && block) blocks.push(block);

    let offsetOf = 0;
    const flatStart = new Map<number, number>();
    for (const b of lists) { flatStart.set(b, offsetOf); offsetOf += (current.blocks[b] as Notes).items.length; }
    const next: Doc = { blocks };
    const map = (pos: Pos): Pos => {
      const [b, i, ...rest] = pos.path as [number, number, ...number[]];
      if (lists.includes(b)) {
        const to = moved.get((flatStart.get(b) as number) + i);
        if (!to || !block) return ops.clampPos(next, { path: [Math.min(at, blocks.length - 1)], offset: 0 });
        const [k, ...deeper] = rest;
        return { path: k === undefined ? [at, to.index] : [at, to.index, k + to.childAdd, ...deeper], offset: pos.offset + (rest.length === 0 ? to.add : 0) };
      }
      return ops.clampPos(next, { path: [newIndex.get(b) ?? b, ...pos.path.slice(1)], offset: pos.offset });
    };
    return { doc: next, selection: { anchor: map(sel.anchor), focus: map(sel.focus) } };
  };
}
