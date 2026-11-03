// Addresses for the places text can live. A "container" is a block or list item that holds inline content:
// a paragraph, a heading, a code block, a list item, or a paragraph inside a table cell or quote.
// A path is a list of indexes. The shapes, by where the container sits:
//   [b]                      top-level block b (paragraph, heading, code block)
//   [b, i]                   item i of list b
//   [b, i, k, j, ...]        item j of sublist k of item i of list b (and so on, down)
//   [b, i, k]                child k of item i of list b, when child k is a paragraph, heading or code block
//   [b, i, k, n, ...]        block n inside child k of item i, when child k is a quote
//   [b, i]                   entry i of definition list b
//   [b, r, c, n, ...]        block n inside cell c of row r of table b (the rest continues inside that block)
//   [b, n, ...]              block n inside quote b
import {
  inlineLength, inlineText, type Block, type DefinitionEntry, type Doc, type Inline, type ItemChild, type List, type ListItem, type Table, type TableCell,
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
    item.children.forEach((child, k) => blockPaths(child, [...prefix, i, k], out));
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

const containerCache = new WeakMap<Doc, Path[]>();

/**
 * Every container in the document, in reading order. Documents are never changed once made, so the answer is remembered
 * per document. The array is shared: do not change it.
 */
export function containerPaths(doc: Doc): Path[] {
  const hit = containerCache.get(doc);
  if (hit) return hit;
  const out: Path[] = [];
  doc.blocks.forEach((block, b) => blockPaths(block, [b], out));
  containerCache.set(doc, out);
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
  const child = item.children[k];
  return child ? slotInBlock(child, more) : undefined;
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
    return { ...item, children: item.children.map((child, s) => (s === k ? (updateBlock(child, more, content) as ItemChild) : child)) };
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
  const applyList = (list: List, rest: Path): List => {
    const [i, k, ...more] = rest;
    if (i === undefined || k === undefined) return list;
    return { ...list, items: list.items.map((item, idx) => (idx !== i ? item : { ...item, children: applyChildren(item.children, [k, ...more]) })) };
  };
  /** The blocks that follow an item's text are a list of blocks too; what an edit puts there is limited to what an item may hold. */
  const applyChildren = (children: readonly ItemChild[], rest: Path): ItemChild[] => {
    const [k, ...more] = rest;
    if (k === undefined) return [...children];
    if (more.length === 0) return asChildren(fn(children, k));
    return children.map((child, idx): ItemChild => {
      if (idx !== k) return child;
      if (child.type === "ul" || child.type === "ol") return applyList(child, more);
      if (child.type === "quote") return { ...child, blocks: apply(child.blocks, more) };
      return child;
    });
  };
  const apply = (blocks: readonly Block[], rest: Path): Block[] => {
    const [n, ...more] = rest;
    if (n === undefined) return [...blocks];
    if (more.length === 0) return [...fn(blocks, n)];
    return blocks.map((block, idx) => {
      if (idx !== n) return block;
      if (block.type === "quote") return { ...block, blocks: apply(block.blocks, more) };
      if (block.type === "ul" || block.type === "ol") return applyList(block, more);
      if (block.type === "table") {
        const [r, c, ...inner] = more;
        return { ...block, rows: block.rows.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : { ...cell, blocks: apply(cell.blocks, inner) })))) };
      }
      return block;
    });
  };
  return { blocks: apply(doc.blocks, path) };
}

/** Blocks as list item children: a table or definition list cannot sit in an item, so its text stays as paragraphs. */
export function asChildren(blocks: readonly Block[]): ItemChild[] {
  return blocks.flatMap((block): ItemChild[] => {
    switch (block.type) {
      case "table": return block.rows.flatMap((row) => row.flatMap((cell) => asChildren(cell.blocks)));
      case "dl": return block.entries.map((entry) => ({ type: "p" as const, content: entry.content }));
      default: return [block];
    }
  });
}

/** The block at a path that ends at a block: `[b]`, `[b, n]` inside a quote, `[b, r, c, n]` inside a table cell. */
export function getBlock(doc: Doc, path: Path): Block | undefined {
  const find = (blocks: readonly Block[], rest: Path): Block | undefined => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (!block || more.length === 0) return block;
    if (block.type === "quote") return find(block.blocks, more);
    if (block.type === "ul" || block.type === "ol") return findInList(block, more);
    if (block.type === "table") {
      const [r, c, ...inner] = more;
      const cell = r === undefined || c === undefined ? undefined : block.rows[r]?.[c];
      return cell ? find(cell.blocks, inner) : undefined;
    }
    return undefined;
  };
  const findInList = (list: List, rest: Path): Block | undefined => {
    const [i, k, ...inner] = rest;
    const child = i === undefined || k === undefined ? undefined : list.items[i]?.children[k];
    if (!child) return undefined;
    if (inner.length === 0) return child;
    if (child.type === "ul" || child.type === "ol") return findInList(child, inner);
    return child.type === "quote" ? find(child.blocks, inner) : undefined;
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
        idx !== i ? item : {
          ...item,
          children: item.children.flatMap((sub, s): ItemChild[] => {
            if (s !== k) return [sub];
            if (sub.type === "ul" || sub.type === "ol") { const next = apply(sub, more); return next ? [next] : []; }
            return sub.type === "quote" ? [{ ...sub, blocks: walk(sub.blocks, more) }] : [sub];
          }),
        }),
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
      if (block.type === "ul" || block.type === "ol") return [fixList(block)];
      return [block];
    });
    return out.length === 0 && needOne ? [{ type: "p", content: [] }] : out;
  };
  const fixList = (list: List): List => ({
    ...list,
    items: list.items.map((item): ListItem => ({
      ...item,
      children: item.children.flatMap((child): ItemChild[] => {
        if (child.type === "ul" || child.type === "ol") return [fixList(child)];
        if (child.type === "quote") { const inner = fixBlocks(child.blocks, false); return inner.length > 0 ? [{ ...child, blocks: inner }] : []; }
        return [child];
      }),
    })),
  });
  return { blocks: fixBlocks(doc.blocks, true) };
}

/** Keeps a position valid: the container must exist and the offset must lie inside it. */
export function clampPos(doc: Doc, pos: Pos): Pos {
  const path = hasContainer(doc, pos.path) ? pos.path : (containerPaths(doc).at(-1) ?? [0]);
  return { path, offset: Math.max(0, Math.min(pos.offset, inlineLength(getContent(doc, path)))) };
}

/** The containers from the start of a selection to its end, in reading order. */
export function selectedContainers(doc: Doc, sel: Selection): Path[] {
  const [a, b] = comparePath(sel.anchor.path, sel.focus.path) <= 0 ? [sel.anchor, sel.focus] : [sel.focus, sel.anchor];
  return containerPaths(doc).filter((p) => comparePath(p, a.path) >= 0 && comparePath(p, b.path) <= 0);
}

/** Removes one entry from a definition list. A list with no entries left goes too. */
export function removeEntry(doc: Doc, entryPath: Path): Doc {
  const blockPath = entryPath.slice(0, -1);
  const index = entryPath.at(-1) as number;
  const dl = getBlock(doc, blockPath);
  if (dl?.type !== "dl") return doc;
  const entries = dl.entries.filter((_, i) => i !== index);
  return fixup(mapBlockList(doc, blockPath, (blocks, at) => [...blocks.slice(0, at), ...(entries.length > 0 ? [{ ...dl, entries }] : []), ...blocks.slice(at + 1)]));
}

/**
 * The table cells around a container, outermost first, each as the path `[...table, row, cell]` (a table inside a cell of another table
 * gives two). Empty for a container that is in no table. Two containers are in the same cell when their chains are equal.
 */
export function cellChain(doc: Doc, path: Path): Path[] {
  const chain: Path[] = [];
  const walk = (blocks: readonly Block[], rest: Path, prefix: Path): void => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (n === undefined || !block) return;
    if (block.type === "quote") walk(block.blocks, more, [...prefix, n]);
    else if (block.type === "ul" || block.type === "ol") walkList(block, more, [...prefix, n]);
    else if (block.type === "table") {
      const [r, c, ...inner] = more;
      if (r === undefined || c === undefined) return;
      chain.push([...prefix, n, r, c]);
      const cell = block.rows[r]?.[c];
      if (cell) walk(cell.blocks, inner, [...prefix, n, r, c]);
    }
  };
  // A quote that sits in a list item can hold a table; follow the path through lists to find it.
  const walkList = (list: List, rest: Path, prefix: Path): void => {
    const [i, k, ...inner] = rest;
    const child = i === undefined || k === undefined ? undefined : list.items[i]?.children[k];
    if (i === undefined || k === undefined || !child) return;
    if (child.type === "ul" || child.type === "ol") walkList(child, inner, [...prefix, i, k]);
    else if (child.type === "quote") walk(child.blocks, inner, [...prefix, i, k]);
  };
  walk(doc.blocks, path, []);
  return chain;
}

export const sameCells = (a: readonly Path[], b: readonly Path[]): boolean => a.length === b.length && a.every((p, i) => pathKey(p) === pathKey(b[i] as Path));
