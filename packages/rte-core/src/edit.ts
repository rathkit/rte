// Editing operations as pure functions: (document, selection) in, (document, selection) out.
// Nothing here touches a DOM, so every operation can be tested on its own and replayed on a server.
import {
  inlineLength, inlineText, normalizeInline, type Block, type TableCell, type Doc, type Inline, type List, type Mark, type MarkType, type TextRun,
} from "./model.ts";
import type { Behaviors, ContainerKind } from "./behaviors.ts";
import {
  blockContainers, caret, cellChain, clampPos, comparePath, containerPaths, fixup, getContent, hasContainer, inBlockList, isCollapsed, kindAt, mapBlockList, mapListOf, pathKey, removeEntry, sameCells, setContent,
  type EditResult, type Path, type Pos, type Selection,
} from "./path.ts";

export { caret, clampPos, isCollapsed, type EditResult };

/** The first position in the document. */
export function startOf(doc: Doc): Pos {
  return { path: containerPaths(doc)[0] ?? [0], offset: 0 };
}
export function endOf(doc: Doc): Pos {
  const last = containerPaths(doc).at(-1) ?? [0];
  return { path: last, offset: inlineLength(getContent(doc, last)) };
}

// ---- inline helpers ---------------------------------------------------------------------------------------

/** Characters `from` up to (not including) `to` of the content, keeping marks. */
export function sliceInline(content: readonly Inline[], from: number, to: number = Number.POSITIVE_INFINITY): Inline[] {
  const out: Inline[] = [];
  let pos = 0;
  for (const node of content) {
    const length = node.type === "text" ? node.text.length : 1;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + length);
    if (start < end) {
      if (node.type === "text") out.push({ ...node, text: node.text.slice(start - pos, end - pos) });
      else out.push(node);
    }
    pos += length;
  }
  return out;
}

/** The marks new text typed at `offset` takes: those of the text before it, or after it at the very start. */
export function marksAt(content: readonly Inline[], offset: number): readonly Mark[] {
  let pos = 0;
  let before: readonly Mark[] | undefined;
  let after: readonly Mark[] | undefined;
  for (const node of content) {
    const length = node.type === "text" ? node.text.length : 1;
    if (node.type === "text") {
      if (pos < offset && offset <= pos + length) before = node.marks;
      if (pos === offset && after === undefined) after = node.marks;
    }
    pos += length;
  }
  return (before ?? (offset === 0 ? after : undefined) ?? []).filter((mark) => mark.type !== "link");
}

// ---- positions --------------------------------------------------------------------------------------------

function order(_doc: Doc, sel: Selection): { start: Pos; end: Pos } {
  const c = comparePath(sel.anchor.path, sel.focus.path);
  const forward = c < 0 || (c === 0 && sel.anchor.offset <= sel.focus.offset);
  return forward ? { start: sel.anchor, end: sel.focus } : { start: sel.focus, end: sel.anchor };
}

const ordinalToPath = (doc: Doc, ordinal: number): Path => containerPaths(doc)[Math.max(0, Math.min(ordinal, containerPaths(doc).length - 1))] ?? [0];
const ordinalOf = (doc: Doc, path: Path): number => containerPaths(doc).findIndex((p) => pathKey(p) === pathKey(path));

// ---- deleting ---------------------------------------------------------------------------------------------

function removeContainer(doc: Doc, path: Path): Doc {
  const kind = kindAt(doc, path);
  if (kind === "dt" || kind === "dd") return removeEntry(doc, path);
  if (kind === "li") {
    return mapListOf(doc, path, (list, index) => {
      const items = list.items.filter((_, i) => i !== index);
      return items.length === 0 ? undefined : ({ ...list, items } satisfies List);
    });
  }
  return fixup(mapBlockList(doc, path, (blocks, index) => blocks.filter((_, i) => i !== index)));
}

const startsWith = (path: Path, prefix: Path): boolean => prefix.every((v, i) => path[i] === v);
const blankCell = (cell: TableCell): TableCell => ({ ...cell, blocks: [{ type: "p", content: [] }] });

/** Replaces the table at `table` with a changed one. */
function changeTable(doc: Doc, table: Path, change: (rows: readonly (readonly TableCell[])[]) => readonly (readonly TableCell[])[]): Doc {
  return mapBlockList(doc, table, (blocks, index) => {
    const block = blocks[index];
    return block?.type === "table" ? [...blocks.slice(0, index), { ...block, rows: change(block.rows) }, ...blocks.slice(index + 1)] : blocks;
  });
}

/**
 * A selection that begins in one table cell and ends in another, or crosses the edge of a table. Cells are never merged and a table
 * is never cut in two: inside one table the two end cells lose their selected text and the cells between are emptied; across the
 * edge of a table only the part outside it is deleted, unless the whole table is inside the selection (that case is in deleteSelection).
 */
function deleteAcrossCells(doc: Doc, start: Pos, end: Pos, from: readonly Path[], to: readonly Path[]): EditResult {
  let k = 0;
  while (k < from.length && k < to.length && pathKey(from[k] as Path) === pathKey(to[k] as Path)) k++;
  const a = from[k];
  const b = to[k];
  const paths = containerPaths(doc);
  if (a && b && pathKey(a.slice(0, -2)) === pathKey(b.slice(0, -2))) {
    const table = a.slice(0, -2);
    const [ar, ac] = a.slice(-2) as [number, number];
    const [br, bc] = b.slice(-2) as [number, number];
    // Cells strictly between the two, in reading order, are emptied.
    const before = (r: number, c: number, r2: number, c2: number): boolean => r < r2 || (r === r2 && c < c2);
    let next = changeTable(doc, table, (rows) => rows.map((row, r) => row.map((cell, c) => (before(ar, ac, r, c) && before(r, c, br, bc) ? blankCell(cell) : cell))));
    // The ends keep what lies outside the selection: the start cell up to the caret, the end cell after it.
    const lastInA = [...paths].reverse().find((p) => startsWith(p, a)) as Path;
    const firstInB = paths.find((p) => startsWith(p, b)) as Path;
    const nextEnd = deleteSelection(next, { anchor: { path: firstInB, offset: 0 }, focus: end }).doc;
    next = deleteSelection(nextEnd, { anchor: start, focus: { path: lastInA, offset: inlineLength(getContent(nextEnd, lastInA)) } }).doc;
    return { doc: next, selection: caret(start) };
  }
  // Across the edge of a table: leave the table alone and delete the part outside it.
  let newStart = start;
  let newEnd = end;
  if (a) {
    const after = paths.filter((p) => !startsWith(p, a.slice(0, -2)) && comparePath(p, a) > 0)[0];
    if (!after) return { doc, selection: caret(start) };
    newStart = { path: after, offset: 0 };
  }
  if (b) {
    const first = paths.find((p) => startsWith(p, b.slice(0, -2))) as Path;
    const previous = [...paths].reverse().find((p) => comparePath(p, first) < 0);
    if (!previous) return { doc, selection: caret(start) };
    newEnd = { path: previous, offset: inlineLength(getContent(doc, previous)) };
  }
  if (comparePath(newStart.path, newEnd.path) > 0 || (pathKey(newStart.path) === pathKey(newEnd.path) && newStart.offset > newEnd.offset)) return { doc, selection: caret(start) };
  return deleteSelection(doc, { anchor: newStart, focus: newEnd });
}

/** Deletes the selected range and returns the document with a collapsed caret where it was. */
export function deleteSelection(doc: Doc, sel: Selection): EditResult {
  const { start, end } = order(doc, sel);
  if (pathKey(start.path) === pathKey(end.path)) {
    const content = getContent(doc, start.path);
    const next = normalizeInline([...sliceInline(content, 0, start.offset), ...sliceInline(content, end.offset)]);
    return { doc: setContent(doc, start.path, next), selection: caret(start) };
  }
  const from = cellChain(doc, start.path);
  const to = cellChain(doc, end.path);
  if (!sameCells(from, to)) return deleteAcrossCells(doc, start, end, from, to);
  const s = ordinalOf(doc, start.path);
  const e = ordinalOf(doc, end.path);
  const paths = containerPaths(doc);
  const startKind = kindAt(doc, start.path);
  const endKind = kindAt(doc, end.path);
  const head = sliceInline(getContent(doc, start.path), 0, start.offset);
  const tail = sliceInline(getContent(doc, end.path), end.offset);
  const mergeable = (kind: string | undefined): boolean => kind === "p" || kind === "h" || kind === "li" || kind === "dt" || kind === "dd";
  const merge = mergeable(startKind) && mergeable(endKind);

  let next = setContent(doc, start.path, normalizeInline(merge ? [...head, ...tail] : head));
  if (!merge) next = setContent(next, end.path, normalizeInline(tail));
  // Remove what lies between, last first so earlier paths stay valid. A table that lies wholly inside the range goes as a table,
  // not as a grid of emptied cells.
  const upper = merge ? e : e - 1;
  const gone = new Set<string>();
  for (let i = upper; i > s; i--) {
    const path = paths[i] as Path;
    const chain = cellChain(doc, path);
    const covered = chain.find((cell) => {
      const inside = paths.map((p, at) => ({ p, at })).filter((x) => startsWith(x.p, cell.slice(0, -2)));
      return inside.every((x) => x.at > s && x.at <= upper) && !gone.has(pathKey(cell.slice(0, -2)));
    });
    if (covered) {
      const table = covered.slice(0, -2);
      gone.add(pathKey(table));
      next = fixup(mapBlockList(next, table, (blocks, index) => blocks.filter((_, j) => j !== index)));
    } else if (!chain.some((cell) => gone.has(pathKey(cell.slice(0, -2))))) {
      next = removeContainer(next, path);
    }
  }
  return { doc: next, selection: caret(clampPos(next, { path: ordinalToPath(next, s), offset: start.offset })) };
}

// ---- inserting text ---------------------------------------------------------------------------------------

export function insertText(doc: Doc, sel: Selection, value: string, marks?: readonly Mark[]): EditResult {
  const cleared = isCollapsed(sel) ? { doc, pos: order(doc, sel).start } : (() => { const r = deleteSelection(doc, sel); return { doc: r.doc, pos: r.selection.anchor }; })();
  const content = getContent(cleared.doc, cleared.pos.path);
  const run: TextRun = { type: "text", text: value, marks: marks ?? marksAt(content, cleared.pos.offset) };
  const next = normalizeInline([...sliceInline(content, 0, cleared.pos.offset), run, ...sliceInline(content, cleared.pos.offset)]);
  const pos = { path: cleared.pos.path, offset: cleared.pos.offset + value.length };
  return { doc: setContent(cleared.doc, cleared.pos.path, next), selection: caret(pos) };
}

export function insertLineBreak(doc: Doc, sel: Selection): EditResult {
  const cleared = deleteSelection(doc, sel);
  const pos = cleared.selection.anchor;
  const kind = kindAt(cleared.doc, pos.path);
  if (kind === "pre") return insertText(cleared.doc, cleared.selection, "\n");
  const content = getContent(cleared.doc, pos.path);
  const next = normalizeInline([...sliceInline(content, 0, pos.offset), { type: "br" }, ...sliceInline(content, pos.offset)]);
  return { doc: setContent(cleared.doc, pos.path, next), selection: caret({ path: pos.path, offset: pos.offset + 1 }) };
}

// ---- Enter ------------------------------------------------------------------------------------------------

/** The behavior a plugin gave for a container, if the container is one a plugin owns. */
const behaviorOf = (behaviors: Behaviors | undefined, kind: string | undefined) => (kind === "li" || kind === "dt" || kind === "dd" ? behaviors?.[kind as ContainerKind] : undefined);

/**
 * Enter. Without a plugin that owns the container, Enter in a list item or definition entry inserts a line break: the structure
 * is left alone.
 */
export function splitBlock(doc: Doc, sel: Selection, behaviors?: Behaviors): EditResult {
  const cleared = deleteSelection(doc, sel);
  const pos = cleared.selection.anchor;
  const d = cleared.doc;
  const kind = kindAt(d, pos.path);
  const content = getContent(d, pos.path);
  const before = sliceInline(content, 0, pos.offset);
  const after = sliceInline(content, pos.offset);
  const ordinal = ordinalOf(d, pos.path);

  if (kind === "pre") return insertText(d, cleared.selection, "\n");
  if (kind === "li" || kind === "dt" || kind === "dd") return behaviorOf(behaviors, kind)?.split?.(d, pos) ?? insertLineBreak(d, cleared.selection);

  // Paragraphs and headings split in place. A heading split at its end continues as a paragraph.
  const continueAsParagraph = kind === "h" && after.length === 0;
  const next = mapBlockList(setContent(d, pos.path, before), pos.path, (blocks, index) => {
    const current = blocks[index] as Block;
    const second: Block = continueAsParagraph || current.type !== "h" ? { type: "p", content: after, ...(current.type === "p" && current.align ? { align: current.align } : {}) } : { ...current, content: after };
    return [...blocks.slice(0, index + 1), second, ...blocks.slice(index + 1)];
  });
  return { doc: next, selection: caret({ path: ordinalToPath(next, ordinal + 1), offset: 0 }) };
}

// ---- Backspace and Delete ---------------------------------------------------------------------------------

/**
 * For two neighboring containers in different table cells, how deep each is in tables (undefined when they are in the same cell).
 * Joining them would break the table, so Backspace at the start of a cell and Delete at the end of one do nothing, and at the edge of
 * a table the caret steps into it instead of pulling it apart.
 */
function cellDepths(doc: Doc, first: Path, second: Path): [number, number] | undefined {
  const a = cellChain(doc, first);
  const b = cellChain(doc, second);
  return sameCells(a, b) ? undefined : [a.length, b.length];
}

export function deleteBackward(doc: Doc, sel: Selection, behaviors?: Behaviors): EditResult {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel);
  const pos = sel.anchor;
  if (pos.offset > 0) return deleteSelection(doc, { anchor: { path: pos.path, offset: pos.offset - 1 }, focus: pos });
  const leaving = behaviorOf(behaviors, kindAt(doc, pos.path))?.backspaceAtStart?.(doc, pos);
  if (leaving) return leaving;
  const ordinal = ordinalOf(doc, pos.path);
  if (ordinal <= 0) return { doc, selection: sel };
  const previous = ordinalToPath(doc, ordinal - 1);
  const depths = cellDepths(doc, previous, pos.path);
  if (depths) return depths[0] > depths[1] ? { doc, selection: caret({ path: previous, offset: inlineLength(getContent(doc, previous)) }) } : { doc, selection: sel };
  return joinWithPrevious(doc, previous, pos);
}

export function deleteForward(doc: Doc, sel: Selection): EditResult {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel);
  const pos = sel.anchor;
  const length = inlineLength(getContent(doc, pos.path));
  if (pos.offset < length) return deleteSelection(doc, { anchor: pos, focus: { path: pos.path, offset: pos.offset + 1 } });
  const paths = containerPaths(doc);
  const next = paths[ordinalOf(doc, pos.path) + 1];
  if (!next) return { doc, selection: sel };
  const depths = cellDepths(doc, pos.path, next);
  if (depths) return depths[1] > depths[0] ? { doc, selection: caret({ path: next, offset: 0 }) } : { doc, selection: sel };
  return joinWithPrevious(doc, pos.path, { path: next, offset: 0 });
}

/** Merges the container at `from` into the one at `into`; the caret lands at the join. */
function joinWithPrevious(doc: Doc, into: Path, from: Pos): EditResult {
  const intoKind = kindAt(doc, into);
  const fromKind = kindAt(doc, from.path);
  const joinable = (k: string | undefined): boolean => k === "p" || k === "h" || k === "li" || k === "dt" || k === "dd";
  if (!joinable(intoKind) || !joinable(fromKind)) return { doc, selection: caret(from) };
  const head = getContent(doc, into);
  const tail = getContent(doc, from.path);
  const merged = setContent(doc, into, normalizeInline([...head, ...tail]));
  const next = removeContainer(merged, from.path);
  return { doc: next, selection: caret({ path: into, offset: inlineLength(head) }) };
}

/** Deletes back to the start of the previous word (or forward to the end of the next). At a block edge it joins blocks like Backspace. */
export function deleteWord(doc: Doc, sel: Selection, direction: "backward" | "forward", behaviors?: Behaviors): EditResult {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel);
  const pos = sel.anchor;
  const text = inlineText(getContent(doc, pos.path));
  if (direction === "backward") {
    if (pos.offset === 0) return deleteBackward(doc, sel, behaviors);
    let i = pos.offset;
    while (i > 0 && /\s/.test(text[i - 1] as string)) i--;
    while (i > 0 && !/\s/.test(text[i - 1] as string)) i--;
    return deleteSelection(doc, { anchor: { path: pos.path, offset: i }, focus: pos });
  }
  if (pos.offset >= text.length) return deleteForward(doc, sel);
  let i = pos.offset;
  while (i < text.length && /\s/.test(text[i] as string)) i++;
  while (i < text.length && !/\s/.test(text[i] as string)) i++;
  return deleteSelection(doc, { anchor: pos, focus: { path: pos.path, offset: i } });
}

/** Deletes from the caret to the start or end of the block. */
export function deleteToEdge(doc: Doc, sel: Selection, direction: "backward" | "forward"): EditResult {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel);
  const pos = sel.anchor;
  const end = inlineLength(getContent(doc, pos.path));
  const other = { path: pos.path, offset: direction === "backward" ? 0 : end };
  return deleteSelection(doc, { anchor: pos, focus: other });
}

// ---- marks ------------------------------------------------------------------------------------------------

/** True when every character in the range already has the mark. */
export function rangeHasMark(doc: Doc, sel: Selection, type: MarkType): boolean {
  const { start, end } = order(doc, sel);
  const paths = containerPaths(doc);
  const s = ordinalOf(doc, start.path);
  const e = ordinalOf(doc, end.path);
  let seen = false;
  for (let i = s; i <= e; i++) {
    const path = paths[i] as Path;
    const content = getContent(doc, path);
    const from = i === s ? start.offset : 0;
    const to = i === e ? end.offset : inlineLength(content);
    for (const node of sliceInline(content, from, to)) {
      if (node.type !== "text") continue;
      seen = true;
      if (!node.marks.some((m) => m.type === type)) return false;
    }
  }
  return seen;
}

export function toggleMark(doc: Doc, sel: Selection, mark: Mark): EditResult {
  const { start, end } = order(doc, sel);
  if (isCollapsed(sel)) return { doc, selection: sel };
  const remove = rangeHasMark(doc, sel, mark.type);
  const paths = containerPaths(doc);
  const s = ordinalOf(doc, start.path);
  const e = ordinalOf(doc, end.path);
  let next = doc;
  for (let i = s; i <= e; i++) {
    const path = paths[i] as Path;
    const content = getContent(next, path);
    const from = i === s ? start.offset : 0;
    const to = i === e ? end.offset : inlineLength(content);
    const middle = sliceInline(content, from, to).map((node): Inline => {
      if (node.type !== "text") return node;
      const marks = node.marks.filter((m) => m.type !== mark.type);
      return { ...node, marks: remove ? marks : [...marks, mark] };
    });
    next = setContent(next, path, normalizeInline([...sliceInline(content, 0, from), ...middle, ...sliceInline(content, to)]));
  }
  return { doc: next, selection: sel };
}

// ---- inserting blocks (paste) -----------------------------------------------------------------------------

const textBlock = (block: Block): block is Extract<Block, { type: "p" | "h" }> => block.type === "p" || block.type === "h";

/**
 * Inserts blocks at the caret, replacing the selection. A pasted paragraph that starts or ends the
 * insertion joins the text next to the caret. An empty target paragraph is replaced by the pasted blocks.
 */
export function insertBlocks(doc: Doc, sel: Selection, blocks: readonly Block[], behaviors?: Behaviors): EditResult {
  if (blocks.length === 0) return { doc, selection: sel };
  const cleared = deleteSelection(doc, sel);
  const pos = cleared.selection.anchor;
  const d = cleared.doc;
  const content = getContent(d, pos.path);
  const before = sliceInline(content, 0, pos.offset);
  const after = sliceInline(content, pos.offset);
  const only = blocks.length === 1 ? blocks[0] : undefined;

  // Inline-only paste joins the text where the caret is.
  if (only && textBlock(only) && !(content.length === 0 && only.type === "h")) {
    const merged = normalizeInline([...before, ...only.content, ...after]);
    return { doc: setContent(d, pos.path, merged), selection: caret({ path: pos.path, offset: inlineLength(before) + inlineLength(only.content) }) };
  }
  const owner = kindAt(d, pos.path);
  if (owner === "li" || owner === "dt" || owner === "dd") {
    // A plugin that owns the container decides; without one, everything pasted becomes text in the container, one block per line.
    const custom = behaviorOf(behaviors, owner)?.insertBlocks?.(d, pos, blocks, before, after);
    if (custom) return custom;
    const lines = blocks.flatMap((block): Inline[][] => (block.type === "p" || block.type === "h" ? [block.content as Inline[]] : []));
    const joined = lines.flatMap((line, i): Inline[] => (i === 0 ? line : [{ type: "br" }, ...line]));
    return { doc: setContent(d, pos.path, normalizeInline([...before, ...joined, ...after])), selection: caret({ path: pos.path, offset: inlineLength(before) + inlineLength(joined) }) };
  }
  if (!inBlockList(d, pos.path)) return cleared;

  let target: Block | undefined;
  mapBlockList(d, pos.path, (list, index) => { target = list[index]; return list; });
  const ordinal = ordinalOf(d, pos.path);
  const rest = [...blocks];
  const out: Block[] = [];
  const targetIsEmpty = content.length === 0;

  if (!targetIsEmpty && target) {
    const first = rest[0] as Block;
    if (textBlock(first)) {
      out.push({ ...target, content: normalizeInline([...before, ...first.content]) } as Block);
      rest.shift();
    } else if (before.length > 0) {
      out.push({ ...target, content: before } as Block);
    }
  }
  let mode: "end" | "tail-merged" | "tail-new" = "end";
  let tail: Block | undefined;
  if (after.length > 0) {
    const last = rest[rest.length - 1];
    if (last && textBlock(last) && (rest.length > 1 || out.length > 0 || !targetIsEmpty)) {
      tail = { ...last, content: normalizeInline([...last.content, ...after]) };
      rest.pop();
      mode = "tail-merged";
    } else {
      tail = { type: "p", content: after };
      mode = "tail-new";
    }
  }
  out.push(...rest);
  if (tail) out.push(tail);

  const result = fixup(mapBlockList(d, pos.path, (list, index) => [...list.slice(0, index), ...out, ...list.slice(index + 1)]));
  // The caret goes where the pasted content ends: the end of the last block, or just before the text that followed.
  const caretBlock = out.length - 1;
  const counts = out.map((block) => Math.max(1, blockContainers(block, [0]).length));
  const within = mode === "end" ? (counts[caretBlock] as number) - 1 : 0;
  const caretOrdinal = ordinal + counts.slice(0, caretBlock).reduce((n, c) => n + c, 0) + within;
  const path = ordinalToPath(result, caretOrdinal);
  const length = inlineLength(getContent(result, path));
  const offset = mode === "end" ? length : mode === "tail-new" ? 0 : length - inlineLength(after);
  return { doc: result, selection: caret({ path, offset }) };
}

/** Negative when `a` comes before `b` in reading order, positive when after, zero when equal. */
export const comparePos = (_doc: Doc, a: Pos, b: Pos): number => comparePath(a.path, b.path) || a.offset - b.offset;

const MOVE_MARK = "\uFDD0";

/**
 * Moves (or, with `copy`, copies) the selected content to `target`. A target inside the selection, or at
 * either of its edges, changes nothing. The target is marked in the text so it survives the removal of the source.
 */
export function moveSelection(doc: Doc, source: Selection, target: Pos, copy: boolean, behaviors?: Behaviors): EditResult {
  const { start, end } = order(doc, source);
  if (comparePos(doc, target, start) >= 0 && comparePos(doc, target, end) <= 0) return { doc, selection: source };
  const blocks = extractSelection(doc, source);
  if (copy) return insertBlocks(doc, caret(target), blocks, behaviors);

  const marked = insertText(doc, caret(target), MOVE_MARK, []).doc;
  // The marker adds one character in the target's container, ahead of any source text that follows it there.
  const shift = (pos: Pos): Pos => (pathKey(pos.path) === pathKey(target.path) && pos.offset >= target.offset ? { path: pos.path, offset: pos.offset + 1 } : pos);
  const removed = deleteSelection(marked, { anchor: shift(start), focus: shift(end) }).doc;
  const where = containerPaths(removed).find((path) => inlineText(getContent(removed, path)).includes(MOVE_MARK));
  if (!where) return { doc, selection: source };
  const offset = inlineText(getContent(removed, where)).indexOf(MOVE_MARK);
  const cleaned = deleteSelection(removed, { anchor: { path: where, offset }, focus: { path: where, offset: offset + 1 } });
  return insertBlocks(cleaned.doc, cleaned.selection, blocks, behaviors);
}

/**
 * The selected part of the document as blocks, with structure kept: a selection that covers part of a
 * list, a table or a quote comes back as that list, table or quote holding only the selected parts.
 */
export function extractSelection(doc: Doc, sel: Selection): Block[] {
  const { start, end } = order(doc, sel);
  const first = ordinalOf(doc, start.path);
  const last = ordinalOf(doc, end.path);
  let n = 0;
  const cut = (content: readonly Inline[], ordinal: number): Inline[] =>
    sliceInline(content, ordinal === first ? start.offset : 0, ordinal === last ? end.offset : Number.POSITIVE_INFINITY);
  const inRange = (ordinal: number): boolean => ordinal >= first && ordinal <= last;

  const cropList = (list: List): List | undefined => {
    const items = list.items.flatMap((item) => {
      const ordinal = n++;
      const content = inRange(ordinal) ? cut(item.content, ordinal) : [];
      const sublists = item.sublists.map(cropList).filter((l): l is List => l !== undefined);
      return inRange(ordinal) || sublists.length > 0 ? [{ content, sublists }] : [];
    });
    return items.length > 0 ? { ...list, items } : undefined;
  };
  const cropBlocks = (blocks: readonly Block[]): Block[] =>
    blocks.flatMap((block): Block[] => {
      switch (block.type) {
        case "p": case "h": {
          const ordinal = n++;
          return inRange(ordinal) ? [{ ...block, content: cut(block.content, ordinal) }] : [];
        }
        case "pre": {
          const ordinal = n++;
          if (!inRange(ordinal)) return [];
          const text = block.text.slice(ordinal === first ? start.offset : 0, ordinal === last ? end.offset : undefined);
          return [{ ...block, text }];
        }
        case "ul": case "ol": {
          const list = cropList(block);
          return list ? [list] : [];
        }
        case "dl": {
          const entries = block.entries.flatMap((entry) => {
            const ordinal = n++;
            return inRange(ordinal) ? [{ ...entry, content: cut(entry.content, ordinal) }] : [];
          });
          return entries.length > 0 ? [{ ...block, entries }] : [];
        }
        case "quote": {
          const inner = cropBlocks(block.blocks);
          return inner.length > 0 ? [{ ...block, blocks: inner }] : [];
        }
        case "table": {
          let any = false;
          const rows = block.rows.map((row) => row.map((cell) => {
            const kept = cropBlocks(cell.blocks);
            if (kept.length > 0) any = true;
            return { ...cell, blocks: kept.length > 0 ? kept : [{ type: "p", content: [] } as Block] };
          }));
          return any ? [{ ...block, rows }] : [];
        }
        case "hr": return [];
      }
    });
  return cropBlocks(doc.blocks);
}

/** Plain text of a selection, for copy. Containers are separated by newlines. */
export function selectedText(doc: Doc, sel: Selection): string {
  const { start, end } = order(doc, sel);
  const paths = containerPaths(doc);
  const s = ordinalOf(doc, start.path);
  const e = ordinalOf(doc, end.path);
  const parts: string[] = [];
  for (let i = s; i <= e; i++) {
    const content = getContent(doc, paths[i] as Path);
    parts.push(inlineText(sliceInline(content, i === s ? start.offset : 0, i === e ? end.offset : Number.POSITIVE_INFINITY)));
  }
  return parts.join("\n");
}
