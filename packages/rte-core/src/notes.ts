// Footnote numbering shared by the view and the exporters. A reference's number is its place among the references, in reading
// order, outside the notes list; the notes list is kept in that same order, so a note's marker and its reference agree.
import type { Block, Doc, Inline, List } from "./model.ts";

export const isNotes = (block: Block | undefined): block is List & { notes: true } => block?.type === "ol" && block.notes === true;

function collect(block: Block, out: string[]): void {
  const inline = (content: readonly Inline[]): void => { for (const n of content) if (n.type === "note") out.push(n.id); };
  switch (block.type) {
    case "p": case "h": inline(block.content); break;
    case "ul": case "ol": for (const item of block.items) { inline(item.content); for (const child of item.children) collect(child, out); } break;
    case "dl": for (const entry of block.entries) inline(entry.content); break;
    case "table": for (const row of block.rows) for (const cell of row) for (const inner of cell.blocks) collect(inner, out); break;
    case "quote": for (const inner of block.blocks) collect(inner, out); break;
    default: break;
  }
}

// Blocks are never changed once made, and an edit keeps the blocks it did not touch, so what is found in a block is remembered per
// block: an edit rescans only what it changed, and nothing is kept per document (which would stay alive in the undo history).
const found = new WeakMap<Block, readonly string[]>();
const NONE: readonly string[] = [];

/** The ids of the references in a block, in order. A notes list holds none. */
function idsOf(block: Block): readonly string[] {
  if (isNotes(block)) return NONE;
  let ids = found.get(block);
  if (!ids) {
    const out: string[] = [];
    collect(block, out);
    found.set(block, (ids = out.length === 0 ? NONE : out));
  }
  return ids;
}

/** The ids of every reference in the document, in reading order. */
export const noteIds = (doc: Doc): string[] => doc.blocks.flatMap(idsOf);
