// Finding text in a document and replacing it. Pure functions over the document, like the other edit operations. A match lies inside one
// container (paragraph, list item, cell...): text is searched as written, so a match never runs across a line break's paragraph or a cell.
import { insertText, sliceInline } from "../edit.ts";
import { inlineText } from "../model.ts";
import type { Doc } from "../model.ts";
import { caret, containerPaths, getContent, pathKey, type EditResult, type Path, type Selection } from "../path.ts";

export interface Search {
  readonly query: string;
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
}

export interface Match {
  readonly path: Path;
  readonly from: number;
  readonly to: number;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every place the query occurs, in document order. An empty query finds nothing. */
export function findMatches(doc: Doc, search: Search): Match[] {
  if (search.query === "") return [];
  const word = "[\\p{L}\\p{M}\\p{N}_]";
  const body = escapeRegExp(search.query);
  const pattern = new RegExp(search.wholeWord ? `(?<!${word})${body}(?!${word})` : body, search.matchCase ? "gu" : "giu");
  const found: Match[] = [];
  for (const path of containerPaths(doc)) {
    const text = inlineText(getContent(doc, path));
    if (text.length < search.query.length) continue;
    for (const m of text.matchAll(pattern)) {
      if (m[0].length > 0) found.push({ path, from: m.index, to: m.index + m[0].length });
    }
  }
  return found;
}

const selectionOf = (m: Match): Selection => ({ anchor: { path: m.path, offset: m.from }, focus: { path: m.path, offset: m.to } });

/** Which match the selection is exactly on, or -1. */
export function currentMatch(matches: readonly Match[], sel: Selection): number {
  const a = sel.anchor;
  const f = sel.focus;
  if (pathKey(a.path) !== pathKey(f.path)) return -1;
  const from = Math.min(a.offset, f.offset);
  const to = Math.max(a.offset, f.offset);
  return matches.findIndex((m) => pathKey(m.path) === pathKey(a.path) && m.from === from && m.to === to);
}

/** The match to go to from the selection: the next one after it (or the previous one before it), wrapping round at the ends. */
export function stepMatch(doc: Doc, matches: readonly Match[], sel: Selection, direction: "next" | "previous"): number {
  if (matches.length === 0) return -1;
  const order = new Map(containerPaths(doc).map((p, i) => [pathKey(p), i]));
  const at = (path: Path, offset: number): number => (order.get(pathKey(path)) ?? 0) * 1e9 + offset;
  const first = at(sel.anchor.path, sel.anchor.offset);
  const second = at(sel.focus.path, sel.focus.offset);
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  if (direction === "next") {
    // From the end of the selection, so a selected match steps on to the one after it.
    const hit = matches.findIndex((m) => at(m.path, m.from) >= (currentMatch(matches, sel) >= 0 ? end : start));
    return hit === -1 ? 0 : hit;
  }
  for (let i = matches.length - 1; i >= 0; i--) if (at((matches[i] as Match).path, (matches[i] as Match).from) < start) return i;
  return matches.length - 1;
}

/** Selects one match. */
export function selectMatch(doc: Doc, matches: readonly Match[], index: number, sel: Selection): EditResult {
  const m = matches[index];
  return m ? { doc, selection: selectionOf(m) } : { doc, selection: sel };
}

/** Puts the text in place of one match, in the formatting of the match's first character (the whole match usually has one). */
function replaceAt(doc: Doc, match: Match, text: string): EditResult {
  const first = sliceInline(getContent(doc, match.path), match.from, match.from + 1)[0];
  return insertText(doc, selectionOf(match), text, first?.type === "text" ? first.marks : []);
}

/** Replaces every match, last first so earlier ones keep their places. The text takes the formatting of what it replaces. */
export function replaceMatches(doc: Doc, matches: readonly Match[], text: string): Doc {
  let next = doc;
  for (let i = matches.length - 1; i >= 0; i--) next = replaceAt(next, matches[i] as Match, text).doc;
  return next;
}

/** Replaces one match and puts the caret after the new text. */
export function replaceOne(doc: Doc, match: Match, text: string): EditResult {
  const result = replaceAt(doc, match, text);
  return { doc: result.doc, selection: caret({ path: match.path, offset: match.from + text.length }) };
}
