// Document model in, deterministic HTML out. Empty blocks are written without padding. Attribute
// order is fixed. Marks nest in a fixed order so the same document always serializes the same way.
import { escapeAttribute, escapeText } from "./html/entities.ts";
import { lineCss, SIDES } from "./cellborder.ts";
import { noteIds } from "./notes.ts";
import { DEFAULT_MARKER, type Block, type CellBorder, type Doc, type Inline, type List, type ListItem, type Mark, type Table, type TableCell } from "./model.ts";

const MARK_ORDER = ["link", "bold", "italic", "underline", "strike", "code", "sup", "sub", "color", "background"] as const;
const TAGS = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", sup: "sup", sub: "sub" } as const;

function openClose(mark: Mark): [string, string] {
  switch (mark.type) {
    case "link": return [`<a href="${escapeAttribute(mark.href)}"${mark.newTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>`, "</a>"];
    case "color": return [`<span style="color: ${escapeAttribute(mark.value)};">`, "</span>"];
    case "background": return [`<span style="background-color: ${escapeAttribute(mark.value)};">`, "</span>"];
    default: return [`<${TAGS[mark.type]}>`, `</${TAGS[mark.type]}>`];
  }
}

/** Spaces that HTML would collapse are written as non-breaking spaces so they survive a round trip. */
function encodeSpaces(value: string, atStart: boolean, atEnd: boolean): string {
  let out = value.replace(/ {2,}/g, (run) => " ".repeat(run.length - 1) + " ");
  if (atStart && out.startsWith(" ")) out = ` ${out.slice(1)}`;
  if (atEnd && out.endsWith(" ")) out = `${out.slice(0, -1)} `;
  return out;
}

/** The style that places an image: floated to a side, or on a line of its own in the middle. */
const IMAGE_ALIGN_STYLE: Record<string, string> = {
  left: "float: left; margin: 0 1em 0.5em 0;",
  right: "float: right; margin: 0 0 0.5em 1em;",
  center: "display: block; margin: 0 auto;",
};

/**
 * An image as HTML. `placed` is whether it sits among other things (so its position is written on it); a caption that has no figure to
 * go in, because text is beside the picture, is kept in a `data-caption` attribute so that it is not lost and comes back when read.
 */
function exportImage(node: Extract<Inline, { type: "image" }>, placed: boolean): string {
  return `<img src="${escapeAttribute(node.src)}"${node.alt !== undefined ? ` alt="${escapeAttribute(node.alt)}"` : ""}`
    + `${node.width !== undefined ? ` width="${node.width}"` : ""}${node.height !== undefined ? ` height="${node.height}"` : ""}`
    + `${placed && node.align ? ` style="${IMAGE_ALIGN_STYLE[node.align]}"` : ""}${placed && node.caption ? ` data-caption="${escapeAttribute(node.caption)}"` : ""}>`;
}

/** The ids of the references, in order, while a whole document is being written: they give each reference its number. */
let numbers: readonly string[] = [];

export function exportInline(content: readonly Inline[]): string {
  let out = "";
  content.forEach((node, i) => {
    if (node.type === "br") out += "<br>";
    else if (node.type === "note") out += `<sup data-note="${node.id}"><a href="#fn-${node.id}" id="fnref-${node.id}" role="doc-noteref">${numbers.indexOf(node.id) + 1 || ""}</a></sup>`;
    else if (node.type === "image") out += exportImage(node, true);
    else {
      const sorted = [...node.marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
      let body = escapeText(encodeSpaces(node.text, i === 0 || content[i - 1]?.type === "br", i === content.length - 1 || content[i + 1]?.type === "br"));
      for (let k = sorted.length - 1; k >= 0; k--) {
        const [open, close] = openClose(sorted[k] as Mark);
        body = open + body + close;
      }
      out += body;
    }
  });
  return out;
}

/** The style of a paragraph or heading: its alignment and how far it is indented (from the right for a right-to-left block). */
const blockStyle = (block: { readonly align?: string | undefined; readonly indent?: number | undefined; readonly dir?: string | undefined }): string => {
  const parts = [...(block.align ? [`text-align: ${block.align}`] : []), ...(block.indent ? [`margin-${block.dir === "rtl" ? "right" : "left"}: ${block.indent * 2}em`] : [])];
  return parts.length > 0 ? ` style="${parts.join("; ")};"` : "";
};
const dirAttr = (dir: string | undefined): string => (dir ? ` dir="${dir}"` : "");


function exportList(list: List, depth: number): string {
  const style = list.style !== undefined && list.style !== DEFAULT_MARKER(list.type, depth) ? ` style="list-style-type: ${list.style};"` : "";
  const start = list.type === "ol" && list.start !== undefined ? ` start="${list.start}"` : "";
  // An item with no text of its own that only holds a nested list shows no marker, and neither does a task: it has its checkbox instead.
  const items = list.items.map((item): string => {
    const noMarker = item.checked !== undefined || (item.content.length === 0 && (item.children[0]?.type === "ul" || item.children[0]?.type === "ol"));
    const box = item.checked === undefined ? "" : `<input type="checkbox" disabled${item.checked ? " checked" : ""}> `;
    // An item with paragraph breaks in it is written as paragraphs; the task's checkbox goes in the first.
    const paragraphs: Inline[][] = [[]];
    for (const node of item.content) {
      if (node.type === "br" && node.paragraph) paragraphs.push([]);
      else (paragraphs[paragraphs.length - 1] as Inline[]).push(node);
    }
    const text = paragraphs.length === 1 ? exportInline(item.content) : paragraphs.map((part, i) => `<p>${i === 0 ? box : ""}${exportInline(part)}</p>`).join("");
    const inner = `${paragraphs.length === 1 ? box : ""}${text}${item.children.map((child) => (child.type === "ul" || child.type === "ol" ? exportList(child, depth + 1) : exportBlock(child))).join("")}`;
    return list.notes ? inner : `<li${noMarker ? ' style="list-style-type: none;"' : ""}>${inner}</li>`;
  });
  // A note is an item with an address and a link back to its reference.
  if (list.notes) return `<section class="footnotes" role="doc-endnotes"><ol>${list.items.map((item, i) => `<li id="fn-${item.id}" data-note="${item.id}">${items[i]} <a href="#fnref-${item.id}" role="doc-backlink">\u21A9\uFE0E</a></li>`).join("")}</ol></section>`;
  return `<${list.type}${start}${style}>${items.join("")}</${list.type}>`;
}

/** The style of a cell: the color behind it and the lines round it. */
function cellStyle(cell: TableCell): string {
  const parts: string[] = [];
  if (cell.background) parts.push(`background-color: ${cell.background}`);
  if (cell.border !== undefined && !cell.borders) parts.push(`border: ${lineCss(cell.border)}`);
  else if (cell.borders) for (const side of SIDES) if (cell.borders[side] !== undefined) parts.push(`border-${side}: ${lineCss(cell.borders[side] as CellBorder | null)}`);
  return parts.length > 0 ? ` style="${escapeAttribute(parts.join("; "))};"` : "";
}

function exportCell(cell: TableCell, scope: "col" | "row" | undefined): string {
  const tag = cell.header ? "th" : "td";
  const attrs = `${cell.header && scope ? ` scope="${scope}"` : ""}${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ""}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ""}${cellStyle(cell)}`;
  const only = cell.blocks.length === 1 ? cell.blocks[0] : undefined;
  const body = only?.type === "p" && !only.align && !only.dir && !only.indent ? exportInline(only.content) : cell.blocks.map(exportBlock).join("");
  return `<${tag}${attrs}>${body}</${tag}>`;
}

function exportTable(table: Table): string {
  const rows = table.rows.map((row, r) => {
    const height = table.heights?.[r];
    return `<tr${height ? ` style="height: ${height}"` : ""}>${row.map((cell, c) => exportCell(cell, r === 0 ? "col" : c === 0 ? "row" : undefined)).join("")}</tr>`;
  });
  const cols = table.widths ? `<colgroup>${table.widths.map((w) => (w ? `<col style="width: ${w}">` : "<col>")).join("")}</colgroup>` : "";
  return `<table>${cols}<tbody>${rows.join("")}</tbody></table>`;
}

export function exportBlock(block: Block): string {
  switch (block.type) {
    case "p": {
      // An image alone in its paragraph with a caption is a figure; its alignment is the paragraph's.
      const only = block.content.length === 1 ? block.content[0] : undefined;
      if (only?.type === "image" && only.caption) return `<figure${dirAttr(block.dir)}${blockStyle(block)}>${exportImage(only, false)}<figcaption>${escapeText(only.caption)}</figcaption></figure>`;
      return `<p${dirAttr(block.dir)}${blockStyle(block)}>${exportInline(block.content)}</p>`;
    }
    case "h": return `<h${block.level}${dirAttr(block.dir)}${blockStyle(block)}>${exportInline(block.content)}</h${block.level}>`;
    case "ul": case "ol": return exportList(block, 0);
    case "dl": return `<dl>${block.entries.map((entry) => { const tag = entry.kind === "term" ? "dt" : "dd"; return `<${tag}>${exportInline(entry.content)}</${tag}>`; }).join("")}</dl>`;
    case "table": return exportTable(block);
    case "quote": return `<blockquote>${block.blocks.map(exportBlock).join("")}</blockquote>`;
    case "pre": return `<pre>${escapeText(block.text)}</pre>`;
    case "hr": return "<hr>";
  }
}

export function exportHtml(doc: Doc, separator = ""): string {
  const outer = numbers;
  numbers = noteIds(doc);
  try { return doc.blocks.map(exportBlock).join(separator); } finally { numbers = outer; }
}
