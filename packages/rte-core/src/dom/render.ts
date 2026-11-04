// Draws a document into a DOM element, and maps between DOM selections and document positions.
// Every container (paragraph, heading, code block, list item) carries `data-rte="<path>"`; that is how the
// view finds a container again. The attributes live only in the editing surface, never in saved HTML.
import { lineCss, SIDES } from "../cellborder.ts";
import type { Block, CellBorder, Doc, Inline, List, Mark, TableCell } from "../model.ts";
import { pathKey, type Path, type Pos } from "../path.ts";

const BLOCK_TAGS = new Set(["UL", "OL", "DL", "DT", "DD", "TABLE", "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "HR", "LI"]);
const MARK_ORDER = ["link", "bold", "italic", "underline", "strike", "code", "sup", "sub", "color", "background"] as const;
const MARK_TAG = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", sup: "sup", sub: "sub" } as const;

function wrap(inner: Node, mark: Mark): Node {
  let el: HTMLElement;
  switch (mark.type) {
    case "link":
      el = document.createElement("a");
      el.setAttribute("href", mark.href);
      el.setAttribute("rel", "noopener noreferrer");
      if (mark.newTab) el.setAttribute("target", "_blank");
      break;
    case "color": el = document.createElement("span"); el.style.color = mark.value; break;
    case "background": el = document.createElement("span"); el.style.backgroundColor = mark.value; break;
    default: el = document.createElement(MARK_TAG[mark.type]);
  }
  el.appendChild(inner);
  return el;
}

function placeholder(): HTMLElement {
  const br = document.createElement("br");
  br.setAttribute("data-rte-ph", "");
  return br;
}

/** Above this many top-level blocks, blocks that are off screen skip layout and paint until they are needed. */
const LARGE_DOCUMENT = 200;

export interface RenderOptions {
  /** Draw `http` and `https` images with their real address. Off by default: a pasted image never causes a request. */
  readonly loadRemoteImages: boolean;
}

const isRemote = (src: string): boolean => /^https?:/i.test(src) || src.startsWith("//");

function renderInline(parent: HTMLElement, content: readonly Inline[], options: RenderOptions): void {
  for (const node of content) {
    if (node.type === "br") {
      parent.appendChild(document.createElement("br"));
      // A paragraph break leaves a gap, drawn by an empty element that is not text of the document.
      if (node.paragraph) {
        const gap = document.createElement("span");
        gap.setAttribute("data-rte-gap", "");
        gap.style.cssText = "display: block; height: 0.6em;";
        parent.appendChild(gap);
      }
    }
    else if (node.type === "note") {
      // The number is put in by renderDoc, which knows the order of the references. Not text of the document: one atom.
      const mark = document.createElement("sup");
      mark.setAttribute("data-rte-note", node.id);
      mark.setAttribute("contenteditable", "false");
      mark.setAttribute("role", "doc-noteref");
      parent.appendChild(mark);
    } else if (node.type === "image") {
      const img = document.createElement("img");
      // The address stays in the model. Without permission the view holds it in an attribute and loads nothing.
      if (isRemote(node.src) && !options.loadRemoteImages) img.setAttribute("data-rte-remote-src", node.src);
      else img.setAttribute("src", node.src);
      if (node.alt !== undefined) img.setAttribute("alt", node.alt);
      if (node.width !== undefined) img.setAttribute("width", String(node.width));
      if (node.height !== undefined) img.setAttribute("height", String(node.height));
      // A captioned image alone in its paragraph is placed by the paragraph, as the figure it is written as.
      const captioned = !!node.caption && content.length === 1;
      if (captioned) img.removeAttribute("data-rte-align");
      else if (node.align === "left") { img.style.cssText = "float: left; margin: 0 1em 0.5em 0;"; img.setAttribute("data-rte-align", "left"); }
      else if (node.align === "right") { img.style.cssText = "float: right; margin: 0 0 0.5em 1em;"; img.setAttribute("data-rte-align", "right"); }
      else if (node.align === "center") { img.style.cssText = "display: block; margin: 0 auto;"; img.setAttribute("data-rte-align", "center"); }
      parent.appendChild(img);
      // The caption of an image alone in its paragraph: drawn under it, but not text of the document (the mapping skips it).
      if (captioned && node.caption) {
        const caption = document.createElement("span");
        caption.setAttribute("data-rte-caption", "");
        caption.setAttribute("contenteditable", "false");
        caption.style.cssText = "display: block; font-size: 0.9em; opacity: 0.8;";
        caption.textContent = node.caption;
        parent.appendChild(caption);
      }
    } else {
      let out: Node = document.createTextNode(node.text);
      const sorted = [...node.marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
      for (let k = sorted.length - 1; k >= 0; k--) out = wrap(out, sorted[k] as Mark);
      parent.appendChild(out);
    }
  }
  // An empty container, or one ending in a line break, needs a placeholder so the caret has a line to sit on.
  const last = content[content.length - 1];
  if (!last || last.type === "br") parent.appendChild(placeholder());
}

/** `data-rte` holds the path inside the top-level block, without the block's own index (the block's place in the root gives that). */
function tag(name: string, path: Path): HTMLElement {
  const el = document.createElement(name);
  el.setAttribute("data-rte", pathKey(path.slice(1)));
  return el;
}

function renderList(list: List, path: readonly number[], options: RenderOptions): HTMLElement {
  const el = document.createElement(list.type);
  if (list.start !== undefined) el.setAttribute("start", String(list.start));
  if (list.style !== undefined) el.style.listStyleType = list.style;
  if (list.notes) { el.setAttribute("data-rte-notes", ""); el.setAttribute("role", "doc-endnotes"); el.setAttribute("aria-label", "Notes"); }
  list.items.forEach((item, i) => {
    const itemPath = [...path, i];
    const li = tag("li", itemPath);
    if (list.notes && item.id) li.setAttribute("data-rte-note-id", item.id);
    if (item.bare === true && item.content.length === 0 && (item.children[0]?.type === "ul" || item.children[0]?.type === "ol")) li.style.listStyleType = "none";
    if (item.checked !== undefined) {
      // A task's checkbox: not text, so the mapping between page and model skips it (data-rte-check); it is a real checkbox to assistive technology.
      li.style.listStyleType = "none";
      li.setAttribute("data-rte-task", item.checked ? "done" : "open");
      const box = document.createElement("span");
      box.setAttribute("data-rte-check", "");
      box.setAttribute("role", "checkbox");
      box.setAttribute("aria-checked", String(item.checked));
      box.setAttribute("aria-label", "Done");
      box.textContent = item.checked ? "\u2611" : "\u2610";
      li.appendChild(box);
    }
    renderInline(li, item.content, options);
    item.children.forEach((child, k) => li.appendChild(renderBlock(child, [...itemPath, k], options)));
    el.appendChild(li);
  });
  return el;
}

function renderBlock(block: Block, path: readonly number[], options: RenderOptions, cache?: RenderCache): HTMLElement {
  switch (block.type) {
    case "p": case "h": {
      const el = tag(block.type === "p" ? "p" : `h${block.level}`, path);
      if (block.align) el.style.textAlign = block.align;
      if (block.dir) el.dir = block.dir;
      if (block.indent) el.style[block.dir === "rtl" ? "marginRight" : "marginLeft"] = `${block.indent * 2}em`;
      renderInline(el, block.content, options);
      return el;
    }
    case "pre": {
      const el = tag("pre", path);
      el.appendChild(document.createTextNode(block.text));
      if (block.text === "" || block.text.endsWith("\n")) el.appendChild(placeholder());
      return el;
    }
    case "ul": case "ol": return renderList(block, path, options);
    case "dl": {
      const el = document.createElement("dl");
      block.entries.forEach((entry, i) => {
        const row = tag(entry.kind === "term" ? "dt" : "dd", [...path, i]);
        renderInline(row, entry.content, options);
        el.appendChild(row);
      });
      return el;
    }
    case "quote": {
      const el = document.createElement("blockquote");
      block.blocks.forEach((inner, n) => el.appendChild(renderBlock(inner, [...path, n], options, cache)));
      return el;
    }
    case "table": {
      // An edit to a table changes one cell and the row and table around it; the rest keeps its elements, so the browser has no reason
      // to lay out the whole table again. The table's own element is found through a cell that did not change.
      const claimed = cache?.claimed;
      const where = path.join(",");
      let table: HTMLElement | undefined;
      for (const row of block.rows) {
        for (const cell of row) {
          const found = cache?.cells.get(cell)?.el.closest("table");
          if (found && !claimed?.has(found) && !cache?.dirty.has(found)) { table = found; break; }
        }
        if (table) break;
      }
      table ??= document.createElement("table");
      claimed?.add(table);
      // Column widths: a colgroup in front of the body, present only when some column has a width.
      let group = table.querySelector(":scope > colgroup");
      if (block.widths) {
        if (!group) table.insertBefore((group = document.createElement("colgroup")), table.firstChild);
        // Only touched when a width changed: redrawing identical columns would make the browser lay the table out again.
        const drawn = [...group.children].map((c) => (c as HTMLElement).style.width);
        if (drawn.length !== block.widths.length || block.widths.some((w, i) => (w ?? "") !== drawn[i])) {
          group.replaceChildren(...block.widths.map((w) => {
            const col = document.createElement("col");
            if (w) col.style.width = w;
            return col;
          }));
        }
      } else group?.remove();
      let body = table.querySelector(":scope > tbody") as HTMLElement | null;
      if (!body) table.appendChild((body = document.createElement("tbody")));
      const trs = block.rows.map((row, r) => {
        const rowKey = `${where},${r}|${options.loadRemoteImages}|${block.heights?.[r] ?? ""}`;
        const kept = cache?.rows.get(row);
        if (kept && kept.key === rowKey && !claimed?.has(kept.el) && !cache?.dirty.has(kept.el)) { claimed?.add(kept.el); return kept.el; }
        const tr = document.createElement("tr");
        const height = block.heights?.[r];
        if (height) tr.style.height = height;
        const tds = row.map((cell, c) => {
          const key = `${where},${r},${c}|${options.loadRemoteImages}`;
          const hit = cache?.cells.get(cell);
          if (hit && hit.key === key && !claimed?.has(hit.el) && !cache?.dirty.has(hit.el)) { claimed?.add(hit.el); return hit.el; }
          const td = document.createElement(cell.header ? "th" : "td");
          if (cell.background) td.style.backgroundColor = cell.background;
          if (cell.border !== undefined && !cell.borders) td.style.border = lineCss(cell.border);
          else if (cell.borders) for (const side of SIDES) if (cell.borders[side] !== undefined) td.style.setProperty(`border-${side}`, lineCss(cell.borders[side] as CellBorder | null));
          if (cell.colspan > 1) td.setAttribute("colspan", String(cell.colspan));
          if (cell.rowspan > 1) td.setAttribute("rowspan", String(cell.rowspan));
          cell.blocks.forEach((inner, n) => td.appendChild(renderBlock(inner, [...path, r, c, n], options, cache)));
          cache?.cells.set(cell, { el: td, key });
          claimed?.add(td);
          return td;
        });
        reconcile(tr, tds);
        cache?.rows.set(row, { el: tr, key: rowKey });
        claimed?.add(tr);
        return tr;
      });
      reconcile(body, trs);
      return table;
    }
    case "hr": {
      const hr = document.createElement("hr");
      hr.setAttribute("contenteditable", "false");
      return hr;
    }
  }
}

/** Makes the children of `parent` be `wanted`, in order, touching only what differs. */
function reconcile(parent: Node, wanted: readonly Node[]): void {
  const keep = new Set<Node>(wanted);
  for (const node of [...parent.childNodes]) if (!keep.has(node)) parent.removeChild(node);
  let cursor: ChildNode | null = parent.firstChild;
  for (const el of wanted) {
    if (cursor === el) cursor = cursor.nextSibling;
    else parent.insertBefore(el, cursor);
  }
}

/** Remembers the drawn element of each top-level block, so an unchanged block is not drawn again. */
export interface RenderCache {
  readonly drawn: WeakMap<Block, HTMLElement>;
  /** Top-level elements something other than the editor changed (an extension, an input method). They are drawn again. */
  readonly dirty: Set<Node>;
  /** The drawn element of each table cell, with the place it was drawn for. */
  readonly cells: WeakMap<TableCell, { readonly el: HTMLElement; readonly key: string }>;
  /** The drawn element of each table row. */
  readonly rows: WeakMap<readonly TableCell[], { readonly el: HTMLElement; readonly key: string }>;
  /** Table elements already used in the drawing in progress, so one element is never put in two places. */
  readonly claimed: Set<Node>;
}
export const createRenderCache = (): RenderCache => ({ drawn: new WeakMap(), dirty: new Set(), cells: new WeakMap(), rows: new WeakMap(), claimed: new Set() });

/**
 * Draws the document into `root`. Blocks that are the same objects as last time, and are untouched, are kept as
 * they are; only changed, new or disturbed blocks are drawn. Edits keep untouched blocks as the same objects, so
 * the cost of an edit is the blocks it changed, wherever they sit and however many blocks follow them.
 */
export function renderDoc(doc: Doc, root: HTMLElement, options: RenderOptions = { loadRemoteImages: false }, cache: RenderCache = createRenderCache()): void {
  cache.claimed.clear();
  const wanted: HTMLElement[] = doc.blocks.map((block, b) => {
    const hit = cache.drawn.get(block);
    if (hit && !cache.dirty.has(hit) && hit.getAttribute("data-rte-remote") === String(options.loadRemoteImages)) return hit;
    const el = renderBlock(block, [b], options, cache);
    el.setAttribute("data-rte-remote", String(options.loadRemoteImages));
    if (doc.blocks.length > LARGE_DOCUMENT) {
      // Off-screen blocks skip layout and paint, which is most of the cost of a long document. They stay searchable and selectable.
      el.style.contentVisibility = "auto";
      el.style.setProperty("contain-intrinsic-block-size", "auto 1.5em");
    }
    cache.drawn.set(block, el);
    return el;
  });
  cache.dirty.clear();
  cache.claimed.clear();
  // Bring the root's children into line with `wanted`, moving as little as possible: first drop what is no longer
  // wanted, then walk both lists together, inserting only what is new or has moved.
  reconcile(root, wanted);
  // A reference shows its place among the references, which an edit far above it can change, so every one is numbered again.
  root.querySelectorAll("sup[data-rte-note]").forEach((mark, i) => {
    const n = String(i + 1);
    if (mark.textContent !== n) { mark.textContent = n; mark.setAttribute("aria-label", `Footnote ${n}`); }
  });
}

// ---- selection mapping ------------------------------------------------------------------------------------

/** The text and atoms (line breaks, images) that belong to a container itself, in order. Nested blocks are skipped. */
function* inlineItems(container: Element): Generator<Node> {
  const stack: Node[][] = [[...container.childNodes].reverse()];
  while (stack.length > 0) {
    const level = stack[stack.length - 1] as Node[];
    const node = level.pop();
    if (!node) {
      stack.pop();
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) yield node;
    else if (node instanceof Element) {
      if (node.hasAttribute("data-rte-ph") || node.hasAttribute("data-rte-check") || node.hasAttribute("data-rte-caption") || BLOCK_TAGS.has(node.tagName)) continue;
      if (node.tagName === "BR" || node.tagName === "IMG" || node.hasAttribute("data-rte-note")) yield node;
      else stack.push([...node.childNodes].reverse());
    }
  }
}

const sizeOf = (node: Node): number => (node.nodeType === Node.TEXT_NODE ? (node.nodeValue ?? "").length : 1);

const containerOf = (root: HTMLElement, node: Node): HTMLElement | null => {
  const element = node instanceof Element ? node : node.parentElement;
  const found = element?.closest("[data-rte]") ?? null;
  return found && root.contains(found) ? (found as HTMLElement) : null;
};

const parsePath = (key: string): Path => (key === "" ? [] : key.split(".").map(Number));

/** The element directly under the root that holds `node`, and its index among the root's children. */
function topLevel(root: HTMLElement, node: Node): { el: HTMLElement; index: number } | null {
  let el: Node | null = node;
  while (el && el.parentNode !== root) el = el.parentNode;
  if (!(el instanceof HTMLElement)) return null;
  let index = 0;
  for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) index++;
  return { el, index };
}

/** The container element at a path, found by following the path from its top-level block. */
export function containerAt(root: HTMLElement, path: Path): HTMLElement | null {
  const top = root.children[path[0] as number];
  if (!(top instanceof HTMLElement)) return null;
  const relative = pathKey(path.slice(1));
  if (relative === "") return top.hasAttribute("data-rte") ? top : null;
  return top.querySelector<HTMLElement>(`[data-rte="${relative}"]`);
}

export function posFromDom(root: HTMLElement, node: Node, offset: number): Pos | null {
  const container = containerOf(root, node);
  const top = container ? topLevel(root, container) : null;
  if (!container || !top) return null;
  const pathOf = (): Path => [top.index, ...parsePath(container.getAttribute("data-rte") as string)];
  // A caret that lands on a task's checkbox is at the start of the item's text.
  const box = (node instanceof Element ? node : node.parentElement)?.closest("[data-rte-check]");
  if (box && container.contains(box)) return { path: pathOf(), offset: 0 };
  let count = 0;
  const isElement = node.nodeType !== Node.TEXT_NODE;
  const boundary = isElement ? node.childNodes[offset] : undefined;
  for (const item of inlineItems(container)) {
    if (!isElement) {
      if (item === node) return { path: pathOf(), offset: count + offset };
    } else if (boundary) {
      // Items before the boundary child count; the boundary child and everything after it do not.
      if (boundary === item || boundary.contains(item) || !(boundary.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING)) break;
    } else if (!(node.contains(item) || node.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING)) break;
    count += sizeOf(item);
  }
  return { path: pathOf(), offset: count };
}

export function domFromPos(root: HTMLElement, pos: Pos): { node: Node; offset: number } | null {
  const container = containerAt(root, pos.path);
  if (!container) return null;
  let count = 0;
  for (const item of inlineItems(container)) {
    const size = sizeOf(item);
    if (item.nodeType === Node.TEXT_NODE) {
      if (pos.offset <= count + size) return { node: item, offset: pos.offset - count };
    } else if (pos.offset <= count) {
      return { node: item.parentNode as Node, offset: [...(item.parentNode as Node).childNodes].indexOf(item as ChildNode) };
    }
    count += size;
  }
  // At the end of the text: before any nested block, so the caret stays on this container's last line.
  const firstBlock = [...container.childNodes].findIndex((child) => child instanceof Element && BLOCK_TAGS.has(child.tagName));
  const placeholderAt = [...container.childNodes].findIndex((child) => child instanceof Element && child.hasAttribute("data-rte-ph"));
  const index = placeholderAt !== -1 ? placeholderAt : firstBlock !== -1 ? firstBlock : container.childNodes.length;
  return { node: container, offset: index };
}

/** Number of characters the container holds, as the view sees it. Used to check the view against the model. */
export function measureContainer(container: Element): number {
  let n = 0;
  for (const item of inlineItems(container)) n += sizeOf(item);
  return n;
}

