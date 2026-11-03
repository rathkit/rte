// Document model to Markdown text, the same document always giving the same text. What Markdown cannot say is dropped, never
// written as inline HTML (the reader here treats HTML as text, so it would not come back). The list of what is dropped is in docs/MARKDOWN.md.
import type { Align, Block, Doc, Inline, ItemChild, List, Mark, Table, TableCell } from "../model.ts";

type Span = "bold" | "italic" | "strike" | "link" | "underline" | "sup" | "sub";
interface Segment { readonly text: string; readonly spans: readonly Mark[]; readonly code: boolean; readonly image?: Extract<Inline, { type: "image" }>; readonly br?: boolean }

const SPAN_ORDER: readonly Span[] = ["link", "bold", "italic", "strike"];
const HTML_SPAN_ORDER: readonly Span[] = ["link", "bold", "italic", "underline", "strike", "sup", "sub"];
const SPAN_MARK: Record<Exclude<Span, "link">, [string, string]> = {
  bold: ["**", "**"], italic: ["*", "*"], strike: ["~~", "~~"], underline: ["<u>", "</u>"], sup: ["<sup>", "</sup>"], sub: ["<sub>", "</sub>"],
};

/** Whether the document being written may use the few inline tags the reader understands (set by `exportMarkdown`, which is synchronous). */
let inlineHtml = false;

const spanMarks = (marks: readonly Mark[]): Mark[] =>
  (inlineHtml ? HTML_SPAN_ORDER : SPAN_ORDER).flatMap((type) => marks.filter((m) => m.type === type));
const sameSpan = (a: Mark, b: Mark): boolean => a.type === b.type && (a.type !== "link" || (b.type === "link" && a.href === b.href));
const hasSpan = (list: readonly Mark[], m: Mark): boolean => list.some((x) => sameSpan(x, m));

/** A web address in a link or image: wrapped in angle brackets when it holds spaces or parentheses. */
function destination(href: string): string {
  // eslint-disable-next-line no-control-regex
  if (/[\s()<>\x00-\x1f]/.test(href)) return `<${href.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/[\x00-\x1f]/g, (c) => encodeURIComponent(c)).replace(/\n/g, "%0A")}>`;
  return href.replace(/\\/g, "\\\\");
}

/** Escapes what would otherwise be read as formatting inside a line of text. */
function escapeText(text: string, inLink: boolean, table: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === "\\" || c === "`" || c === "*" || c === "[" || c === "]" || c === "<" || c === "~") out += `\\${c}`;
    else if (c === "|" && table) out += "\\|";
    else if (c === "_") {
      const intraword = /[\p{L}\p{N}]/u.test(text[i - 1] ?? "") && /[\p{L}\p{N}]/u.test(text[i + 1] ?? "");
      out += intraword ? c : "\\_";
    } else if (c === "&" && /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.test(text.slice(i, i + 40))) out += "\\&";
    else out += c;
  }
  // A web address written as plain text must not turn into a link when read back.
  if (!inLink) out = out.replace(/\b(https?):\/\//gi, "$1\\://").replace(/\bwww\./gi, "www\\.");
  return out;
}

function codeSpan(text: string): string {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(longest === 0 ? 1 : longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "");
  return pad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** Inline content as Markdown on one logical line; a line break is a backslash and a newline, or a space when `flat`. */
function inline(content: readonly Inline[], flat: boolean, table: boolean): string {
  // Cut runs so that spaces at the edges of formatted text sit outside it ("**a **" does not close).
  const segments: Segment[] = [];
  const runs = content.map((node) => (node.type === "text" ? { node, spans: spanMarks(node.marks), code: node.marks.some((m) => m.type === "code") } : { node, spans: [] as Mark[], code: false }));
  runs.forEach((run, r) => {
    const node = run.node;
    if (node.type === "br") { segments.push({ text: "", spans: [], code: false, br: true }); return; }
    if (node.type === "image") { segments.push({ text: "", spans: [], code: false, image: node }); return; }
    const text = node.text;
    if (run.code) { segments.push({ text, spans: run.spans, code: true }); return; }
    const lead = /^\s*/.exec(text)?.[0] ?? "";
    const trail = lead.length === text.length ? "" : /\s*$/.exec(text)?.[0] ?? "";
    const core = text.slice(lead.length, text.length - trail.length);
    const prev = runs[r - 1];
    const next = runs[r + 1];
    const shared = (other: typeof prev): Mark[] => (other && other.node.type === "text" ? run.spans.filter((m) => hasSpan(other.spans, m)) : []);
    if (lead) segments.push({ text: lead, spans: shared(prev), code: false });
    if (core) segments.push({ text: core, spans: run.spans, code: false });
    if (trail) segments.push({ text: trail, spans: shared(next), code: false });
  });

  let out = "";
  let active: Mark[] = [];
  const open = (m: Mark): void => { out += m.type === "link" ? "[" : SPAN_MARK[m.type as Exclude<Span, "link">][0]; };
  const close = (m: Mark): void => { out += m.type === "link" ? `](${destination(m.href)})` : SPAN_MARK[m.type as Exclude<Span, "link">][1]; };
  const move = (target: readonly Mark[]): void => {
    let keep = 0;
    while (keep < active.length && keep < target.length && sameSpan(active[keep] as Mark, target[keep] as Mark)) keep++;
    // Close from the top down to the first mark that is no longer wanted, then open what the new text needs.
    for (let k = active.length - 1; k >= keep; k--) close(active[k] as Mark);
    for (let k = keep; k < target.length; k++) open(target[k] as Mark);
    active = [...target];
  };
  for (const seg of segments) {
    if (seg.br) {
      move([]);
      out += flat ? (inlineHtml ? "<br>" : " ") : "\\\n";
      continue;
    }
    if (seg.image) {
      move(seg.spans);
      out += `![${escapeText(seg.image.alt ?? "", true, table)}](${destination(seg.image.src)})`;
      continue;
    }
    move(seg.spans);
    out += seg.code ? codeSpan(seg.text) : escapeText(seg.text, active.some((m) => m.type === "link"), table);
  }
  move([]);
  return out;
}

/** Stops the first thing on each line of a paragraph from being read as a block marker. */
function guardLines(text: string): string {
  return text.split("\n").map((line) => {
    if (/^\s{4}/.test(line)) return line;
    const numbered = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(line);
    if (numbered) return `${numbered[1]}\\${line.slice((numbered[1] as string).length)}`;
    if (/^(#{1,6}([ \t]|$)|>|[-+]([ \t]|$)|[-=]+[ \t]*$|~~~|---|___)/.test(line)) return `\\${line}`;
    return line;
  }).join("\n");
}

function alignOf(cell: TableCell | undefined): Align | undefined {
  const b = cell?.blocks[0];
  return b?.type === "p" ? b.align : undefined;
}

function cellText(cell: TableCell): string {
  const parts: string[] = [];
  const walk = (blocks: readonly Block[]): void => {
    for (const b of blocks) {
      if (b.type === "p" || b.type === "h") parts.push(inline(b.content, true, true));
      else if (b.type === "pre") parts.push(codeSpan(b.text.replace(/\n/g, " ")));
      else if (b.type === "quote") walk(b.blocks);
      else if (b.type === "ul" || b.type === "ol") for (const item of b.items) parts.push(inline(item.content, true, true));
    }
  };
  walk(cell.blocks);
  return parts.filter((p) => p !== "").join(" ");
}

function table(t: Table): string {
  // Lay the grid out: a cell that spans leaves empty cells behind it, since Markdown tables cannot span.
  const grid: (TableCell | null)[][] = [];
  t.rows.forEach((row, r) => {
    const line = (grid[r] ??= []);
    let c = 0;
    for (const cell of row) {
      while (line[c] !== undefined) c++;
      for (let dr = 0; dr < Math.max(1, cell.rowspan); dr++) {
        const target = (grid[r + dr] ??= []);
        for (let dc = 0; dc < Math.max(1, cell.colspan); dc++) target[c + dc] = dr === 0 && dc === 0 ? cell : null;
      }
      c += Math.max(1, cell.colspan);
    }
  });
  const width = Math.max(1, ...grid.map((row) => row.length));
  const line = (row: (TableCell | null | undefined)[]): string => `| ${Array.from({ length: width }, (_, c) => { const cell = row[c]; return cell ? cellText(cell) : ""; }).join(" | ")} |`;
  const head = grid[0] ?? [];
  const delimiter = Array.from({ length: width }, (_, c) => {
    const a = alignOf(head[c] ?? undefined) ?? alignOf(grid.find((row) => row[c])?.[c] ?? undefined);
    return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";
  });
  return [line(head), `| ${delimiter.join(" | ")} |`, ...grid.slice(1).map(line)].join("\n");
}

const indentLines = (text: string, by: string, first: string): string =>
  text.split("\n").map((l, i) => (i === 0 ? first + l : l === "" ? "" : by + l)).join("\n");

function list(l: List, flip: boolean): string {
  const start = l.type === "ol" ? Math.max(0, Math.min(l.start ?? 1, 999_999_999 - l.items.length)) : 0;
  return l.items.map((item, i) => {
    const mark = l.type === "ul" ? (flip ? "*" : "-") : `${start + i}${flip ? ")" : "."}`;
    const task = item.checked === undefined ? "" : item.checked ? "[x] " : "[ ] ";
    const paragraphs = inlineSplit(item.content).map((p) => guardLines(p));
    const body = [`${task}${paragraphs[0] ?? ""}`, ...paragraphs.slice(1)].join("\n\n");
    // What follows the text, in order. A nested list sits right under the text; other blocks are set off by a blank line.
    // Lists side by side at one level would read back as one list, so they alternate their marker.
    let text = body;
    let before: ItemChild | undefined;
    let beforeFlip = false;
    for (const child of item.children) {
      const isList = child.type === "ul" || child.type === "ol";
      const flipNext: boolean = isList && before !== undefined && before.type === child.type ? !beforeFlip : false;
      const rendered = child.type === "ul" || child.type === "ol" ? list(child, flipNext) : render(child, false);
      const gap = isList && (before === undefined || before.type === "ul" || before.type === "ol") ? "\n" : "\n\n";
      text = text === "" && before === undefined ? rendered : `${text}${gap}${rendered}`;
      before = child;
      beforeFlip = flipNext;
    }
    return indentLines(text, " ".repeat(mark.length + 1), `${mark} `).replace(/^(\S+) (\n|$)/, "$1$2");
  }).join("\n");
}

/** An item's content cut at its paragraph breaks. */
function inlineSplit(content: readonly Inline[]): string[] {
  const parts: Inline[][] = [[]];
  for (const node of content) {
    if (node.type === "br" && node.paragraph) parts.push([]); else (parts[parts.length - 1] as Inline[]).push(node);
  }
  return parts.map((p) => inline(p, false, false));
}

function blocks(list_: readonly Block[]): string {
  const out: string[] = [];
  let previous: Block | undefined;
  let flip = false;
  for (const block of list_) {
    flip = previous && (previous.type === "ul" || previous.type === "ol") && previous.type === block.type ? !flip : false;
    const text = render(block, flip);
    if (text !== "") out.push(text);
    previous = block;
  }
  return out.join("\n\n");
}

function render(block: Block, flip: boolean): string {
  switch (block.type) {
    case "p": return guardLines(inline(block.content, false, false));
    case "h": return `${"#".repeat(block.level)} ${inline(block.content, true, false)}`.trimEnd();
    case "ul": case "ol": return list(block, flip);
    case "dl": return block.entries.map((e) => guardLines(inline(e.content, false, false))).filter((t) => t !== "").join("\n\n");
    case "table": return table(block);
    case "quote": return blocks(block.blocks).split("\n").map((l) => (l === "" ? ">" : `> ${l}`)).join("\n") || ">";
    case "pre": {
      let longest = 0;
      for (const run of block.text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
      const fence = "`".repeat(Math.max(3, longest + 1));
      return block.text === "" ? `${fence}\n${fence}` : `${fence}\n${block.text}\n${fence}`;
    }
    case "hr": return "---";
  }
}

/** The document as Markdown (CommonMark with the GitHub table, task item and strikethrough additions). */
export function exportMarkdown(doc: Doc, options: MarkdownExportOptions = {}): string {
  inlineHtml = options.inlineHtml === true;
  try {
    return blocks(doc.blocks);
  } finally {
    inlineHtml = false;
  }
}

export interface MarkdownExportOptions {
  /**
   * Write underline, superscript and subscript as `<u>`, `<sup>` and `<sub>`, and a line break in a table cell or heading as `<br>`. The
   * reader here understands those tags, so they come back; other Markdown readers show them as HTML. Default false: those details are dropped.
   */
  readonly inlineHtml?: boolean;
}
