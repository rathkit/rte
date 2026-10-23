// Definition lists: a term (`dt`) followed by the details (`dd`) that describe it. Pure functions over the document.
import type { ContainerBehavior } from "../behaviors.ts";
import { takeOutOfList } from "./lists.ts";
import { normalizeInline, type Block, type DefinitionEntry, type DefinitionList, type Doc, type Inline } from "../model.ts";
import {
  caret, clampPos, containerPaths, selectedContainers, fixup, getBlock, getContent, kindAt, mapBlockList, pathKey,
  type EditResult, type Path, type Pos, type Selection,
} from "../path.ts";

const blockPathOf = (entryPath: Path): Path => entryPath.slice(0, -1);
const indexOf = (entryPath: Path): number => entryPath.at(-1) as number;
const dlAt = (doc: Doc, entryPath: Path): DefinitionList | undefined => {
  const block = getBlock(doc, blockPathOf(entryPath));
  return block?.type === "dl" ? block : undefined;
};

export const inDefinitionList = (doc: Doc, path: Path): boolean => {
  const kind = kindAt(doc, path);
  return kind === "dt" || kind === "dd";
};

const replaceBlock = (doc: Doc, path: Path, blocks: readonly Block[]): Doc =>
  fixup(mapBlockList(doc, path, (list, index) => [...list.slice(0, index), ...blocks, ...list.slice(index + 1)]));

/** Turns one entry into a paragraph, splitting the list around it. */
export function takeOutOfDefinitionList(doc: Doc, entryPath: Path): Doc {
  const dl = dlAt(doc, entryPath);
  if (!dl) return doc;
  const i = indexOf(entryPath);
  const before = i > 0 ? [{ ...dl, entries: dl.entries.slice(0, i) }] : [];
  const after = i < dl.entries.length - 1 ? [{ ...dl, entries: dl.entries.slice(i + 1) }] : [];
  return replaceBlock(doc, blockPathOf(entryPath), [...before, { type: "p", content: (dl.entries[i] as DefinitionEntry).content }, ...after]);
}

/** Carries a selection across an edit that keeps text content objects, finding containers again by what they held. */
function carry(before: Doc, after: Doc, sel: Selection): Selection {
  const paths = containerPaths(after);
  const move = (pos: Pos): Pos => {
    const path = paths.find((p) => getContent(after, p) === getContent(before, pos.path)) ?? paths[0] ?? [0];
    return clampPos(after, { path, offset: pos.offset });
  };
  return { anchor: move(sel.anchor), focus: move(sel.focus) };
}

/**
 * Makes every selected block a term, or takes the selected entries out when the selection starts in a definition list.
 * Items in ordinary lists leave their lists first. No details are created: that is for the person to write.
 */
export function toggleDefinitionList(doc: Doc, sel: Selection): EditResult {
  const first = selectedContainers(doc, sel)[0];
  if (!first) return { doc, selection: sel };
  let next = doc;
  if (inDefinitionList(doc, first)) {
    for (const path of [...selectedContainers(doc, sel)].reverse()) if (inDefinitionList(next, path)) next = takeOutOfDefinitionList(next, path);
    return { doc: next, selection: carry(doc, next, sel) };
  }
  for (const path of [...selectedContainers(doc, sel)].reverse()) if (kindAt(next, path) === "li") next = takeOutOfList(next, path);
  const carried = carry(doc, next, sel);

  const blockPaths = selectedContainers(next, carried).filter((p) => {
    const block = getBlock(next, p);
    return (block?.type === "p" || block?.type === "h") && kindAt(next, p) !== "li";
  });
  const runs: Path[][] = [];
  for (const path of blockPaths) {
    const last = runs[runs.length - 1]?.at(-1);
    const sameParent = last && last.length === path.length && pathKey(last.slice(0, -1)) === pathKey(path.slice(0, -1)) && (last.at(-1) as number) + 1 === (path.at(-1) as number);
    if (sameParent) runs[runs.length - 1]?.push(path);
    else runs.push([path]);
  }
  for (const run of [...runs].reverse()) {
    next = fixup(mapBlockList(next, run[0] as Path, (blocks, index) => {
      const entries: DefinitionEntry[] = run.map((_, n) => ({ kind: "term", content: (blocks[index + n] as { content: readonly Inline[] }).content }));
      let from = index;
      let to = index + run.length;
      let list: DefinitionList = { type: "dl", entries };
      const before = blocks[index - 1];
      const after = blocks[to];
      if (before?.type === "dl") {
        list = { type: "dl", entries: [...before.entries, ...entries] };
        from = index - 1;
      }
      if (after?.type === "dl") {
        list = { type: "dl", entries: [...list.entries, ...after.entries] };
        to += 1;
      }
      return [...blocks.slice(0, from), list, ...blocks.slice(to)];
    }));
  }
  return { doc: next, selection: carry(doc, next, sel) };
}

/** Tab on a term makes it a detail of the entry before; Shift+Tab on a detail makes it a term again. */
export function setEntryKind(doc: Doc, sel: Selection, kind: "term" | "detail"): EditResult {
  let next = doc;
  for (const path of selectedContainers(doc, sel)) {
    const dl = dlAt(next, path);
    if (!dl || dl.entries[indexOf(path)]?.kind === kind) continue;
    next = replaceBlock(next, blockPathOf(path), [{ ...dl, entries: dl.entries.map((entry, i) => (i === indexOf(path) ? { ...entry, kind } : entry)) }]);
  }
  return { doc: next, selection: sel };
}

/**
 * Enter in an entry. At the end of a term the next entry is its detail, and at the end of a detail the next is a term; in
 * the middle both halves keep the kind. Enter on an empty entry leaves the list.
 */
export function splitEntry(doc: Doc, pos: Pos): EditResult {
  const dl = dlAt(doc, pos.path);
  const i = indexOf(pos.path);
  const entry = dl?.entries[i];
  if (!dl || !entry) return { doc, selection: caret(pos) };
  if (entry.content.length === 0) return leaveDefinitionList(doc, pos);
  let remaining = pos.offset;
  const before: Inline[] = [];
  const after: Inline[] = [];
  for (const node of entry.content) {
    const length = node.type === "text" ? node.text.length : 1;
    if (remaining >= length) before.push(node);
    else if (remaining <= 0) after.push(node);
    else if (node.type === "text") {
      before.push({ ...node, text: node.text.slice(0, remaining) });
      after.push({ ...node, text: node.text.slice(remaining) });
    }
    remaining -= length;
  }
  const atEnd = after.length === 0;
  const nextKind = atEnd ? (entry.kind === "term" ? "detail" : "term") : entry.kind;
  const entries = [
    ...dl.entries.slice(0, i),
    { ...entry, content: normalizeInline(before) },
    { kind: nextKind, content: normalizeInline(after) } satisfies DefinitionEntry,
    ...dl.entries.slice(i + 1),
  ];
  const next = replaceBlock(doc, blockPathOf(pos.path), [{ ...dl, entries }]);
  return { doc: next, selection: caret({ path: [...blockPathOf(pos.path), i + 1], offset: 0 }) };
}

/** An empty entry becomes a paragraph, splitting the list around it. */
export function leaveDefinitionList(doc: Doc, pos: Pos): EditResult {
  const content = getContent(doc, pos.path);
  const next = takeOutOfDefinitionList(doc, pos.path);
  const path = containerPaths(next).find((p) => getContent(next, p) === content) ?? pos.path;
  return { doc: next, selection: caret({ path, offset: 0 }) };
}

/** Backspace at the start of the first entry makes it a paragraph before the rest. Any other entry joins the one before it as usual. */
export function backspaceAtEntryStart(doc: Doc, pos: Pos): EditResult | undefined {
  if (pos.offset !== 0 || !inDefinitionList(doc, pos.path) || indexOf(pos.path) !== 0) return undefined;
  return leaveDefinitionList(doc, pos);
}

/**
 * Pasting several blocks into an entry: the first paragraph joins the text at the caret, and the others become entries of the
 * same kind after it, the last one carrying whatever followed the caret. Other kinds of block are read for their text.
 */
export function insertIntoEntry(doc: Doc, pos: Pos, blocks: readonly Block[], before: Inline[], after: Inline[]): EditResult {
  const dl = dlAt(doc, pos.path);
  const i = indexOf(pos.path);
  const entry = dl?.entries[i];
  if (!dl || !entry) return { doc, selection: caret(pos) };
  const texts = blocks.flatMap((block): Inline[][] =>
    block.type === "p" || block.type === "h" ? [block.content as Inline[]]
      : block.type === "ul" || block.type === "ol" ? block.items.map((item) => item.content as Inline[])
        : block.type === "dl" ? block.entries.map((e) => e.content as Inline[]) : []);
  if (texts.length === 0) return { doc, selection: caret(pos) };
  const [first, ...others] = texts as [Inline[], ...Inline[][]];
  const last = others.length > 0 ? (others[others.length - 1] as Inline[]) : first;
  const rows: DefinitionEntry[] = others.length === 0
    ? [{ ...entry, content: normalizeInline([...before, ...first, ...after]) }]
    : [
        { ...entry, content: normalizeInline([...before, ...first]) },
        ...others.slice(0, -1).map((content): DefinitionEntry => ({ kind: entry.kind, content })),
        { kind: entry.kind, content: normalizeInline([...last, ...after]) },
      ];
  const next = replaceBlock(doc, blockPathOf(pos.path), [{ ...dl, entries: [...dl.entries.slice(0, i), ...rows, ...dl.entries.slice(i + 1)] }]);
  const length = last.reduce((n, node) => n + (node.type === "text" ? node.text.length : 1), 0);
  return { doc: next, selection: caret({ path: [...blockPathOf(pos.path), i + rows.length - 1], offset: length }) };
}

/** What Enter, Backspace and paste do inside a definition list. Plugins register it for the `dt` and `dd` containers. */
export const definitionBehavior: ContainerBehavior = {
  split: (doc, pos) => splitEntry(doc, pos),
  backspaceAtStart: backspaceAtEntryStart,
  insertBlocks: insertIntoEntry,
};
