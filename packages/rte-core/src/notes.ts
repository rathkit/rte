// Footnote numbering shared by the view and the exporters. A reference's number is its place among the references, in reading
// order, outside the notes list; the notes list is kept in that same order, so a note's marker and its reference agree.
import type { Block, Doc, List } from "./model.ts";
import { containerPaths, getContent } from "./path.ts";

export const isNotes = (block: Block | undefined): block is List & { notes: true } => block?.type === "ol" && block.notes === true;

/** The ids of every reference in the document, in reading order. A notes list holds none. */
export const noteIds = (doc: Doc): string[] =>
  containerPaths(doc).flatMap((path) => (isNotes(doc.blocks[path[0] as number]) ? [] : getContent(doc, path).flatMap((n) => (n.type === "note" ? [n.id] : []))));
