// Block-level commands that are not about lists: paragraph and heading type, and alignment.
import { inlineText, type Align, type Block, type Doc, type Inline } from "./model.ts";
import { caret, clampPos, containerPaths, fixup, getBlock, kindAt, mapBlockList, pathKey, selectedContainers, type EditResult, type Path, type Pos, type Selection } from "./path.ts";

export type BlockKind = { readonly type: "p" } | { readonly type: "h"; readonly level: 1 | 2 | 3 | 4 | 5 | 6 };

const sameKind = (block: Block, kind: BlockKind): boolean =>
  block.type === "p" ? kind.type === "p" : block.type === "h" && kind.type === "h" && block.level === kind.level;

function textOf(block: Block): readonly Inline[] | undefined {
  if (block.type === "p" || block.type === "h") return block.content;
  if (block.type === "pre") return block.text === "" ? [] : [{ type: "text", text: block.text, marks: [] }];
  return undefined;
}

/** The paragraphs, headings and code blocks a selection touches, which are the blocks this can retype. */
function retypable(doc: Doc, sel: Selection): Path[] {
  return selectedContainers(doc, sel).filter((p) => {
    const kind = kindAt(doc, p);
    return kind === "p" || kind === "h" || kind === "pre";
  });
}

/** The kind of the block where the selection starts: "p", "h" with a level, "pre", or a list item, entry and so on. */
export function blockKindAt(doc: Doc, sel: Selection): { type: string; level?: number } | undefined {
  const first = selectedContainers(doc, sel)[0];
  if (!first) return undefined;
  const block = getBlock(doc, first);
  if (block?.type === "h") return { type: "h", level: block.level };
  const kind = kindAt(doc, first);
  return kind ? { type: kind } : undefined;
}

/**
 * Makes every selected paragraph, heading or code block the given kind. When the first one already is that kind, every
 * selected block goes back to a paragraph, so the same command toggles. List items, entries and tables are left alone.
 * Marks inside a code block do not exist, so a code block turned into text has none.
 */
export function setBlockType(doc: Doc, sel: Selection, kind: BlockKind): EditResult {
  const paths = retypable(doc, sel);
  if (paths.length === 0) return { doc, selection: sel };
  const firstBlock = getBlock(doc, paths[0] as Path);
  const target: BlockKind = firstBlock && sameKind(firstBlock, kind) ? { type: "p" } : kind;
  let next = doc;
  for (const path of paths) {
    next = fixup(mapBlockList(next, path, (blocks, index) => {
      const block = blocks[index] as Block;
      const content = textOf(block);
      if (!content) return blocks;
      const align = block.type === "p" || block.type === "h" ? block.align : undefined;
      const replacement: Block = target.type === "p"
        ? { type: "p", content, ...(align ? { align } : {}) }
        : { type: "h", level: target.level, content, ...(align ? { align } : {}) };
      return [...blocks.slice(0, index), replacement, ...blocks.slice(index + 1)];
    }));
  }
  return { doc: next, selection: sel };
}

/** The alignment of the block where the selection starts. Undefined means the default. */
export function alignAt(doc: Doc, sel: Selection): Align | undefined {
  const first = selectedContainers(doc, sel)[0];
  const block = first ? getBlock(doc, first) : undefined;
  return block?.type === "p" || block?.type === "h" ? block.align : undefined;
}

/** Aligns every selected paragraph and heading. `left` is the default and is stored as no alignment at all. */
export function setAlign(doc: Doc, sel: Selection, align: Align): EditResult {
  const paths = retypable(doc, sel).filter((p) => {
    const block = getBlock(doc, p);
    return block?.type === "p" || block?.type === "h";
  });
  if (paths.length === 0) return { doc, selection: sel };
  let next = doc;
  for (const path of paths) {
    next = mapBlockList(next, path, (blocks, index) => {
      const block = blocks[index] as Block;
      if (block.type !== "p" && block.type !== "h") return blocks;
      const { align: _old, ...rest } = block;
      void _old;
      const updated = (align === "left" ? rest : { ...rest, align }) as Block;
      return [...blocks.slice(0, index), updated, ...blocks.slice(index + 1)];
    });
  }
  return { doc: next, selection: sel };
}


// ---- code blocks, quotes and rules ------------------------------------------------------------------------

/** The same position in a document whose containers are the same ones in the same order but at other paths. */
function carryOver(before: Doc, after: Doc, pos: Pos): Pos {
  const ordinal = containerPaths(before).findIndex((p) => pathKey(p) === pathKey(pos.path));
  const paths = containerPaths(after);
  return { path: paths[Math.max(0, Math.min(ordinal, paths.length - 1))] ?? pos.path, offset: pos.offset };
}
const carrySelection = (before: Doc, after: Doc, sel: Selection): Selection => ({ anchor: carryOver(before, after, sel.anchor), focus: carryOver(before, after, sel.focus) });

/** Whether the block where the selection starts is a code block. */
export const inCodeBlock = (doc: Doc, sel: Selection): boolean => blockKindAt(doc, sel)?.type === "pre";

/**
 * Makes the selected paragraphs and headings code blocks, or, when the first one already is a code block, turns the selected code blocks
 * back into paragraphs. Marks and alignment do not exist in code, so they are dropped on the way in.
 */
export function toggleCodeBlock(doc: Doc, sel: Selection): EditResult {
  const paths = retypable(doc, sel);
  const first = paths[0] && getBlock(doc, paths[0]);
  if (!first) return { doc, selection: sel };
  const toCode = first.type !== "pre";
  let next = doc;
  for (const path of paths) {
    next = mapBlockList(next, path, (blocks, index) => {
      const block = blocks[index] as Block;
      let replacement: Block | undefined;
      if (toCode && (block.type === "p" || block.type === "h")) replacement = { type: "pre", text: inlineText(block.content).replace(/￼/g, "") };
      else if (!toCode && block.type === "pre") replacement = { type: "p", content: block.text === "" ? [] : [{ type: "text", text: block.text, marks: [] }] };
      return replacement ? [...blocks.slice(0, index), replacement, ...blocks.slice(index + 1)] : blocks;
    });
  }
  // Line breaks and images count differently in a code block, so keep the ends of the selection inside their text.
  return { doc: next, selection: { anchor: clampPos(next, sel.anchor), focus: clampPos(next, sel.focus) } };
}

/** The block paths (in one list of blocks) that a selection's paragraphs, headings, code blocks and lists belong to. */
function blockPathsOf(doc: Doc, sel: Selection): Path[] | undefined {
  const seen = new Map<string, Path>();
  for (const path of selectedContainers(doc, sel)) {
    const kind = kindAt(doc, path);
    // A list item or entry belongs to the list block it sits in, which is the outermost block under the same parent.
    const block = kind === "p" || kind === "h" || kind === "pre" ? path : kind === "li" || kind === "dt" || kind === "dd" ? [...path.slice(0, listDepth(doc, path))] : undefined;
    if (!block) return undefined;
    seen.set(pathKey(block), block);
  }
  const all = [...seen.values()];
  if (all.length === 0) return undefined;
  const parent = all[0]!.slice(0, -1);
  return all.every((p) => p.length === all[0]!.length && pathKey(p.slice(0, -1)) === pathKey(parent)) ? all : undefined;
}

/** How many path steps lead to the list block (not into its items) for a list-item or entry container. */
function listDepth(doc: Doc, path: Path): number {
  for (let n = 1; n <= path.length; n++) {
    const block = getBlock(doc, path.slice(0, n));
    if (block && (block.type === "ul" || block.type === "ol" || block.type === "dl")) return n;
  }
  return path.length;
}

/** Whether the block where the selection starts sits directly in a quote. */
export function inQuote(doc: Doc, sel: Selection): boolean {
  const paths = blockPathsOf(doc, sel);
  const first = paths?.[0];
  return first !== undefined && first.length >= 2 && getBlock(doc, first.slice(0, -1))?.type === "quote";
}

/**
 * Puts the selected blocks (paragraphs, headings, code blocks and lists, side by side) inside a quote, or, when they are in one, takes
 * them out of it (what is left of the quote on either side stays a quote).
 */
export function toggleQuote(doc: Doc, sel: Selection): EditResult {
  const paths = blockPathsOf(doc, sel);
  if (!paths) return { doc, selection: sel };
  const indexes = paths.map((p) => p[p.length - 1] as number);
  const low = Math.min(...indexes);
  const high = Math.max(...indexes);
  const parent = paths[0]!.slice(0, -1);
  const first = [...parent, low];
  let next: Doc;
  if (parent.length >= 1 && getBlock(doc, parent)?.type === "quote") {
    next = fixup(mapBlockList(doc, parent, (blocks, at) => {
      const quote = blocks[at];
      if (quote?.type !== "quote") return blocks;
      const before = quote.blocks.slice(0, low);
      const middle = quote.blocks.slice(low, high + 1);
      const after = quote.blocks.slice(high + 1);
      return [...blocks.slice(0, at), ...(before.length ? [{ ...quote, blocks: before }] : []), ...middle, ...(after.length ? [{ ...quote, blocks: after }] : []), ...blocks.slice(at + 1)];
    }));
  } else {
    next = mapBlockList(doc, first, (blocks, at) => [...blocks.slice(0, at), { type: "quote", blocks: blocks.slice(at, high + 1) }, ...blocks.slice(high + 1)]);
  }
  return { doc: next, selection: carrySelection(doc, next, sel) };
}

/** Puts a horizontal rule after the block the caret is in (in place of an empty paragraph), with the caret in a paragraph after it. */
export function insertRule(doc: Doc, sel: Selection): EditResult {
  const path = sel.focus.path;
  const kind = kindAt(doc, path);
  const block = kind === "p" || kind === "h" || kind === "pre" ? path : [path[0] as number];
  const current = getBlock(doc, block);
  if (!current) return { doc, selection: sel };
  const empty = current.type === "p" && current.content.length === 0;
  const next = mapBlockList(doc, block, (blocks, at) => [
    ...blocks.slice(0, empty ? at : at + 1), { type: "hr" }, { type: "p", content: [] }, ...blocks.slice(at + 1),
  ]);
  const ordinal = containerPaths(doc).findIndex((p) => pathKey(p) === pathKey(path));
  const paths = containerPaths(next);
  // The new paragraph is the next container after the one the caret was in (or, in place of an empty one, that very container).
  const target = paths[empty ? ordinal : ordinal + 1] ?? paths.at(-1) ?? [0];
  return { doc: next, selection: caret({ path: target, offset: 0 }) };
}
