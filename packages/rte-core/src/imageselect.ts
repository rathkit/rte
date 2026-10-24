// Which image is selected. An image is one object in a line of text, so "the image is selected" means the selection covers exactly that
// one object. The view makes this selection when an image is clicked, and keyboard selection (Shift+Arrow over it) gives the same.
import { isCollapsed, getContent, pathKey, type Path, type Selection } from "./path.ts";
import type { Doc, Image } from "./model.ts";
import { sliceInline } from "./edit.ts";

export interface SelectedImage {
  readonly path: Path;
  /** Where the image is in the text of its paragraph (or cell, or item). */
  readonly offset: number;
  readonly image: Image;
}

/** The selection that covers one image. */
export const imageSelection = (path: Path, offset: number): Selection => ({ anchor: { path, offset }, focus: { path, offset: offset + 1 } });

/** The image the selection covers, if it covers exactly one and nothing else. */
export function selectedImage(doc: Doc, sel: Selection): SelectedImage | undefined {
  if (isCollapsed(sel) || pathKey(sel.anchor.path) !== pathKey(sel.focus.path)) return undefined;
  const from = Math.min(sel.anchor.offset, sel.focus.offset);
  const to = Math.max(sel.anchor.offset, sel.focus.offset);
  if (to - from !== 1) return undefined;
  const node = sliceInline(getContent(doc, sel.focus.path), from, to)[0];
  return node?.type === "image" ? { path: sel.focus.path, offset: from, image: node } : undefined;
}
