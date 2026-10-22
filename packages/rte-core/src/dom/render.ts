// Draws a document into a DOM element, and maps between DOM selections and document positions.
// Every container (paragraph, heading, code block, list item) carries `data-rte="<path>"`; that is how the
// view finds a container again. The attributes live only in the editing surface, never in saved HTML.
import type { Block, Doc, Inline, List, Mark } from "../model.ts";
import { pathKey, type Path, type Pos } from "../path.ts";

const BLOCK_TAGS = new Set(["UL", "OL", "TABLE", "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "HR", "LI"]);
const MARK_ORDER = ["link", "bold", "italic", "underline", "strike", "code", "sup", "sub", "color", "background"] as const;
const MARK_TAG = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", sup: "sup", sub: "sub" } as const;

function wrap(inner: Node, mark: Mark): Node {
  let el: HTMLElement;
  switch (mark.type) {
    case "link":
      el = document.createElement("a");
      el.setAttribute("href", mark.href);
      el.setAttribute("rel", "noopener noreferrer");
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

export interface RenderOptions {
  /** Draw `http` and `https` images with their real address. Off by default: a pasted image never causes a request. */
  readonly loadRemoteImages: boolean;
}

const isRemote = (src: string): boolean => /^https?:/i.test(src) || src.startsWith("//");

function renderInline(parent: HTMLElement, content: readonly Inline[], options: RenderOptions): void {
  for (const node of content) {
    if (node.type === "br") parent.appendChild(document.createElement("br"));
    else if (node.type === "image") {
      const img = document.createElement("img");
      // The address stays in the model. Without permission the view holds it in an attribute and loads nothing.
      if (isRemote(node.src) && !options.loadRemoteImages) img.setAttribute("data-rte-remote-src", node.src);
      else img.setAttribute("src", node.src);
      if (node.alt !== undefined) img.setAttribute("alt", node.alt);
      if (node.width !== undefined) img.setAttribute("width", String(node.width));
      if (node.height !== undefined) img.setAttribute("height", String(node.height));
      parent.appendChild(img);
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

function tag(name: string, path: Path): HTMLElement {
  const el = document.createElement(name);
  el.setAttribute("data-rte", pathKey(path));
  return el;
}

function renderList(list: List, path: readonly number[], options: RenderOptions): HTMLElement {
  const el = document.createElement(list.type);
  if (list.start !== undefined) el.setAttribute("start", String(list.start));
  if (list.style !== undefined) el.style.listStyleType = list.style;
  list.items.forEach((item, i) => {
    const itemPath = [...path, i];
    const li = tag("li", itemPath);
    renderInline(li, item.content, options);
    item.sublists.forEach((sub, k) => li.appendChild(renderList(sub, [...itemPath, k], options)));
    el.appendChild(li);
  });
  return el;
}

function renderBlock(block: Block, path: readonly number[], options: RenderOptions): HTMLElement {
  switch (block.type) {
    case "p": case "h": {
      const el = tag(block.type === "p" ? "p" : `h${block.level}`, path);
      if (block.align) el.style.textAlign = block.align;
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
    case "quote": {
      const el = document.createElement("blockquote");
      block.blocks.forEach((inner, n) => el.appendChild(renderBlock(inner, [...path, n], options)));
      return el;
    }
    case "table": {
      const table = document.createElement("table");
      const body = document.createElement("tbody");
      block.rows.forEach((row, r) => {
        const tr = document.createElement("tr");
        row.forEach((cell, c) => {
          const td = document.createElement(cell.header ? "th" : "td");
          if (cell.colspan > 1) td.setAttribute("colspan", String(cell.colspan));
          if (cell.rowspan > 1) td.setAttribute("rowspan", String(cell.rowspan));
          cell.blocks.forEach((inner, n) => td.appendChild(renderBlock(inner, [...path, r, c, n], options)));
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      return table;
    }
    case "hr": {
      const hr = document.createElement("hr");
      hr.setAttribute("contenteditable", "false");
      return hr;
    }
  }
}

export function renderDoc(doc: Doc, root: HTMLElement, options: RenderOptions = { loadRemoteImages: false }): void {
  const fragment = document.createDocumentFragment();
  doc.blocks.forEach((block, b) => fragment.appendChild(renderBlock(block, [b], options)));
  root.replaceChildren(fragment);
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
      if (node.hasAttribute("data-rte-ph") || BLOCK_TAGS.has(node.tagName)) continue;
      if (node.tagName === "BR" || node.tagName === "IMG") yield node;
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

const parsePath = (key: string): Path => key.split(".").map(Number);

export function posFromDom(root: HTMLElement, node: Node, offset: number): Pos | null {
  const container = containerOf(root, node);
  if (!container) return null;
  let count = 0;
  const isElement = node.nodeType !== Node.TEXT_NODE;
  const boundary = isElement ? node.childNodes[offset] : undefined;
  for (const item of inlineItems(container)) {
    if (!isElement) {
      if (item === node) return { path: parsePath(container.getAttribute("data-rte") as string), offset: count + offset };
    } else if (boundary) {
      // Items before the boundary child count; the boundary child and everything after it do not.
      if (boundary === item || boundary.contains(item) || !(boundary.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING)) break;
    } else if (!(node.contains(item) || node.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING)) break;
    count += sizeOf(item);
  }
  return { path: parsePath(container.getAttribute("data-rte") as string), offset: count };
}

export function domFromPos(root: HTMLElement, pos: Pos): { node: Node; offset: number } | null {
  const container = root.querySelector(`[data-rte="${pathKey(pos.path)}"]`);
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

