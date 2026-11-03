// Markdown text to document blocks: the CommonMark core plus the GitHub additions people actually write (tables, task
// items, strikethrough, bare web addresses). Written from the two public specifications, for untrusted input.
//
// What the document model cannot hold, and what is done about it (also in docs/MARKDOWN.md):
//  - A list item holds inline content and sublists only. A second paragraph of an item becomes a paragraph break inside it;
//    code, a quote or a heading inside an item is flattened to text in the item.
//  - A table cell holds blocks, so a column's alignment is set on the paragraph in each cell.
//  - Raw HTML, link reference definitions, footnotes and setext-style hard wrapping rules beyond the above are not interpreted; they stay text.
import type { Align, Block, Inline, List, ListItem, TableCell } from "../model.ts";
import { parseInline, type MarkdownOptions } from "./inline.ts";

const MAX_DEPTH = 24;

const leading = (line: string): number => {
  let n = 0;
  while (n < line.length && line.charCodeAt(n) === 32) n++;
  return n;
};
const isBlank = (line: string): boolean => line.trim() === "";

/** Tabs at the start of a line count as spaces up to the next multiple of four. */
function expandTabs(line: string): string {
  if (!line.includes("\t")) return line;
  let col = 0, i = 0, out = "";
  for (; i < line.length; i++) {
    const c = line[i] as string;
    if (c === " ") { out += c; col++; } else if (c === "\t") { const n = 4 - (col % 4); out += " ".repeat(n); col += n; } else break;
  }
  return out + line.slice(i);
}

function isFence(line: string): { ch: string; len: number; indent: number; info: string } | undefined {
  const indent = leading(line);
  if (indent > 3) return undefined;
  const ch = line[indent];
  if (ch !== "`" && ch !== "~") return undefined;
  let len = 0;
  while (line[indent + len] === ch) len++;
  if (len < 3) return undefined;
  const info = line.slice(indent + len);
  if (ch === "`" && info.includes("`")) return undefined;
  return { ch, len, indent, info: info.trim() };
}

function isRule(line: string): boolean {
  const indent = leading(line);
  if (indent > 3) return false;
  const ch = line[indent];
  if (ch !== "*" && ch !== "-" && ch !== "_") return false;
  let count = 0;
  for (let i = indent; i < line.length; i++) {
    const c = line[i];
    if (c === ch) count++;
    else if (c !== " " && c !== "\t") return false;
  }
  return count >= 3;
}

function atx(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string } | undefined {
  const indent = leading(line);
  if (indent > 3) return undefined;
  let level = 0;
  while (line[indent + level] === "#") level++;
  if (level < 1 || level > 6) return undefined;
  const rest = line.slice(indent + level);
  if (rest !== "" && rest[0] !== " " && rest[0] !== "\t") return undefined;
  let text = rest.trim();
  // A closing run of # is decoration when a space comes before it (or it is the whole text).
  let end = text.length;
  while (end > 0 && text[end - 1] === "#") end--;
  if (end < text.length && (end === 0 || text[end - 1] === " " || text[end - 1] === "\t")) text = text.slice(0, end).trimEnd();
  return { level: level as 1 | 2 | 3 | 4 | 5 | 6, text };
}

interface Marker { type: "ul" | "ol"; char: string; number: number; indent: number; width: number; contentIndent: number; empty: boolean }

function marker(line: string): Marker | undefined {
  const indent = leading(line);
  if (indent > 3) return undefined;
  let p = indent;
  let type: "ul" | "ol";
  let char: string;
  let number = 0;
  const c = line[p];
  if (c === "-" || c === "+" || c === "*") { type = "ul"; char = c; p++; }
  else {
    let d = 0;
    while (p < line.length && line.charCodeAt(p) >= 48 && line.charCodeAt(p) <= 57 && d < 10) { number = number * 10 + (line.charCodeAt(p) - 48); p++; d++; }
    if (d === 0 || d > 9) return undefined;
    const delim = line[p];
    if (delim !== "." && delim !== ")") return undefined;
    type = "ol"; char = delim; p++;
  }
  const width = p - indent;
  const after = line[p];
  if (after !== undefined && after !== " " && after !== "\t") return undefined;
  const rest = line.slice(p);
  const empty = rest.trim() === "";
  const spaces = leading(rest);
  // Five or more spaces after the marker means the item starts with an indented code block: the content begins one space in.
  const gap = empty || spaces > 4 ? 1 : spaces;
  return { type, char, number, indent, width, contentIndent: indent + width + gap, empty };
}

/** True when a line starts something that ends a paragraph. */
function interrupts(line: string, next: string | undefined): boolean {
  if (atx(line) || isFence(line) || isRule(line)) return true;
  if (leading(line) <= 3 && line.trimStart().startsWith(">")) return true;
  const m = marker(line);
  if (m && !m.empty && (m.type === "ul" || m.number === 1)) return true;
  return next !== undefined && tableAt(line, next) !== undefined;
}

function setextLevel(line: string): 1 | 2 | undefined {
  const indent = leading(line);
  if (indent > 3) return undefined;
  const ch = line[indent];
  if (ch !== "=" && ch !== "-") return undefined;
  let i = indent;
  while (line[i] === ch) i++;
  if (line.slice(i).trim() !== "") return undefined;
  return ch === "=" ? 1 : 2;
}

/** Splits a table row into cells at pipes that are not escaped. */
function cellsOf(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === "\\" && text[i + 1] === "|") { cell += "\\|"; i++; } else if (c === "|") { cells.push(cell.trim()); cell = ""; } else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

function alignOf(cell: string): Align | undefined | null {
  const t = cell.trim();
  if (t.length === 0) return null;
  const left = t.startsWith(":"), right = t.endsWith(":");
  const dashes = t.slice(left ? 1 : 0, right ? -1 : undefined);
  if (dashes === "" || /[^-]/.test(dashes)) return null;
  return left && right ? "center" : right ? "right" : left ? "left" : undefined;
}

/** A table starts at a header line followed by a delimiter row with the same number of cells. */
function tableAt(header: string, delimiter: string): { head: string[]; aligns: (Align | undefined)[] } | undefined {
  if (!header.includes("|") || !delimiter.includes("-")) return undefined;
  const head = cellsOf(header);
  const marks = cellsOf(delimiter);
  if (head.length !== marks.length || head.length < 1) return undefined;
  const aligns: (Align | undefined)[] = [];
  for (const m of marks) {
    const a = alignOf(m);
    if (a === null) return undefined;
    aligns.push(a);
  }
  if (head.length === 1 && !header.trim().startsWith("|") && !header.trim().endsWith("|")) return undefined;
  return { head, aligns };
}

function paragraph(text: string, options: MarkdownOptions, align?: Align): Block | undefined {
  const content = parseInline(text.trim(), options);
  if (content.length === 0) return undefined;
  return { type: "p", content, ...(align ? { align } : {}) };
}

/** Text of blocks, flattened into inline content: for what a list item cannot hold. */
function flatten(blocks: readonly Block[]): Inline[] {
  const out: Inline[] = [];
  const add = (inline: readonly Inline[]): void => {
    if (inline.length === 0) return;
    if (out.length > 0) out.push({ type: "br", paragraph: true });
    out.push(...inline);
  };
  for (const b of blocks) {
    switch (b.type) {
      case "p": case "h": add(b.content); break;
      case "pre": add(b.text.split("\n").flatMap((line, i): Inline[] => [...(i > 0 ? [{ type: "br" } as Inline] : []), ...(line === "" ? [] : [{ type: "text", text: line, marks: [{ type: "code" }] } as Inline])])); break;
      case "quote": add(flatten(b.blocks)); break;
      case "ul": case "ol": for (const item of b.items) add(item.content); break;
      default: break;
    }
  }
  return out;
}

function listItem(lines: string[], depth: number, options: MarkdownOptions): ListItem {
  let checked: boolean | undefined;
  const first = lines[0] ?? "";
  const task = /^\[([ xX])\](?:[ \t]|$)/.exec(first);
  if (task) {
    checked = task[1] !== " ";
    lines = [first.slice(task[0].length), ...lines.slice(1)];
  }
  const blocks = parseBlocks(lines, depth + 1, options);
  let content: Inline[] = [];
  const sublists: List[] = [];
  const rest: Block[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "p" && i === 0) content = [...b.content];
    else if (b.type === "ul" || b.type === "ol") sublists.push(b);
    else rest.push(b);
  });
  const more = flatten(rest);
  if (more.length > 0) content = content.length > 0 ? [...content, { type: "br", paragraph: true }, ...more] : more;
  return { content, sublists, ...(checked !== undefined ? { checked } : {}) };
}

function parseList(lines: string[], start: number, depth: number, options: MarkdownOptions): { list: List; next: number } {
  const first = marker(lines[start] as string) as Marker;
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = marker(lines[i] as string);
    if (!m || m.type !== first.type || m.char !== first.char) break;
    if (isRule(lines[i] as string)) break;
    const body: string[] = [(lines[i] as string).slice(m.contentIndent < (lines[i] as string).length ? m.contentIndent : (lines[i] as string).length)];
    if (m.empty) body[0] = "";
    i++;
    let blanks = 0;
    while (i < lines.length) {
      const line = lines[i] as string;
      if (isBlank(line)) { blanks++; i++; continue; }
      const ind = leading(line);
      if (ind >= m.contentIndent) {
        for (let b = 0; b < blanks; b++) body.push("");
        blanks = 0;
        body.push(line.slice(m.contentIndent));
        i++;
        continue;
      }
      // A line that is less indented: the next item, a lazy continuation of the item's paragraph, or the end of the list.
      if (blanks === 0 && !marker(line) && !interrupts(line, lines[i + 1]) && !isBlank(body[body.length - 1] ?? "") && !isFence(body[body.length - 1] ?? "")) {
        body.push(line.trimStart());
        i++;
        continue;
      }
      break;
    }
    items.push(listItem(body, depth, options));
    // Blank lines before something that is not the next item end the list.
    const nextMarker = i < lines.length ? marker(lines[i] as string) : undefined;
    if (!nextMarker || nextMarker.type !== first.type || nextMarker.char !== first.char) break;
  }
  const list: List = { type: first.type, items, ...(first.type === "ol" && first.number !== 1 ? { start: first.number } : {}) };
  return { list, next: i };
}

function parseBlocks(lines: readonly string[], depth: number, options: MarkdownOptions): Block[] {
  const out: Block[] = [];
  if (depth >= MAX_DEPTH) {
    const p = paragraph(lines.join("\n"), options);
    return p ? [p] : [];
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (isBlank(line)) { i++; continue; }

    const fence = isFence(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] as string;
        const close = isFence(l);
        if (close && close.ch === fence.ch && close.len >= fence.len && close.info === "") { i++; break; }
        body.push(l.slice(Math.min(leading(l), fence.indent)));
        i++;
      }
      out.push({ type: "pre", text: body.join("\n") });
      continue;
    }

    const heading = atx(line);
    if (heading) {
      const content = parseInline(heading.text, options);
      out.push({ type: "h", level: heading.level, content });
      i++;
      continue;
    }
    if (isRule(line)) { out.push({ type: "hr" }); i++; continue; }

    if (leading(line) <= 3 && line.trimStart().startsWith(">")) {
      const inner: string[] = [];
      while (i < lines.length) {
        const l = lines[i] as string;
        if (leading(l) <= 3 && l.trimStart().startsWith(">")) {
          const t = l.trimStart().slice(1);
          inner.push(t.startsWith(" ") ? t.slice(1) : t);
          i++;
        } else if (!isBlank(l) && inner.length > 0 && !isBlank(inner[inner.length - 1] as string) && !interrupts(l, lines[i + 1]) && !marker(l) && !isFence(inner[inner.length - 1] as string)) {
          inner.push(l.trimStart());
          i++;
        } else break;
      }
      out.push({ type: "quote", blocks: parseBlocks(inner, depth + 1, options) });
      continue;
    }

    const m = marker(line);
    if (m) {
      const { list, next } = parseList(lines as string[], i, depth, options);
      out.push(list);
      i = next;
      continue;
    }

    const table = i + 1 < lines.length ? tableAt(line, lines[i + 1] as string) : undefined;
    if (table) {
      const cell = (text: string, header: boolean, col: number): TableCell => {
        const p = paragraph(text, options, table.aligns[col]);
        return { header, colspan: 1, rowspan: 1, blocks: p ? [p] : [{ type: "p", content: [] }] };
      };
      const rows: TableCell[][] = [table.head.map((t, c) => cell(t, true, c))];
      i += 2;
      while (i < lines.length && !isBlank(lines[i] as string) && !interrupts(lines[i] as string, undefined)) {
        const cells = cellsOf(lines[i] as string);
        rows.push(table.head.map((_, c) => cell(cells[c] ?? "", false, c)));
        i++;
      }
      out.push({ type: "table", rows });
      continue;
    }

    if (leading(line) >= 4) {
      const body: string[] = [];
      while (i < lines.length && (isBlank(lines[i] as string) || leading(lines[i] as string) >= 4)) { body.push((lines[i] as string).slice(Math.min(4, leading(lines[i] as string)))); i++; }
      while (body.length > 0 && isBlank(body[body.length - 1] as string)) body.pop();
      out.push({ type: "pre", text: body.join("\n") });
      continue;
    }

    // A paragraph, or a setext heading when an underline follows its lines.
    const text: string[] = [line];
    i++;
    let level: 1 | 2 | undefined;
    while (i < lines.length) {
      const l = lines[i] as string;
      level = setextLevel(l);
      if (level) { i++; break; }
      if (isBlank(l) || interrupts(l, lines[i + 1])) break;
      text.push(l);
      i++;
    }
    if (level) {
      out.push({ type: "h", level, content: parseInline(text.map((t) => t.trim()).join("\n"), options) });
    } else {
      const p = paragraph(text.map((t) => t.trimStart()).join("\n"), options);
      if (p) out.push(p);
    }
  }
  return out;
}

/** Reads Markdown into blocks ready to insert. Never throws; anything it does not understand stays text. */
export function parseMarkdown(source: string, options: MarkdownOptions = {}): Block[] {
  const text = source.replace(/\r\n?|\u2028|\u2029/g, "\n").replace(/\0/g, "�");
  return parseBlocks(text.split("\n").map(expandTabs), 0, options);
}
