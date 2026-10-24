// Setting and removing links on a selection.
import { inlineLength, normalizeInline, type Doc, type Inline, type Mark } from "./model.ts";
import { sliceInline } from "./edit.ts";
import { safeUrl } from "./import.ts";
import { comparePath, getContent, isCollapsed, pathKey, selectedContainers, setContent, type EditResult, type Path, type Selection } from "./path.ts";

const DEFAULT_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

const hrefOf = (marks: readonly Mark[]): string | undefined => {
  const link = marks.find((m) => m.type === "link");
  return link && link.type === "link" ? link.href : undefined;
};
const newTabOf = (marks: readonly Mark[]): boolean => marks.some((m) => m.type === "link" && m.newTab === true);

/** The offsets of the link that covers a caret position, if any: the text before the caret decides, then the text after. */
function linkRunAt(content: readonly Inline[], offset: number): { from: number; to: number; href: string } | undefined {
  let pos = 0;
  let found: { from: number; to: number; href: string } | undefined;
  for (const node of content) {
    const length = node.type === "text" ? node.text.length : 1;
    const href = node.type === "text" ? hrefOf(node.marks) : undefined;
    if (href !== undefined && ((pos < offset && offset <= pos + length) || (offset === 0 && pos === 0))) {
      // Grow the run over neighbouring text that carries the same link.
      let from = pos;
      let to = pos + length;
      let at = 0;
      for (const other of content) {
        const size = other.type === "text" ? other.text.length : 1;
        if (other.type === "text" && hrefOf(other.marks) === href) {
          if (at + size === from) from = at;
          if (at === to) to = at + size;
        }
        at += size;
      }
      found = { from, to, href };
      break;
    }
    pos += length;
  }
  return found;
}

/** The address of the link at the selection: at the caret, or on the selected text if it is all one link. */
export function linkAt(doc: Doc, sel: Selection): string | undefined {
  if (isCollapsed(sel)) return linkRunAt(getContent(doc, sel.focus.path), sel.focus.offset)?.href;
  if (pathKey(sel.anchor.path) !== pathKey(sel.focus.path)) return undefined;
  const content = getContent(doc, sel.focus.path);
  const hrefs = sliceInline(content, Math.min(sel.anchor.offset, sel.focus.offset), Math.max(sel.anchor.offset, sel.focus.offset))
    .map((node) => (node.type === "text" ? hrefOf(node.marks) : undefined));
  const first = hrefs[0];
  return first !== undefined && hrefs.every((h) => h === first) ? first : undefined;
}

/** Whether the link at the selection opens in a new tab (false when there is no link). */
export function linkNewTabAt(doc: Doc, sel: Selection): boolean {
  const content = getContent(doc, sel.focus.path);
  const offset = isCollapsed(sel) ? sel.focus.offset : Math.min(sel.anchor.offset, sel.focus.offset) + 1;
  let pos = 0;
  for (const node of content) {
    const length = node.type === "text" ? node.text.length : 1;
    if (node.type === "text" && hrefOf(node.marks) !== undefined && ((pos < offset && offset <= pos + length) || (offset === 0 && pos === 0))) return newTabOf(node.marks);
    pos += length;
  }
  return false;
}

/**
 * Sets a link on the selected text, or removes it when `href` is undefined. With a caret inside a link, the whole link is
 * edited. An address the URL policy refuses (a script, a local path) is not set. Returns nothing changed in that case.
 */
export function setLink(doc: Doc, sel: Selection, href: string | undefined, newTab = false): EditResult {
  const safe = href === undefined ? undefined : safeUrl(href, DEFAULT_SCHEMES);
  if (href !== undefined && safe === undefined) return { doc, selection: sel };
  let next = doc;
  const apply = (path: Path, from: number, to: number): void => {
    const content = getContent(next, path);
    if (from >= to) return;
    const middle = sliceInline(content, from, to).map((node): Inline => {
      if (node.type !== "text") return node;
      const marks = node.marks.filter((m) => m.type !== "link");
      return { ...node, marks: safe === undefined ? marks : [{ type: "link", href: safe, ...(newTab ? { newTab: true } : {}) }, ...marks] };
    });
    next = setContent(next, path, normalizeInline([...sliceInline(content, 0, from), ...middle, ...sliceInline(content, to)]));
  };
  if (isCollapsed(sel)) {
    const run = linkRunAt(getContent(doc, sel.focus.path), sel.focus.offset);
    if (run) apply(sel.focus.path, run.from, run.to);
    return { doc: next, selection: sel };
  }
  const paths = selectedContainers(doc, sel);
  const forward = comparePath(sel.anchor.path, sel.focus.path) < 0 || (comparePath(sel.anchor.path, sel.focus.path) === 0 && sel.anchor.offset <= sel.focus.offset);
  const start = forward ? sel.anchor : sel.focus;
  const end = forward ? sel.focus : sel.anchor;
  paths.forEach((path, i) => apply(path, i === 0 ? start.offset : 0, i === paths.length - 1 ? end.offset : inlineLength(getContent(doc, path))));
  return { doc: next, selection: sel };
}
