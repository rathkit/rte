// List commands: turning blocks into list items and back, moving items in and out, and the typed shortcuts.
// Pure functions over the document, like the rest of the edit operations.
import { inlineText, type Block, type Doc, type Inline, type List, type ListItem } from "./model.ts";
import {
  caret, clampPos, comparePath, containerPaths, fixup, getBlock, getContent, isCollapsed, kindAt, mapBlockList, pathKey, setContent,
  type EditResult, type Path, type Pos, type Selection,
} from "./path.ts";

export interface ListOptions {
  /** A `list-style-type` keyword such as `lower-alpha`. Applying the same list type with a different style changes the style. */
  readonly style?: string;
  /** The first number of an ordered list. */
  readonly start?: number;
}

// ---- finding things ---------------------------------------------------------------------------------------

interface ItemLocation {
  /** The path of the outermost list block that holds the item, within its list of blocks. */
  readonly listBlock: Path;
  /** From that list: item index, then (sublist index, item index) pairs down to the item. */
  readonly item: readonly number[];
}

/** Splits the path of a list-item container into the path of its outermost list block and the way down inside it. */
function locateItem(doc: Doc, path: Path): ItemLocation | undefined {
  const walk = (blocks: readonly Block[], rest: Path, prefix: readonly number[]): ItemLocation | undefined => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (!block) return undefined;
    if (block.type === "ul" || block.type === "ol") return { listBlock: [...prefix, n as number], item: more };
    if (block.type === "quote") return walk(block.blocks, more, [...prefix, n as number]);
    if (block.type === "table") {
      const [r, c, ...inner] = more;
      const cell = r === undefined || c === undefined ? undefined : block.rows[r]?.[c];
      return cell ? walk(cell.blocks, inner, [...prefix, n as number, r as number, c as number]) : undefined;
    }
    return undefined;
  };
  return walk(doc.blocks, path, []);
}

/** The list that directly holds an item, and the item's index in it. */
function listOfItem(doc: Doc, path: Path): { list: List; index: number } | undefined {
  const loc = locateItem(doc, path);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return undefined;
  let list: List = root;
  const steps = loc.item;
  for (let at = 0; ; at += 2) {
    if (steps.length - at === 1) return { list, index: steps[at] as number };
    const sub = list.items[steps[at] as number]?.sublists[steps[at + 1] as number];
    if (!sub) return undefined;
    list = sub;
  }
}

const replaceBlock = (doc: Doc, path: Path, blocks: readonly Block[]): Doc =>
  fixup(mapBlockList(doc, path, (list, index) => [...list.slice(0, index), ...blocks, ...list.slice(index + 1)]));

/** After an edit that keeps text content objects, finds a container again by the content object it held. */
function sameContainer(doc: Doc, content: readonly Inline[], fallback: Path): Path {
  const paths = containerPaths(doc);
  return paths.find((p) => getContent(doc, p) === content) ?? (paths.find((p) => pathKey(p) === pathKey(fallback)) ?? paths[0] ?? [0]);
}

function selectedContainers(doc: Doc, sel: Selection): Path[] {
  const [a, b] = comparePath(sel.anchor.path, sel.focus.path) <= 0 ? [sel.anchor, sel.focus] : [sel.focus, sel.anchor];
  return containerPaths(doc).filter((p) => comparePath(p, a.path) >= 0 && comparePath(p, b.path) <= 0);
}

/** Carries a selection across an edit by finding its containers again through the content they held. */
function carry(before: Doc, after: Doc, sel: Selection): Selection {
  const move = (pos: Selection["anchor"]): Selection["anchor"] => {
    const path = sameContainer(after, getContent(before, pos.path), pos.path);
    return clampPos(after, { path, offset: pos.offset });
  };
  return { anchor: move(sel.anchor), focus: move(sel.focus) };
}

// ---- taking an item out of its list -----------------------------------------------------------------------

interface Split {
  readonly before: List | undefined;
  readonly content: readonly Inline[];
  readonly after: List | undefined;
}

/** Splits a list around one item. Items that followed it at a deeper level keep their depth under an empty placeholder item. */
function splitList(list: List, path: readonly number[]): Split {
  const [i, k] = path as [number, number | undefined];
  const item = list.items[i] as ListItem;
  const numbering = (count: number): Partial<List> => (list.type === "ol" ? { start: (list.start ?? 1) + count } : {});
  if (k === undefined) {
    const placeholder: ListItem[] = item.sublists.length > 0 ? [{ content: [], sublists: item.sublists }] : [];
    const rest = [...placeholder, ...list.items.slice(i + 1)];
    return {
      before: i > 0 ? { ...list, items: list.items.slice(0, i) } : undefined,
      content: item.content,
      after: rest.length > 0 ? { ...list, ...numbering(i + 1), items: rest } : undefined,
    };
  }
  const inner = splitList(item.sublists[k] as List, path.slice(2));
  const keptSublists = [...item.sublists.slice(0, k), ...(inner.before ? [inner.before] : [])];
  const afterSublists = [...(inner.after ? [inner.after] : []), ...item.sublists.slice(k + 1)];
  const rest = [...(afterSublists.length > 0 ? [{ content: [], sublists: afterSublists }] : []), ...list.items.slice(i + 1)];
  return {
    before: { ...list, items: [...list.items.slice(0, i), { content: item.content, sublists: keptSublists }] },
    content: inner.content,
    after: rest.length > 0 ? { ...list, ...numbering(i + 1), items: rest } : undefined,
  };
}

/** Turns one list item into a paragraph at the level of the outermost list, splitting the list around it. */
export function takeOutOfList(doc: Doc, itemPath: Path): Doc {
  const loc = locateItem(doc, itemPath);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return doc;
  const { before, content, after } = splitList(root, loc.item);
  return replaceBlock(doc, loc.listBlock, [...(before ? [before] : []), { type: "p", content }, ...(after ? [after] : [])]);
}

// ---- toggling ---------------------------------------------------------------------------------------------

const textBlock = (block: Block | undefined): block is Extract<Block, { type: "p" | "h" }> => block?.type === "p" || block?.type === "h";

function withOptions(list: List, options: ListOptions): List {
  return {
    ...list,
    ...(options.style !== undefined ? { style: options.style } : {}),
    ...(options.start !== undefined && list.type === "ol" ? { start: options.start } : {}),
  };
}

/** Changes the type of the list that directly holds an item. Nested lists change on their own. */
function retypeListOf(doc: Doc, itemPath: Path, type: "ul" | "ol", options: ListOptions): Doc {
  const loc = locateItem(doc, itemPath);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return doc;
  const edit = (list: List, steps: readonly number[]): List => {
    if (steps.length === 1) {
      const { start: _drop, ...rest } = list;
      void _drop;
      return withOptions({ ...rest, type }, options);
    }
    const [i, k] = steps as [number, number];
    return { ...list, items: list.items.map((item, idx) => (idx !== i ? item : { ...item, sublists: item.sublists.map((sub, s) => (s === k ? edit(sub, steps.slice(2)) : sub)) })) };
  };
  return replaceBlock(doc, loc.listBlock, [edit(root, loc.item)]);
}

const sameKind = (a: List | undefined, type: "ul" | "ol", options: ListOptions): a is List =>
  a !== undefined && a.type === type && (options.style === undefined || options.style === a.style);

/**
 * Makes the selected blocks list items of the given type, or takes them out of their list. The block where the selection
 * starts decides: already in a list of that type, everything selected leaves its lists; otherwise everything selected becomes
 * an item. Paragraphs next to a list of the same type join it; a list of the other type that the selection touches changes type.
 */
export function toggleList(doc: Doc, sel: Selection, type: "ul" | "ol", options: ListOptions = {}): EditResult {
  const paths = selectedContainers(doc, sel);
  if (paths.length === 0) return { doc, selection: sel };
  const startPath = paths[0] as Path;
  const startList = kindAt(doc, startPath) === "li" ? listOfItem(doc, startPath)?.list : undefined;

  let next = doc;
  if (startList?.type === type) {
    const currentStyle = startList.style;
    if (options.style !== undefined && options.style !== currentStyle) {
      // Same list type with a different style: restyle, do not toggle off.
      next = retypeListOf(doc, startPath, type, { ...options, ...(options.start === undefined && startList.start !== undefined ? { start: startList.start } : {}) });
      return { doc: next, selection: carry(doc, next, sel) };
    }
    for (const path of [...paths].reverse()) if (kindAt(next, path) === "li") next = takeOutOfList(next, path);
    return { doc: next, selection: carry(doc, next, sel) };
  }

  // Items in lists of the other type: each such list changes type (once, however many of its items are selected).
  const done = new Set<List>();
  for (const path of paths) {
    if (kindAt(next, path) !== "li") continue;
    const held = listOfItem(next, path);
    if (!held || held.list.type === type || done.has(held.list)) continue;
    done.add(held.list);
    next = retypeListOf(next, path, type, options);
  }

  // Paragraphs and headings become items. Runs of neighbours become one list, joined to same-type lists beside them.
  const blockPaths = paths.filter((p) => textBlock(getBlock(next, p)) && kindAt(next, p) !== "li");
  const runs: Path[][] = [];
  for (const path of blockPaths) {
    const last = runs[runs.length - 1]?.at(-1);
    const sameParent = last && last.length === path.length && pathKey(last.slice(0, -1)) === pathKey(path.slice(0, -1)) && (last.at(-1) as number) + 1 === (path.at(-1) as number);
    if (sameParent) runs[runs.length - 1]?.push(path);
    else runs.push([path]);
  }
  for (const run of [...runs].reverse()) {
    const first = run[0] as Path;
    next = fixup(mapBlockList(next, first, (blocks, index) => {
      const items: ListItem[] = run.map((_, n) => ({ content: (blocks[index + n] as { content: readonly Inline[] }).content, sublists: [] }));
      let list: List = withOptions({ type, items }, options);
      let from = index;
      let to = index + run.length;
      const before = blocks[index - 1];
      const after = blocks[to];
      if ((before?.type === "ul" || before?.type === "ol") && sameKind(before, type, options)) {
        list = { ...before, items: [...before.items, ...items] };
        from = index - 1;
      }
      if ((after?.type === "ul" || after?.type === "ol") && sameKind(after, type, options)) {
        list = { ...list, items: [...list.items, ...after.items] };
        to += 1;
      }
      return [...blocks.slice(0, from), list, ...blocks.slice(to)];
    }));
  }
  return { doc: next, selection: carry(doc, next, sel) };
}

// ---- moving items -----------------------------------------------------------------------------------------

/** How many lists an item sits inside. */
export function listDepth(doc: Doc, itemPath: Path): number {
  const loc = locateItem(doc, itemPath);
  return loc ? Math.ceil((loc.item.length + 1) / 2) : 0;
}

/** True when the caret is in a list item (of the given type, if one is given). */
export function inList(doc: Doc, path: Path, type?: "ul" | "ol"): boolean {
  if (kindAt(doc, path) !== "li") return false;
  return type === undefined || listOfItem(doc, path)?.list.type === type;
}

function mapListAt(doc: Doc, itemPath: Path, fn: (list: List, index: number) => List | undefined): Doc {
  const loc = locateItem(doc, itemPath);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return doc;
  const edit = (list: List, steps: readonly number[]): List | undefined => {
    if (steps.length === 1) return fn(list, steps[0] as number);
    const [i, k] = steps as [number, number];
    return {
      ...list,
      items: list.items.map((item, idx) => idx !== i ? item : { ...item, sublists: item.sublists.flatMap((sub, s) => (s !== k ? [sub] : [edit(sub, steps.slice(2))].filter((x): x is List => x !== undefined))) }),
    };
  };
  const next = edit(root, loc.item);
  return replaceBlock(doc, loc.listBlock, next ? [next] : []);
}

/**
 * Moves the selected items one level deeper, under the item before them. An item with nothing before it gets an empty
 * placeholder item to nest under. An item keeps its own children, which move one level deeper with it.
 * `maxDepth` stops the move once an item already sits that many lists deep.
 */
export function indentItems(doc: Doc, sel: Selection, maxDepth = Number.POSITIVE_INFINITY): EditResult {
  const items = selectedContainers(doc, sel).filter((p) => kindAt(doc, p) === "li");
  if (items.length === 0) return { doc, selection: sel };
  // Group neighbouring selected items of one list; each group moves together.
  const groups: Path[][] = [];
  for (const path of items) {
    const last = groups[groups.length - 1]?.at(-1);
    const sibling = last && last.length === path.length && pathKey(last.slice(0, -1)) === pathKey(path.slice(0, -1)) && (last.at(-1) as number) + 1 === (path.at(-1) as number);
    if (sibling) groups[groups.length - 1]?.push(path);
    else groups.push([path]);
  }
  let next = doc;
  for (const group of [...groups].reverse()) {
    const first = group[0] as Path;
    if (listDepth(next, first) > maxDepth) continue;
    next = mapListAt(next, first, (list, index) => {
      const moved = list.items.slice(index, index + group.length);
      // Items keep their children: they all move one level deeper together.
      const flat = moved;
      const previous = list.items[index - 1];
      const nested = (target: ListItem): ListItem => {
        const last = target.sublists.at(-1);
        const sublists = last && last.type === list.type
          ? [...target.sublists.slice(0, -1), { ...last, items: [...last.items, ...flat] }]
          : [...target.sublists, { type: list.type, items: flat }];
        return { ...target, sublists };
      };
      const rest = list.items.slice(index + group.length);
      if (previous) return { ...list, items: [...list.items.slice(0, index - 1), nested(previous), ...rest] };
      return { ...list, items: [nested({ content: [], sublists: [] }), ...rest] };
    });
  }
  return { doc: next, selection: carry(doc, next, sel) };
}

/**
 * Moves the selected items one level out, to just after the item that held them. Items that followed a moved item in its
 * list go with it as its children, so they keep their depth. From the outermost list the item leaves the list.
 */
export function outdentItems(doc: Doc, sel: Selection): EditResult {
  const items = selectedContainers(doc, sel).filter((p) => kindAt(doc, p) === "li");
  if (items.length === 0) return { doc, selection: sel };
  let next = doc;
  for (const path of [...items].reverse()) {
    const loc = locateItem(next, path);
    if (!loc) continue;
    if (loc.item.length === 1) {
      next = takeOutOfList(next, path);
      continue;
    }
    // Nested: the item moves up into the list that holds its parent, right after the parent.
    const parentPath: Path = [...loc.listBlock.slice(0, 0), ...path.slice(0, path.length - 2)];
    const sublistIndex = path.at(-2) as number;
    const itemIndex = path.at(-1) as number;
    next = mapListAt(next, parentPath, (list, parentIndex) => {
      const parent = list.items[parentIndex] as ListItem;
      const sub = parent.sublists[sublistIndex] as List;
      const moved = sub.items[itemIndex] as ListItem;
      const followers = sub.items.slice(itemIndex + 1);
      const keptSub = itemIndex > 0 ? [{ ...sub, items: sub.items.slice(0, itemIndex) }] : [];
      const lifted: ListItem = {
        content: moved.content,
        sublists: [...moved.sublists, ...(followers.length > 0 ? [{ type: sub.type, ...(sub.style !== undefined ? { style: sub.style } : {}), items: followers } as List] : [])],
      };
      const sublists = [...parent.sublists.slice(0, sublistIndex), ...keptSub, ...parent.sublists.slice(sublistIndex + 1)];
      const items = [...list.items.slice(0, parentIndex), { content: parent.content, sublists }, lifted, ...list.items.slice(parentIndex + 1)];
      return { ...list, items };
    });
  }
  return { doc: next, selection: carry(doc, next, sel) };
}

// ---- typed shortcuts --------------------------------------------------------------------------------------

/**
 * `* ` or `- ` at the start of a paragraph becomes a bulleted item; `1. ` becomes a numbered one. Only a paragraph that holds
 * nothing but the marker is converted, with the caret after it. The space that triggered it is not inserted. Returns
 * undefined when the typed space is not a list shortcut.
 */
export function listShortcut(doc: Doc, sel: Selection): EditResult | undefined {
  if (!isCollapsed(sel)) return undefined;
  const path = sel.anchor.path;
  const block = getBlock(doc, path);
  if (block?.type !== "p" || kindAt(doc, path) !== "p") return undefined;
  const text = inlineText(block.content);
  const type = text === "*" || text === "-" ? "ul" : text === "1." ? "ol" : undefined;
  if (!type || sel.anchor.offset !== text.length) return undefined;
  const emptied = setContent(doc, path, []);
  const result = toggleList(emptied, caret({ path, offset: 0 }), type);
  const target = containerPaths(result.doc).find((p) => getContent(result.doc, p) === getContent(emptied, path)) ?? path;
  return { doc: result.doc, selection: caret({ path: target, offset: 0 }) };
}

// ---- Enter and Backspace in lists -------------------------------------------------------------------------

/** Where an item's content went after the item left its list: the paragraph that now holds that very content. */
function paragraphHolding(doc: Doc, content: readonly Inline[], fallback: Path): Path {
  return containerPaths(doc).find((p) => getContent(doc, p) === content) ?? fallback;
}

/**
 * Enter on an empty list item leaves the list: from the outermost list the item becomes a paragraph (the list splits around
 * it when it was in the middle); from a nested list it moves out one level.
 */
export function leaveListItem(doc: Doc, pos: Pos): EditResult {
  const content = getContent(doc, pos.path);
  const loc = locateItem(doc, pos.path);
  if (!loc) return { doc, selection: caret(pos) };
  if (loc.item.length > 1) return outdentItems(doc, caret(pos));
  const next = takeOutOfList(doc, pos.path);
  return { doc: next, selection: caret({ path: paragraphHolding(next, content, pos.path), offset: 0 }) };
}

/**
 * Backspace at the start of a list item. The first item of a list leaves it (a nested one moves out a level; an outermost one
 * becomes a paragraph before the rest). Returns undefined for any other item, which joins the item before it as usual.
 */
export function backspaceAtItemStart(doc: Doc, pos: Pos): EditResult | undefined {
  if (pos.offset !== 0 || kindAt(doc, pos.path) !== "li") return undefined;
  const held = listOfItem(doc, pos.path);
  if (!held || held.index !== 0) return undefined;
  return leaveListItem(doc, pos);
}
