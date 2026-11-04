// A small, forgiving HTML parser with no DOM. It builds a tree of elements and text and never throws.
// It does not try to repair structure the way a browser does. Callers that care (the importer) read the
// tree as flow content and rebuild structure themselves. It only closes what the markup leaves open in
// the places where leaving them open would change meaning: list items, table parts and paragraphs.
import { decodeEntities } from "./entities.ts";

export interface HElement {
  readonly type: "el";
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: HNode[];
}
export interface HText {
  readonly type: "text";
  readonly text: string;
}
export type HNode = HElement | HText;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "title", "noscript", "template"]);
const BLOCKS_CLOSING_P = new Set([
  "p", "div", "ul", "ol", "dl", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "hr",
  "li", "dd", "dt", "address", "section", "article", "header", "footer", "aside", "nav", "figure", "form",
]);

const TAG_NAME = /[A-Za-z][^\s/>]*/y;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

/** Deepest nesting read when the caller does not say. */
export const DEFAULT_MAX_DEPTH = 100;

/**
 * Parses markup into nodes. Tag and attribute names are lower-cased and entities in text and values are decoded. An element
 * that would nest deeper than `maxDepth` is left out and what is inside it stays in the deepest element allowed, so the tree is
 * never deeper than that however the markup is written.
 */
export function parseHtml(source: string, maxDepth = DEFAULT_MAX_DEPTH): HNode[] {
  const root: HElement = { type: "el", tag: "#root", attrs: {}, children: [] };
  const stack: HElement[] = [root];
  const top = (): HElement => stack[stack.length - 1] as HElement;
  const addText = (text: string): void => {
    if (text === "") return;
    const parent = top();
    const last = parent.children[parent.children.length - 1];
    if (last?.type === "text") parent.children[parent.children.length - 1] = { type: "text", text: last.text + text };
    else parent.children.push({ type: "text", text });
  };
  /** Pops elements until one named in `names` has been popped, but never past a scope boundary. */
  const closeWithin = (names: ReadonlySet<string>, boundary: ReadonlySet<string>): void => {
    for (let i = stack.length - 1; i > 0; i--) {
      const tag = (stack[i] as HElement).tag;
      if (names.has(tag)) {
        stack.length = i;
        return;
      }
      if (boundary.has(tag)) return;
    }
  };

  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      addText(decodeEntities(source.slice(i)));
      break;
    }
    if (lt > i) addText(decodeEntities(source.slice(i, lt)));
    i = lt;

    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (source[i + 1] === "!" || source[i + 1] === "?") {
      // Doctype, processing instruction, CDATA or a conditional-comment marker such as <![if !supportLists]>.
      const end = source.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const closing = source[i + 1] === "/";
    TAG_NAME.lastIndex = i + (closing ? 2 : 1);
    const nameMatch = TAG_NAME.exec(source);
    if (!nameMatch) {
      addText("<");
      i += 1;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    let j = TAG_NAME.lastIndex;
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    while (j < n && source[j] !== ">") {
      if (source[j] === "/") {
        selfClosing = true;
        j++;
        continue;
      }
      if (/\s/.test(source[j] as string)) {
        j++;
        continue;
      }
      ATTRIBUTE.lastIndex = j;
      const attr = ATTRIBUTE.exec(source);
      if (!attr) {
        j++;
        continue;
      }
      selfClosing = false;
      const name = (attr[1] as string).toLowerCase();
      if (!(name in attrs)) attrs[name] = decodeEntities(attr[2] ?? attr[3] ?? attr[4] ?? "");
      j = ATTRIBUTE.lastIndex;
    }
    i = j < n ? j + 1 : n;

    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if ((stack[k] as HElement).tag === tag) {
          stack.length = k;
          break;
        }
        if (tag !== "table" && (stack[k] as HElement).tag === "table") break;
      }
      continue;
    }

    if (RAW.has(tag) && !selfClosing) {
      // Swallow the body of script, style and similar elements without parsing it.
      const close = new RegExp(`</${tag}\\s*>`, "i");
      const rest = source.slice(i);
      const found = close.exec(rest);
      const body = found ? rest.slice(0, found.index) : rest;
      i += found ? found.index + found[0].length : rest.length;
      if (tag === "textarea") {
        const el: HElement = { type: "el", tag, attrs, children: [{ type: "text", text: decodeEntities(body) }] };
        top().children.push(el);
      }
      continue;
    }

    // Implied end tags.
    if (tag === "li") closeWithin(new Set(["li"]), new Set(["ul", "ol"]));
    else if (tag === "dt" || tag === "dd") closeWithin(new Set(["dt", "dd"]), new Set(["dl"]));
    else if (tag === "td" || tag === "th") closeWithin(new Set(["td", "th"]), new Set(["tr", "table"]));
    else if (tag === "tr") closeWithin(new Set(["tr"]), new Set(["table"]));
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") closeWithin(new Set(["thead", "tbody", "tfoot"]), new Set(["table"]));
    if (BLOCKS_CLOSING_P.has(tag)) closeWithin(new Set(["p"]), new Set(["li", "td", "th", "table", "blockquote", "div", "ul", "ol"]));
    const void_ = VOID.has(tag);
    if (!void_ && stack.length > maxDepth) continue;
    const el: HElement = { type: "el", tag, attrs, children: [] };
    top().children.push(el);
    if (!void_) stack.push(el);
  }
  return root.children;
}

export function findAll(nodes: readonly HNode[], tag: string, out: HElement[] = []): HElement[] {
  for (const node of nodes) {
    if (node.type !== "el") continue;
    if (node.tag === tag) out.push(node);
    findAll(node.children, tag, out);
  }
  return out;
}
