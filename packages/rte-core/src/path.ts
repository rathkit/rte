// Addresses for the places text can live. A "container" is a block or list item that holds inline content:
// a paragraph, a heading, a code block, a list item, or a paragraph inside a table cell or quote.
// A path is a list of indexes. The shapes, by where the container sits:
//   [b]                      top-level block b (paragraph, heading, code block)
//   [b, i]                   item i of list b
//   [b, i, k, j, ...]        item j of sublist k of item i of list b (and so on, down)
//   [b, i]                   entry i of definition list b
//   [b, r, c, n, ...]        block n inside cell c of row r of table b (the rest continues inside that block)
//   [b, n, ...]              block n inside quote b
import {
  inlineLength, inlineText, type Block, type DefinitionEntry, type Doc, type Inline, type List, type ListItem, type Table, type TableCell,
} from "./model.ts";

export type Path = readonly number[];

export interface Pos {
  readonly path: Path;
  /** Characters from the start of the container's text. A line break and an image each count as one. */
  readonly offset: number;
}
export interface Selection {
  readonly anchor: Pos;
  readonly focus: Pos;
}

export interface EditResult {
  readonly doc: Doc;
  readonly selection: Selection;
}

export const caret = (pos: Pos): Selection => ({ anchor: pos, focus: pos });
export const isCollapsed = (sel: Selection): boolean => pathKey(sel.anchor.path) === pathKey(sel.focus.path) && sel.anchor.offset === sel.focus.offset;

export const pathKey = (path: Path): string => path.join(".");

/**
 * Reading order of two containers. Paths sort lexicographically in reading order: a list item comes before the items
 * nested under it, rows run left to right then top to bottom, and so on. Negative when `a` comes first.
 */
export function comparePath(a: Path, b: Path): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function listPaths(list: List, prefix: readonly number[], out: Path[]): void {
  list.items.forEach((item, i) => {
    out.push([...prefix, i]);
    item.sublists.forEach((sub, k) => listPaths(sub, [...prefix, i, k], out));
  });
}

function blockPaths(block: Block, prefix: readonly number[], out: Path[]): void {
  switch (block.type) {
    case "p": case "h": case "pre": out.push(prefix); break;
    case "ul": case "ol": listPaths(block, prefix, out); break;
    case "dl": block.entries.forEach((_, i) => out.push([...prefix, i])); break;
    case "table":
      block.rows.forEach((row, r) => row.forEach((cell, c) => cell.blocks.forEach((inner, n) => blockPaths(inner, [...prefix, r, c, n], out))));
      break;
    case "quote": block.blocks.forEach((inner, n) => blockPaths(inner, [...prefix, n], out)); break;
    case "hr": break;
  }
}

/** Every container in the document, in reading order. */
export function containerPaths(doc: Doc): Path[] {
  const out: Path[] = [];
  doc.blocks.forEach((block, b) => blockPaths(block, [b], out));
  return out;
}

export function blockContainers(block: Block, prefix: readonly number[]): Path[] {
  const out: Path[] = [];
  blockPaths(block, prefix, out);
  return out;
}

const preInline = (text: string): Inline[] => (text === "" ? [] : [{ type: "text", text, marks: [] }]);

interface Slot {
  readonly content: readonly Inline[];
  readonly block?: Block;
  readonly item?: ListItem;
  readonly entry?: DefinitionEntry;
}

function slotInBlock(block: Block, rest: Path): Slot | undefined {
  switch (block.type) {
    case "p": case "h": return rest.length === 0 ? { content: block.content, block } : undefined;
    case "pre": return rest.length === 0 ? { content: preInline(block.text), block } : undefined;
    case "ul": case "ol": return slotInList(block, rest);
    case "dl": {
      const entry = rest.length === 1 ? block.entries[rest[0] as number] : undefined;
      return entry ? { content: entry.content, entry } : undefined;
    }
    case "table": {
      const [r, c, ...more] = rest;
      const cell = r === undefined || c === undefined ? undefined : block.rows[r]?.[c];
      return cell ? slotInBlocks(cell.blocks, more) : undefined;
    }
    case "quote": return slotInBlocks(block.blocks, rest);
    case "hr": return undefined;
  }
}

function slotInList(list: List, rest: Path): Slot | undefined {
  const [i, k, ...more] = rest;
  const item = i === undefined ? undefined : list.items[i];
  if (!item) return undefined;
  if (k === undefined) return { content: item.content, item };
  const sub = item.sublists[k];
  return sub ? slotInList(sub, more) : undefined;
}

function slotInBlocks(blocks: readonly Block[], rest: Path): Slot | undefined {
  const [n, ...more] = rest;
  const block = n === undefined ? undefined : blocks[n];
  return block ? slotInBlock(block, more) : undefined;
}

/** True when the path leads to a container that exists. Cheap: it follows the path instead of listing every container. */
export function hasContainer(doc: Doc, path: Path): boolean {
  return slotInBlocks(doc.blocks, path) !== undefined;
}

export function getContent(doc: Doc, path: Path): readonly Inline[] {
  return slotInBlocks(doc.blocks, path)?.content ?? [];
}

/** The kind of block at a path, or undefined when the path leads nowhere. Items report "li". */
export function kindAt(doc: Doc, path: Path): "p" | "h" | "pre" | "li" | "dt" | "dd" | undefined {
  const slot = slotInBlocks(doc.blocks, path);
  if (slot?.item) return "li";
  if (slot?.entry) return slot.entry.kind === "term" ? "dt" : "dd";
  return slot?.block?.type as "p" | "h" | "pre" | undefined;
}

function updateList(list: List, rest: Path, content: readonly Inline[]): List {
  const [i, k, ...more] = rest;
  if (i === undefined) return list;
  const items = list.items.map((item, idx): ListItem => {
    if (idx !== i) return item;
    if (k === undefined) return { ...item, content };
    return { ...item, sublists: item.sublists.map((sub, s) => (s === k ? updateList(sub, more, content) : sub)) };
  });
  return { ...list, items };
}

function updateBlock(block: Block, rest: Path, content: readonly Inline[]): Block {
  switch (block.type) {
    case "p": case "h": return rest.length === 0 ? { ...block, content } : block;
    case "pre": return rest.length === 0 ? { ...block, text: inlineText(content).replace(/￼/g, "") } : block;
    case "ul": case "ol": return updateList(block, rest, content);
    case "dl": return { ...block, entries: block.entries.map((entry, i) => (i === rest[0] ? { ...entry, content } : entry)) };
    case "table": {
      const [r, c, ...more] = rest;
      return {
        ...block,
        rows: block.rows.map((row, ri) => (ri !== r ? row : row.map((cell, ci): TableCell => (ci !== c ? cell : { ...cell, blocks: updateBlocks(cell.blocks, more, content) })))),
      } satisfies Table;
    }
    case "quote": return { ...block, blocks: updateBlocks(block.blocks, rest, content) };
    case "hr": return block;
  }
}

function updateBlocks(blocks: readonly Block[], rest: Path, content: readonly Inline[]): Block[] {
  const [n, ...more] = rest;
  return blocks.map((block, idx) => (idx === n ? updateBlock(block, more, content) : block));
}

export const setContent = (doc: Doc, path: Path, content: readonly Inline[]): Doc => ({ blocks: updateBlocks(doc.blocks, path, content) });

/** Replaces the block that holds a container (a paragraph, heading or code block) in its parent list of blocks. */
export function mapBlockList(doc: Doc, path: Path, fn: (blocks: readonly Block[], index: number) => readonly Block[]): Doc {
  const apply = (blocks: readonly Block[], rest: Path): Block[] => {
    const [n, ...more] = rest;
    if (n === undefined) return [...blocks];
    if (more.length === 0) return [...fn(blocks, n)];
    return blocks.map((block, idx) => {
      if (idx !== n) return block;
      if (block.type === "quote") return { ...block, blocks: apply(block.blocks, more) };
      if (block.type === "table") {
        const [r, c, ...inner] = more;
        return { ...block, rows: block.rows.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : { ...cell, blocks: apply(cell.blocks, inner) })))) };
      }
      return block;
    });
  };
  return { blocks: apply(doc.blocks, path) };
}

/** The block at a path that ends at a block: `[b]`, `[b, n]` inside a quote, `[b, r, c, n]` inside a table cell. */
export function getBlock(doc: Doc, path: Path): Block | undefined {
  const find = (blocks: readonly Block[], rest: Path): Block | undefined => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (!block || more.length === 0) return block;
    if (block.type === "quote") return find(block.blocks, more);
    if (block.type === "table") {
      const [r, c, ...inner] = more;
      const cell = r === undefined || c === undefined ? undefined : block.rows[r]?.[c];
      return cell ? find(cell.blocks, inner) : undefined;
    }
    return undefined;
  };
  return find(doc.blocks, path);
}

/** True when the container is a direct child of a list of blocks (so blocks can be inserted beside it). */
export function inBlockList(doc: Doc, path: Path): boolean {
  const slot = slotInBlocks(doc.blocks, path);
  return slot?.block !== undefined;
}

/**
 * Applies `fn` to the list holding a list-item container, passing the item's index within it.
 * Returning undefined removes the list from where it sits.
 */
export function mapListOf(doc: Doc, path: Path, fn: (list: List, index: number) => List | undefined): Doc {
  const apply = (list: List, rest: Path): List | undefined => {
    const [i, k, ...more] = rest;
    if (i === undefined) return list;
    if (k === undefined) return fn(list, i);
    return {
      ...list,
      items: list.items.map((item, idx) =>
        idx !== i ? item : { ...item, sublists: item.sublists.flatMap((sub, s) => (s === k ? [apply(sub, more)].filter((x): x is List => x !== undefined) : [sub])) }),
    };
  };
  const walk = (blocks: readonly Block[], rest: Path): Block[] => {
    const [n, ...more] = rest;
    return blocks.flatMap((block, idx): Block[] => {
      if (idx !== n) return [block];
      if (block.type === "ul" || block.type === "ol") {
        const next = apply(block, more);
        return next ? [next] : [];
      }
      if (block.type === "quote") return [{ ...block, blocks: walk(block.blocks, more) }];
      if (block.type === "table") {
        const [r, c, ...inner] = more;
        return [{ ...block, rows: block.rows.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : { ...cell, blocks: walk(cell.blocks, inner) })))) }];
      }
      return [block];
    });
  };
  return fixup({ blocks: walk(doc.blocks, path) });
}

/** Restores the invariants removals can break: no empty documents, table cells or quotes. */
export function fixup(doc: Doc): Doc {
  const fixBlocks = (blocks: readonly Block[], needOne: boolean): Block[] => {
    const out = blocks.flatMap((block): Block[] => {
      if (block.type === "quote") {
        const inner = fixBlocks(block.blocks, false);
        return inner.length > 0 ? [{ ...block, blocks: inner }] : [];
      }
      if (block.type === "table") {
        return [{ ...block, rows: block.rows.map((row) => row.map((cell): TableCell => ({ ...cell, blocks: fixBlocks(cell.blocks, true) }))) }];
      }
      return [block];
    });
    return out.length === 0 && needOne ? [{ type: "p", content: [] }] : out;
  };
  return { blocks: fixBlocks(doc.blocks, true) };
}

/** Keeps a position valid: the container must exist and the offset must lie inside it. */
export function clampPos(doc: Doc, pos: Pos): Pos {
  const path = hasContainer(doc, pos.path) ? pos.path : (containerPaths(doc).at(-1) ?? [0]);
  return { path, offset: Math.max(0, Math.min(pos.offset, inlineLength(getContent(doc, path)))) };
}
