// HTML and plain text in, document model out. This is the one pipeline for load, set-content, paste and drop:
// it parses without a DOM, applies the allow-lists, then builds the model, so nothing unsafe is ever created.
import { decodeEntities } from "./html/entities.ts";
import { parseHtml, type HElement, type HNode } from "./html/parse.ts";
import {
  normalizeInline, type Align, type Block, type Doc, type Inline, type List, type ListItem, type Mark, type Paragraph,
  type TableCell,
} from "./model.ts";

export interface ImportOptions {
  /**
   * `semantic` keeps only meaning (bold, italic, underline, strike, super/subscript, list markers, spans).
   * `allowlist` also keeps text color, background color and alignment. Paste uses `semantic`.
   */
  readonly styles?: "semantic" | "allowlist";
  /** URL schemes a link may use besides relative and fragment addresses. */
  readonly linkSchemes?: readonly string[];
  /** Keep empty paragraphs. Content that is loaded keeps them; pasted content does not. */
  readonly keepEmptyBlocks?: boolean;
  /** Largest `data:` image address, in characters. */
  readonly maxDataImageLength?: number;
}

interface Settings {
  readonly allowStyles: boolean;
  readonly schemes: ReadonlySet<string>;
  readonly keepEmpty: boolean;
  readonly maxData: number;
}

const DROP = new Set([
  "script", "style", "link", "meta", "base", "object", "embed", "iframe", "frame", "frameset", "noscript", "template",
  "head", "textarea", "input", "select", "option", "button", "canvas", "audio", "video", "applet", "xml",
]);
const CONTAINERS = new Set([
  "div", "section", "article", "header", "footer", "aside", "nav", "figure", "figcaption", "address", "main", "form",
  "body", "html", "center", "details", "summary", "dd", "dt", "dl", "fieldset", "hgroup",
]);
const MARK_TAGS: Record<string, "bold" | "italic" | "underline" | "strike" | "code" | "sup" | "sub"> = {
  strong: "bold", b: "bold", em: "italic", i: "italic", cite: "italic", dfn: "italic", var: "italic", u: "underline", ins: "underline",
  s: "strike", strike: "strike", del: "strike", code: "code", tt: "code", kbd: "code", samp: "code", sup: "sup", sub: "sub",
};
const RASTER = [
  ["image/png", "iVBORw0KGgo"], ["image/jpeg", "/9j/"], ["image/gif", "R0lGOD"], ["image/webp", "UklGR"], ["image/bmp", "Qk"],
] as const;
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

export function parseStyle(style: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!style) return out;
  let depth = 0;
  let quote = "";
  let start = 0;
  const flush = (end: number): void => {
    const part = style.slice(start, end);
    const colon = part.indexOf(":");
    if (colon > 0) out.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim().replace(/\s*!important$/i, ""));
  };
  for (let i = 0; i < style.length; i++) {
    const ch = style[i] as string;
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      flush(i);
      start = i + 1;
    }
  }
  flush(style.length);
  return out;
}

const INVISIBLE = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

/** Returns the address when its scheme is allowed, otherwise undefined. Obfuscation with spaces, tabs or entities does not help. */
export function safeUrl(raw: string | undefined, schemes: ReadonlySet<string>): string | undefined {
  if (raw === undefined) return undefined;
  // Browsers ignore control characters and spaces anywhere inside the scheme, so the check ignores them too.
  const probe = raw.replace(INVISIBLE, "");
  // A backslash means a local or network path, which would leak the copier's folder names.
  if (probe === "" || probe.includes("\\")) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe);
  if (scheme && !schemes.has((scheme[1] as string).toLowerCase())) return undefined;
  return raw.trim();
}

/** Returns the image address when it is a remote address or a real raster image, otherwise undefined. */
function safeImageSrc(raw: string | undefined, settings: Settings): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (/^data:/i.test(value)) {
    if (value.length > settings.maxData) return undefined;
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]{8,})/i.exec(value);
    if (!match) return undefined;
    const body = match[2] as string;
    // Trust the bytes, not the declared type: the start of the data must match a raster format.
    return RASTER.some(([, magic]) => body.startsWith(magic)) ? value : undefined;
  }
  return safeUrl(value, new Set(["http", "https"]));
}

interface Ctx {
  readonly marks: readonly Mark[];
  readonly inLink: boolean;
  readonly pre: boolean;
}

interface Li {
  content: Inline[];
  sublists: L[];
  level?: number;
  listId?: string;
}
interface L {
  type: "ul" | "ol";
  start?: number;
  style?: string;
  items: Li[];
}
type Out = Block | L;

class Sink {
  blocks: Out[] = [];
  run: Inline[] = [];
  readonly settings: Settings;
  constructor(settings: Settings) {
    this.settings = settings;
  }

  text(value: string, marks: readonly Mark[], pre: boolean): void {
    if (value === "") return;
    if (pre) {
      this.push({ type: "text", text: value.replace(/\r\n?/g, "\n"), marks });
      return;
    }
    let collapsed = value.replace(/[ \t\n\r\f]+/g, " ");
    const last = this.run[this.run.length - 1];
    const atStart = last === undefined || last.type === "br" || (last.type === "text" && last.text.endsWith(" "));
    if (atStart && collapsed.startsWith(" ")) collapsed = collapsed.slice(1);
    this.push({ type: "text", text: collapsed, marks });
  }

  push(node: Inline): void {
    if (node.type === "text" && node.text === "") return;
    this.run.push(node);
  }

  /** Turns the pending inline run into a block. A trailing line break is a placeholder and is dropped. */
  flush(make: (content: Inline[]) => Block = (content) => ({ type: "p", content }), explicit = false): void {
    let content = normalizeInline(this.run);
    this.run = [];
    const last = content[content.length - 1];
    if (last?.type === "text" && last.text.endsWith(" ")) {
      const trimmed = last.text.replace(/ +$/, "");
      content = [...content.slice(0, -1), ...(trimmed ? [{ ...last, text: trimmed }] : [])];
    }
    if (content[content.length - 1]?.type === "br") content = content.slice(0, -1);
    // Only a paragraph or heading the author actually wrote may be empty. Boundaries between containers never add one.
    if (content.length === 0 && !(explicit && this.settings.keepEmpty)) return;
    this.blocks.push(make(content));
  }
}

const levelOf = (value: string | undefined): number | undefined => {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : undefined;
};

const ALIGNS = new Set(["left", "center", "right", "justify"]);
function alignOf(el: HElement, settings: Settings): Align | undefined {
  if (!settings.allowStyles) return undefined;
  const value = (parseStyle(el.attrs.style).get("text-align") ?? el.attrs.align ?? "").toLowerCase();
  return ALIGNS.has(value) && value !== "left" ? (value as Align) : undefined;
}

function styleMarks(el: HElement, ctx: Ctx, settings: Settings): Mark[] {
  const marks: Mark[] = [];
  const tag = el.tag;
  const mark = MARK_TAGS[tag];
  if (mark) marks.push({ type: mark });
  const style = parseStyle(el.attrs.style);
  const weight = style.get("font-weight");
  if (weight && (weight === "bold" || weight === "bolder" || Number(weight) >= 600)) marks.push({ type: "bold" });
  if (style.get("font-style")?.startsWith("italic")) marks.push({ type: "italic" });
  const decoration = `${style.get("text-decoration") ?? ""} ${style.get("text-decoration-line") ?? ""}`;
  if (/underline/.test(decoration) && tag !== "a" && !ctx.inLink) marks.push({ type: "underline" });
  if (/line-through/.test(decoration)) marks.push({ type: "strike" });
  const align = style.get("vertical-align");
  if (align === "super") marks.push({ type: "sup" });
  else if (align === "sub") marks.push({ type: "sub" });
  if (settings.allowStyles) {
    const color = tag === "font" ? el.attrs.color : style.get("color");
    if (color && COLOR.test(color.trim())) marks.push({ type: "color", value: color.trim().toLowerCase() });
    const background = style.get("background-color");
    if (background && COLOR.test(background.trim())) marks.push({ type: "background", value: background.trim().toLowerCase() });
  }
  return marks;
}

function convertNodes(nodes: readonly HNode[], sink: Sink, ctx: Ctx, settings: Settings): void {
  for (const node of nodes) {
    if (node.type === "text") {
      sink.text(node.text, ctx.marks, ctx.pre);
      continue;
    }
    convertElement(node, sink, ctx, settings);
  }
}

function withMarks(ctx: Ctx, marks: readonly Mark[], extra?: Partial<Ctx>): Ctx {
  if (marks.length === 0 && !extra) return ctx;
  const have = new Set(ctx.marks.map((m) => m.type));
  const added = marks.filter((m) => !have.has(m.type) || m.type === "link" || m.type === "color" || m.type === "background");
  return { ...ctx, ...extra, marks: [...ctx.marks.filter((m) => !added.some((a) => a.type === m.type && (a.type === "link" || a.type === "color" || a.type === "background"))), ...added] };
}

function convertElement(el: HElement, sink: Sink, ctx: Ctx, settings: Settings): void {
  const tag = el.tag;
  if (DROP.has(tag) || tag === "title") return;
  if (el.attrs.hidden !== undefined || /display\s*:\s*none/i.test(el.attrs.style ?? "")) return;

  switch (tag) {
    case "br":
      sink.push({ type: "br" });
      return;
    case "hr":
      sink.flush();
      sink.blocks.push({ type: "hr" });
      return;
    case "img": {
      const src = safeImageSrc(el.attrs.src, settings);
      if (!src) return;
      const size = (value: string | undefined): number | undefined => {
        const n = value === undefined ? NaN : Number.parseInt(value, 10);
        return Number.isFinite(n) && n > 0 && n < 100000 ? n : undefined;
      };
      const width = size(el.attrs.width);
      const height = size(el.attrs.height);
      sink.push({
        type: "image", src, ...(el.attrs.alt ? { alt: el.attrs.alt } : {}),
        ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}),
      });
      return;
    }
    case "p": {
      sink.flush();
      convertNodes(el.children, sink, ctx, settings);
      const align = alignOf(el, settings);
      sink.flush((content) => ({ type: "p", content, ...(align ? { align } : {}) }), true);
      return;
    }
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
      sink.flush();
      convertNodes(el.children, sink, ctx, settings);
      const level = Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      const align = alignOf(el, settings);
      sink.flush((content) => ({ type: "h", level, content, ...(align ? { align } : {}) }), true);
      return;
    }
    case "ul": case "ol":
      sink.flush();
      sink.blocks.push(convertList(el, ctx, settings));
      return;
    case "table":
      sink.flush();
      sink.blocks.push(convertTable(el, ctx, settings));
      return;
    case "blockquote": {
      sink.flush();
      const inner = new Sink(settings);
      convertNodes(el.children, inner, ctx, settings);
      inner.flush();
      const blocks = finishBlocks(inner.blocks);
      if (blocks.length > 0) sink.blocks.push({ type: "quote", blocks });
      return;
    }
    case "pre": {
      sink.flush();
      const inner = new Sink(settings);
      convertNodes(el.children, inner, { ...ctx, pre: true }, settings);
      let value = "";
      for (const item of inner.run) value += item.type === "text" ? item.text : item.type === "br" ? "\n" : "";
      value = value.replace(/^\n/, "");
      if (value.trim() !== "" || settings.keepEmpty) sink.blocks.push({ type: "pre", text: value });
      return;
    }
    case "a": {
      const href = safeUrl(el.attrs.href, settings.schemes);
      const marks = styleMarks(el, ctx, settings);
      if (href !== undefined) marks.push({ type: "link", href });
      // A link with no usable address is plain text, never an empty anchor.
      convertNodes(el.children, sink, withMarks(ctx, marks, { inLink: href !== undefined || ctx.inLink }), settings);
      return;
    }
  }

  if (CONTAINERS.has(tag)) {
    sink.flush();
    convertNodes(el.children, sink, withMarks(ctx, styleMarks(el, ctx, settings)), settings);
    sink.flush();
    return;
  }
  // Inline marks, spans, fonts, and unknown or custom elements, which are unwrapped.
  convertNodes(el.children, sink, withMarks(ctx, styleMarks(el, ctx, settings)), settings);
}

function listStyleOf(el: HElement): string | undefined {
  const fromStyle = parseStyle(el.attrs.style).get("list-style-type");
  const type = el.attrs.type;
  const mapped = type ? ({ a: "lower-alpha", A: "upper-alpha", i: "lower-roman", I: "upper-roman", "1": "decimal" } as Record<string, string>)[type] : undefined;
  const style = (fromStyle ?? mapped)?.toLowerCase();
  return style && /^[a-z-]+$/.test(style) && !/^(initial|inherit|unset|revert|none)$/.test(style) ? style : undefined;
}

function convertList(el: HElement, ctx: Ctx, settings: Settings): L {
  const list: L = { type: el.tag === "ol" ? "ol" : "ul", items: [] };
  const start = el.tag === "ol" && el.attrs.start !== undefined ? Number.parseInt(el.attrs.start, 10) : NaN;
  if (Number.isFinite(start) && start !== 1 && start >= 0 && start < 100000) list.start = start;
  let style = listStyleOf(el);
  for (const child of el.children) {
    if (child.type !== "el") continue;
    if (child.tag === "ul" || child.tag === "ol") {
      // A list placed directly inside a list belongs to the item before it.
      const nested = convertList(child, ctx, settings);
      const last = list.items[list.items.length - 1] ?? (list.items[list.items.push({ content: [], sublists: [] }) - 1] as Li);
      last.sublists.push(nested);
      continue;
    }
    if (child.tag !== "li") continue;
    style ??= listStyleOf(child);
    const inner = new Sink(settings);
    convertNodes(child.children, inner, ctx, settings);
    inner.flush();
    const item: Li = { content: [], sublists: [] };
    for (const block of inner.blocks) {
      if (block.type === "ul" || block.type === "ol") item.sublists.push(block as L);
      else if (block.type === "p" || block.type === "h") {
        if (item.content.length > 0) item.content.push({ type: "br" });
        item.content.push(...block.content);
      }
    }
    item.content = normalizeInline(item.content);
    const level = levelOf(child.attrs["data-aria-level"] ?? child.attrs["aria-level"]);
    if (level !== undefined) item.level = level;
    const listId = child.attrs["data-listid"];
    if (listId !== undefined) item.listId = listId;
    list.items.push(item);
  }
  if (style) list.style = style;
  return list;
}

function convertTable(el: HElement, ctx: Ctx, settings: Settings): Block {
  const rowEls: HElement[] = [];
  const collect = (nodes: readonly HNode[]): void => {
    for (const n of nodes) {
      if (n.type !== "el") continue;
      if (n.tag === "tr") rowEls.push(n);
      else if (n.tag === "thead" || n.tag === "tbody" || n.tag === "tfoot") collect(n.children);
    }
  };
  collect(el.children);
  const span = (value: string | undefined, max: number): number => {
    const n = value === undefined ? 1 : Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : 1;
  };
  const rows: TableCell[][] = [];
  for (const row of rowEls) {
    const cells: TableCell[] = [];
    for (const cell of row.children) {
      if (cell.type !== "el" || (cell.tag !== "td" && cell.tag !== "th")) continue;
      const inner = new Sink({ ...settings, keepEmpty: false });
      convertNodes(cell.children, inner, ctx, settings);
      inner.flush();
      let blocks = finishBlocks(inner.blocks);
      if (blocks.length === 0) blocks = [{ type: "p", content: [] }];
      cells.push({ header: cell.tag === "th", colspan: span(cell.attrs.colspan, 100), rowspan: span(cell.attrs.rowspan, 100), blocks });
    }
    if (cells.length > 0) rows.push(cells);
  }
  return { type: "table", rows: padRows(rows) };
}

/** Makes every row the same logical width, counting column spans and cells that rows above reach down into. */
function padRows(rows: TableCell[][]): TableCell[][] {
  const reach: number[] = [];
  const widths = rows.map((cells) => {
    let col = 0;
    let used = 0;
    for (const cell of cells) {
      while ((reach[col] ?? 0) > 0) { col++; used++; }
      for (let k = 0; k < cell.colspan; k++) reach[col + k] = cell.rowspan;
      col += cell.colspan;
      used += cell.colspan;
    }
    while ((reach[col] ?? 0) > 0) { col++; used++; }
    for (let k = 0; k < reach.length; k++) if ((reach[k] ?? 0) > 0) reach[k] = (reach[k] as number) - 1;
    return used;
  });
  const widest = Math.max(0, ...widths);
  return rows.map((cells, i) => {
    const missing = widest - (widths[i] as number);
    return missing > 0 ? [...cells, ...Array.from({ length: missing }, (): TableCell => ({ header: false, colspan: 1, rowspan: 1, blocks: [{ type: "p", content: [] }] }))] : cells;
  });
}

const DEFAULT_MARKER = (type: "ul" | "ol", depth: number): string => (type === "ol" ? "decimal" : (["disc", "circle", "square"] as const)[Math.min(depth, 2)] as string);

const isList = (block: Out): block is L => block.type === "ul" || block.type === "ol";
const hinted = (list: L): boolean => list.items.length > 0 && list.items.every((item) => item.level !== undefined);

/** Merges runs of neighbouring lists whose items carry level hints, nests them by level, and strips internal hints. */
function finishBlocks(blocks: readonly Out[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i] as Out;
    if (!isList(block)) {
      out.push(block);
      i++;
      continue;
    }
    let j = i;
    if (hinted(block)) {
      for (let next = blocks[j + 1]; next && isList(next) && hinted(next); next = blocks[j + 1]) j++;
      out.push(...nestByLevel(blocks.slice(i, j + 1) as L[]));
    } else {
      out.push(freezeList(block, 0));
    }
    i = j + 1;
  }
  return out;
}

function nestByLevel(lists: readonly L[]): List[] {
  const result: L[] = [];
  const stack: L[] = [];
  for (const list of lists) {
    for (const item of list.items) {
      const level = item.level as number;
      while (stack.length > level) stack.pop();
      // A deeper level than the current depth opens lists under the last item of the list above.
      while (stack.length < level) {
        const fresh: L = { type: list.type, items: [] };
        const parent = stack[stack.length - 1];
        if (parent) {
          const host = parent.items[parent.items.length - 1] ?? (parent.items[parent.items.push({ content: [], sublists: [] }) - 1] as Li);
          host.sublists.push(fresh);
        } else {
          result.push(fresh);
        }
        if (stack.length === level - 1) {
          if (list.start !== undefined && item === list.items[0]) fresh.start = list.start;
          if (list.style !== undefined) fresh.style = list.style;
        }
        stack.push(fresh);
      }
      const current = stack[stack.length - 1] as L;
      if (current.items.length === 0 && stack.length === 1 && list.start !== undefined && current.start === undefined) current.start = list.start;
      current.items.push({ content: item.content, sublists: item.sublists });
    }
  }
  return result.map((l) => freezeList(l, 0));
}

function freezeList(list: L, depth: number): List {
  const items: ListItem[] = list.items.map((item) => ({ content: item.content, sublists: item.sublists.map((sub) => freezeList(sub, depth + 1)) }));
  const style = list.style !== undefined && list.style !== DEFAULT_MARKER(list.type, depth) ? list.style : undefined;
  return { type: list.type, ...(list.start !== undefined ? { start: list.start } : {}), ...(style !== undefined ? { style } : {}), items };
}

/** Converts markup to blocks. Empty input gives no blocks. */
export function importBlocks(html: string, options: ImportOptions = {}): Block[] {
  const settings: Settings = {
    allowStyles: (options.styles ?? "allowlist") === "allowlist",
    schemes: new Set(options.linkSchemes ?? ["http", "https", "mailto", "tel"]),
    keepEmpty: options.keepEmptyBlocks ?? false,
    maxData: options.maxDataImageLength ?? 12_000_000,
  };
  const sink = new Sink(settings);
  convertNodes(parseHtml(html), sink, { marks: [], inLink: false, pre: false }, settings);
  sink.flush();
  return finishBlocks(sink.blocks);
}

export function importHtml(html: string, options: ImportOptions = {}): Doc {
  const blocks = importBlocks(html, { keepEmptyBlocks: true, ...options });
  return { blocks: blocks.length > 0 ? blocks : [{ type: "p", content: [] }] };
}

/** Plain text: a blank line starts a paragraph, a single line break stays a line break, spaces are kept. */
export function importText(value: string): Block[] {
  const normalized = decodeLineBreaks(value);
  if (normalized.trim() === "") return [];
  return normalized.split(/\n(?:[ \t]*\n)+/).filter((part) => part.trim() !== "").map((part): Paragraph => {
    const content: Inline[] = [];
    part.split("\n").forEach((line, i) => {
      if (i > 0) content.push({ type: "br" });
      if (line !== "") content.push({ type: "text", text: line, marks: [] });
    });
    return { type: "p", content };
  });
}

const decodeLineBreaks = (value: string): string => value.replace(/\r\n?|\u2028|\u2029/g, "\n").replace(/^\n+|\n+$/g, "");

export { decodeEntities };
