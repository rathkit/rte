// List commands: turning blocks into list items and back, moving items in and out, and the typed shortcuts.
// Pure functions over the document, like the rest of the edit operations.
import type { ContainerBehavior } from "../behaviors.ts";
import { deleteSelection, sliceInline } from "../edit.ts";
import { inlineText, normalizeInline, type Block, type Doc, type Inline, type ItemChild, type List, type ListItem } from "../model.ts";
import {
  caret, clampPos, containerPaths, selectedContainers, fixup, getBlock, getContent, isCollapsed, kindAt, mapBlockList, pathKey, setContent,
  type EditResult, type Path, type Pos, type Selection,
} from "../path.ts";

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
  // Inside a list, the way down can pass through a quote that is a child of an item; a list in that quote starts a new location.
  const inList = (list: List, rest: Path, listBlock: Path, steps: readonly number[]): ItemLocation | undefined => {
    const [i, k, ...more] = rest;
    if (i === undefined) return undefined;
    if (k === undefined) return { listBlock, item: [...steps, i] };
    const child = list.items[i]?.children[k];
    if (!child) return undefined;
    if (child.type === "ul" || child.type === "ol") return inList(child, more, listBlock, [...steps, i, k]);
    if (child.type === "quote") return walk(child.blocks, more, [...listBlock, ...steps, i, k]);
    return undefined;
  };
  const walk = (blocks: readonly Block[], rest: Path, prefix: readonly number[]): ItemLocation | undefined => {
    const [n, ...more] = rest;
    const block = n === undefined ? undefined : blocks[n];
    if (!block) return undefined;
    if (block.type === "ul" || block.type === "ol") return inList(block, more, [...prefix, n as number], []);
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
    const sub = list.items[steps[at] as number]?.children[steps[at + 1] as number];
    if (sub?.type !== "ul" && sub?.type !== "ol") return undefined;
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
  /** The item's own children, lifted out to sit where the item was, one level shallower. Only when asked for. */
  readonly lifted: readonly ItemChild[];
  readonly after: List | undefined;
}

/** Splits a list around one item. Items that followed it at a deeper level keep their depth under an empty placeholder item. */
function splitList(list: List, path: readonly number[], liftChildren: boolean): Split {
  const [i, k] = path as [number, number | undefined];
  const item = list.items[i] as ListItem;
  const numbering = (count: number): Partial<List> => (list.type === "ol" ? { start: (list.start ?? 1) + count } : {});
  if (k === undefined) {
    // Children either keep their depth under an empty placeholder, or come out with the item, one level shallower.
    const placeholder: ListItem[] = item.children.length > 0 && !liftChildren ? [{ content: [], children: item.children }] : [];
    const rest = [...placeholder, ...list.items.slice(i + 1)];
    return {
      before: i > 0 ? { ...list, items: list.items.slice(0, i) } : undefined,
      content: item.content,
      lifted: liftChildren ? item.children : [],
      after: rest.length > 0 ? { ...list, ...numbering(i + 1), items: rest } : undefined,
    };
  }
  const inner = splitList(item.children[k] as List, path.slice(2), liftChildren);
  const keptSublists = [...item.children.slice(0, k), ...(inner.before ? [inner.before] : [])];
  const afterSublists = [...(inner.after ? [inner.after] : []), ...item.children.slice(k + 1)];
  const rest = [...(afterSublists.length > 0 ? [{ content: [], children: afterSublists }] : []), ...list.items.slice(i + 1)];
  return {
    before: { ...list, items: [...list.items.slice(0, i), { content: item.content, children: keptSublists }] },
    content: inner.content,
    lifted: inner.lifted,
    after: rest.length > 0 ? { ...list, ...numbering(i + 1), items: rest } : undefined,
  };
}

/**
 * Turns one list item into a paragraph at the level of the outermost list, splitting the list around it. By default what was
 * nested under the item keeps its depth. With `liftChildren` it comes out with the item, one level shallower, each nested
 * list keeping its own type, so repeated outdenting brings every line to the left edge.
 */
export function takeOutOfList(doc: Doc, itemPath: Path, liftChildren = false): Doc {
  const loc = locateItem(doc, itemPath);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return doc;
  const { before, content, lifted, after } = splitList(root, loc.item, liftChildren);
  return replaceBlock(doc, loc.listBlock, [...(before ? [before] : []), { type: "p", content }, ...lifted, ...(after ? [after] : [])]);
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

/** Changes the list that directly holds an item (not the lists around it or inside it) with `change`. */
function updateListOf(doc: Doc, itemPath: Path, change: (list: List) => List): Doc {
  const loc = locateItem(doc, itemPath);
  const root = loc ? getBlock(doc, loc.listBlock) : undefined;
  if (!loc || (root?.type !== "ul" && root?.type !== "ol")) return doc;
  const edit = (list: List, steps: readonly number[]): List => {
    if (steps.length === 1) return change(list);
    const [i, k] = steps as [number, number];
    return { ...list, items: list.items.map((item, idx) => (idx !== i ? item : { ...item, children: item.children.map((sub, s) => (s === k && (sub.type === "ul" || sub.type === "ol") ? edit(sub, steps.slice(2)) : sub)) })) };
  };
  return replaceBlock(doc, loc.listBlock, [edit(root, loc.item)]);
}

/** Changes the type of the list that directly holds an item. Nested lists change on their own. */
function retypeListOf(doc: Doc, itemPath: Path, type: "ul" | "ol", options: ListOptions): Doc {
  return updateListOf(doc, itemPath, (list) => {
    const { start: _drop, ...rest } = list;
    void _drop;
    return withOptions({ ...rest, type }, options);
  });
}

/** The marker styles the list controls offer: CSS `list-style-type` keywords, for numbered lists and for bulleted ones. */
export const LIST_STYLES: Readonly<Record<"ul" | "ol", readonly string[]>> = {
  ol: ["decimal", "decimal-leading-zero", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman", "lower-greek"],
  ul: ["disc", "circle", "square"],
};

/** The list the selection starts in: its type, its marker style (absent: the default for its depth) and where it starts counting. */
export function listStyleAt(doc: Doc, sel: Selection): { type: "ul" | "ol"; style?: string; start?: number } | undefined {
  const path = selectedContainers(doc, sel)[0];
  const held = path && kindAt(doc, path) === "li" ? listOfItem(doc, path) : undefined;
  return held ? { type: held.list.type, ...(held.list.style !== undefined ? { style: held.list.style } : {}), ...(held.list.start !== undefined ? { start: held.list.start } : {}) } : undefined;
}

/**
 * Sets the marker style and, for a numbered list, the number it starts at, of the list the selection starts in (only that list: lists
 * inside it and around it keep theirs). `style` is one of `LIST_STYLES` for that kind of list, or null for the default; `start` is a
 * whole number from 0 to 99999, or null for 1. Anything else changes nothing.
 */
export function setListStyle(doc: Doc, sel: Selection, change: { readonly style?: string | null; readonly start?: number | string | null }): EditResult {
  const path = selectedContainers(doc, sel)[0];
  const held = path && kindAt(doc, path) === "li" ? listOfItem(doc, path) : undefined;
  if (!path || !held) return { doc, selection: sel };
  const style = change.style === undefined ? undefined : change.style === null || change.style === "" ? null : LIST_STYLES[held.list.type].includes(change.style) ? change.style : false;
  const raw = change.start;
  const start = raw === undefined ? undefined : raw === null || raw === "" ? null : Number(raw);
  if (style === false || (start !== undefined && start !== null && (held.list.type !== "ol" || !Number.isInteger(start) || start < 0 || start > 99999))) return { doc, selection: sel };
  const next = updateListOf(doc, path, (list) => {
    const { style: _s, start: _t, ...rest } = list;
    void [_s, _t];
    const newStyle = style === undefined ? list.style : style ?? undefined;
    const newStart = start === undefined ? list.start : start === null || start === 1 ? undefined : start;
    return { ...rest, ...(newStyle !== undefined ? { style: newStyle } : {}), ...(newStart !== undefined ? { start: newStart } : {}) };
  });
  return { doc: next, selection: carry(doc, next, sel) };
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
      const items: ListItem[] = run.map((_, n) => ({ content: (blocks[index + n] as { content: readonly Inline[] }).content, children: [] }));
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
      items: list.items.map((item, idx) => idx !== i ? item : { ...item, children: item.children.flatMap((sub, s): ItemChild[] => (s !== k || (sub.type !== "ul" && sub.type !== "ol") ? [sub] : [edit(sub, steps.slice(2))].filter((x): x is List => x !== undefined))) }),
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
        const last = target.children.at(-1);
        const children = last && last.type === list.type
          ? [...target.children.slice(0, -1), { ...last, items: [...last.items, ...flat] }]
          : [...target.children, { type: list.type, items: flat }];
        return { ...target, children };
      };
      const rest = list.items.slice(index + group.length);
      if (previous) return { ...list, items: [...list.items.slice(0, index - 1), nested(previous), ...rest] };
      return { ...list, items: [nested({ content: [], children: [] }), ...rest] };
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
      next = takeOutOfList(next, path, true);
      continue;
    }
    // Nested: the item moves up into the list that holds its parent, right after the parent.
    const parentPath: Path = [...loc.listBlock.slice(0, 0), ...path.slice(0, path.length - 2)];
    const sublistIndex = path.at(-2) as number;
    const itemIndex = path.at(-1) as number;
    next = mapListAt(next, parentPath, (list, parentIndex) => {
      const parent = list.items[parentIndex] as ListItem;
      const sub = parent.children[sublistIndex] as List;
      const moved = sub.items[itemIndex] as ListItem;
      const followers = sub.items.slice(itemIndex + 1);
      const keptSub = itemIndex > 0 ? [{ ...sub, items: sub.items.slice(0, itemIndex) }] : [];
      const lifted: ListItem = {
        content: moved.content,
        children: [...moved.children, ...(followers.length > 0 ? [{ type: sub.type, ...(sub.style !== undefined ? { style: sub.style } : {}), items: followers } as List] : [])],
      };
      const children = [...parent.children.slice(0, sublistIndex), ...keptSub, ...parent.children.slice(sublistIndex + 1)];
      const items = [...list.items.slice(0, parentIndex), { content: parent.content, children }, lifted, ...list.items.slice(parentIndex + 1)];
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
  // `[] `, `[ ] ` and `[x] ` start a task list, as `* ` starts a bulleted one.
  const task = text === "[]" || text === "[ ]" ? false : text === "[x]" || text === "[X]" ? true : undefined;
  const type = task !== undefined || text === "*" || text === "-" ? "ul" : text === "1." ? "ol" : undefined;
  if (!type || sel.anchor.offset !== text.length) return undefined;
  const emptied = setContent(doc, path, []);
  const result = toggleList(emptied, caret({ path, offset: 0 }), type);
  const target = containerPaths(result.doc).find((p) => getContent(result.doc, p) === getContent(emptied, path)) ?? path;
  const made = task === undefined ? result.doc : setChecked(result.doc, target, task);
  return { doc: made, selection: caret({ path: target, offset: 0 }) };
}

// ---- paragraphs inside an item ----------------------------------------------------------------------------

/**
 * Starts a new paragraph inside the list item the caret is in, instead of a new item: the item then reads as two paragraphs under one
 * marker. A selection is replaced. Does nothing outside a list item.
 */
export function insertItemParagraph(doc: Doc, sel: Selection): EditResult {
  if (kindAt(doc, sel.focus.path) !== "li") return { doc, selection: sel };
  const cleared = deleteSelection(doc, sel);
  const pos = cleared.selection.anchor;
  const content = getContent(cleared.doc, pos.path);
  const next = normalizeInline([...sliceInline(content, 0, pos.offset), { type: "br", paragraph: true }, ...sliceInline(content, pos.offset)]);
  return { doc: setContent(cleared.doc, pos.path, next), selection: caret({ path: pos.path, offset: pos.offset + 1 }) };
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
  // Backspace at the start of a task first takes its checkbox away, leaving an ordinary item.
  if (held?.list.items[held.index]?.checked !== undefined) return { doc: setChecked(doc, pos.path, undefined), selection: caret(pos) };
  if (!held || held.index !== 0) return undefined;
  return leaveListItem(doc, pos);
}

/** Enter in a list item: a new item below, or, on an empty item, out of the list. */
export function splitListItem(doc: Doc, pos: Pos): EditResult | undefined {
  const content = getContent(doc, pos.path);
  const loc = locateItem(doc, pos.path);
  const held = listOfItem(doc, pos.path);
  const item = held?.list.items[held.index];
  if (!loc || !item) return undefined;
  if (content.length === 0 && item.children.length === 0) return leaveListItem(doc, pos);
  const before = sliceInline(content, 0, pos.offset);
  const after = sliceInline(content, pos.offset);
  const ordinal = containerPaths(doc).findIndex((p) => pathKey(p) === pathKey(pos.path));
  const next = mapListAt(doc, pos.path, (list, index) => ({
    ...list,
    items: list.items.flatMap((candidate, i) => (i !== index ? [candidate] : [
      { content: before, children: [], ...(item.checked !== undefined ? { checked: item.checked } : {}) },
      // The new item is a task too, and not yet done.
      { content: after, children: item.children, ...(item.checked !== undefined ? { checked: false } : {}) },
    ])),
  }));
  // The new item follows the old one directly in reading order.
  return { doc: next, selection: caret({ path: containerPaths(next)[ordinal + 1] ?? pos.path, offset: 0 }) };
}

/** Several blocks pasted into a list item: paragraphs become items after it, the first joining its text. */
export function insertIntoList(doc: Doc, pos: Pos, blocks: readonly Block[], before: Inline[], after: Inline[]): EditResult {
  const texts = blocks.flatMap((block): Inline[][] =>
    block.type === "p" || block.type === "h" ? [block.content as Inline[]] : block.type === "ul" || block.type === "ol" ? block.items.map((item) => item.content as Inline[]) : []);
  if (texts.length === 0) return { doc, selection: caret(pos) };
  const [first, ...others] = texts as [Inline[], ...Inline[][]];
  const lastText = others.length > 0 ? (others[others.length - 1] as Inline[]) : first;
  let landing = 0;
  const next = mapListAt(doc, pos.path, (list, index) => {
    const item = list.items[index];
    if (!item) return list;
    const rows = others.length === 0
      ? [{ content: normalizeInline([...before, ...first, ...after]), children: item.children }]
      : [
          { content: normalizeInline([...before, ...first]), children: [], ...(item.checked !== undefined ? { checked: item.checked } : {}) },
          ...others.slice(0, -1).map((content) => ({ content, children: [], ...(item.checked !== undefined ? { checked: false } : {}) })),
          { content: normalizeInline([...lastText, ...after]), children: item.children, ...(item.checked !== undefined ? { checked: false } : {}) },
        ];
    landing = rows.length - 1;
    return { ...list, items: [...list.items.slice(0, index), ...rows, ...list.items.slice(index + 1)] };
  });
  const base = containerPaths(doc).findIndex((p) => pathKey(p) === pathKey(pos.path));
  const paths = containerPaths(next);
  const path = paths[Math.min(base + landing, paths.length - 1)] ?? pos.path;
  return { doc: next, selection: caret({ path, offset: lastText.reduce((n, node) => n + (node.type === "text" ? node.text.length : 1), 0) }) };
}

/** What Enter, Backspace and paste do inside a list. Plugins register it for the `li` container. */
export const listBehavior: ContainerBehavior = {
  split: splitListItem,
  backspaceAtStart: backspaceAtItemStart,
  insertBlocks: insertIntoList,
};

// ---- tasks (items with a checkbox) ------------------------------------------------------------------------

/** Whether the item at a path is done: undefined when it is not a task. */
export function checkedAt(doc: Doc, path: Path): boolean | undefined {
  const held = listOfItem(doc, path);
  return held?.list.items[held.index]?.checked;
}

/** Makes one item a task (done or not), or an ordinary item again (undefined). */
function setChecked(doc: Doc, path: Path, value: boolean | undefined): Doc {
  return mapListAt(doc, path, (list, index) => ({
    ...list,
    items: list.items.map((item, i) => {
      if (i !== index) return item;
      const { checked: _old, ...rest } = item;
      void _old;
      return value === undefined ? rest : { ...rest, checked: value };
    }),
  }));
}

const selectedItems = (doc: Doc, sel: Selection): Path[] => selectedContainers(doc, sel).filter((p) => kindAt(doc, p) === "li");

/** Whether the item where the selection starts is a task. */
export function inChecklist(doc: Doc, sel: Selection): boolean {
  const first = selectedItems(doc, sel)[0];
  return first !== undefined && checkedAt(doc, first) !== undefined;
}

/**
 * Task list on or off. Selected paragraphs become a list of tasks (not done); selected items become tasks, or, when the first already is
 * one, ordinary items again.
 */
export function toggleChecklist(doc: Doc, sel: Selection): EditResult {
  let base = doc;
  let selection = sel;
  if (selectedItems(doc, sel).length === 0) {
    const made = toggleList(doc, sel, "ul");
    if (made.doc === doc) return made;
    base = made.doc;
    selection = made.selection;
  }
  const items = selectedItems(base, selection);
  const first = items[0];
  if (!first) return { doc, selection: sel };
  const on = checkedAt(base, first) === undefined;
  let next = base;
  for (const path of items) next = setChecked(next, path, on ? (checkedAt(next, path) ?? false) : undefined);
  return { doc: next, selection };
}

/** Ticks the selected tasks, or, when all of them are ticked, clears them. With a path, flips just that item. */
export function toggleChecked(doc: Doc, sel: Selection, only?: Path): EditResult {
  const items = (only ? [only] : selectedItems(doc, sel)).filter((p) => checkedAt(doc, p) !== undefined);
  if (items.length === 0) return { doc, selection: sel };
  const allDone = items.every((p) => checkedAt(doc, p) === true);
  let next = doc;
  for (const path of items) next = setChecked(next, path, !allDone);
  return { doc: next, selection: sel };
}
