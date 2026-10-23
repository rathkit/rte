// Document model in, deterministic HTML out. Empty blocks are written without padding. Attribute
// order is fixed. Marks nest in a fixed order so the same document always serializes the same way.
import { escapeAttribute, escapeText } from "./html/entities.ts";
import type { Block, Doc, Inline, List, Mark, Table, TableCell } from "./model.ts";

const MARK_ORDER = ["link", "bold", "italic", "underline", "strike", "code", "sup", "sub", "color", "background"] as const;
const TAGS = { bold: "strong", italic: "em", underline: "u", strike: "s", code: "code", sup: "sup", sub: "sub" } as const;

function openClose(mark: Mark): [string, string] {
  switch (mark.type) {
    case "link": return [`<a href="${escapeAttribute(mark.href)}">`, "</a>"];
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

export function exportInline(content: readonly Inline[]): string {
  let out = "";
  content.forEach((node, i) => {
    if (node.type === "br") out += "<br>";
    else if (node.type === "image") {
      out += `<img src="${escapeAttribute(node.src)}"${node.alt !== undefined ? ` alt="${escapeAttribute(node.alt)}"` : ""}`
        + `${node.width !== undefined ? ` width="${node.width}"` : ""}${node.height !== undefined ? ` height="${node.height}"` : ""}>`;
    } else {
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

const DEFAULT_MARKER = (type: "ul" | "ol", depth: number): string => (type === "ol" ? "decimal" : (["disc", "circle", "square"] as const)[Math.min(depth, 2)] as string);

function exportList(list: List, depth: number): string {
  const style = list.style !== undefined && list.style !== DEFAULT_MARKER(list.type, depth) ? ` style="list-style-type: ${list.style};"` : "";
  const start = list.type === "ol" && list.start !== undefined ? ` start="${list.start}"` : "";
  // An item with no text of its own that only holds a nested list shows no marker.
  const items = list.items.map((item) => `<li${item.content.length === 0 && item.sublists.length > 0 ? ' style="list-style-type: none;"' : ""}>${exportInline(item.content)}${item.sublists.map((sub) => exportList(sub, depth + 1)).join("")}</li>`).join("");
  return `<${list.type}${start}${style}>${items}</${list.type}>`;
}

function exportCell(cell: TableCell, scope: "col" | "row" | undefined): string {
  const tag = cell.header ? "th" : "td";
  const attrs = `${cell.header && scope ? ` scope="${scope}"` : ""}${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ""}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ""}`;
  const only = cell.blocks.length === 1 ? cell.blocks[0] : undefined;
  const body = only?.type === "p" && !only.align && !only.dir && !only.indent ? exportInline(only.content) : cell.blocks.map(exportBlock).join("");
  return `<${tag}${attrs}>${body}</${tag}>`;
}

function exportTable(table: Table): string {
  const rows = table.rows.map((row, r) => `<tr>${row.map((cell, c) => exportCell(cell, r === 0 ? "col" : c === 0 ? "row" : undefined)).join("")}</tr>`);
  const cols = table.widths ? `<colgroup>${table.widths.map((w) => (w ? `<col style="width: ${w}">` : "<col>")).join("")}</colgroup>` : "";
  return `<table>${cols}<tbody>${rows.join("")}</tbody></table>`;
}

export function exportBlock(block: Block): string {
  switch (block.type) {
    case "p": return `<p${dirAttr(block.dir)}${blockStyle(block)}>${exportInline(block.content)}</p>`;
    case "h": return `<h${block.level}${dirAttr(block.dir)}${blockStyle(block)}>${exportInline(block.content)}</h${block.level}>`;
    case "ul": case "ol": return exportList(block, 0);
    case "dl": return `<dl>${block.entries.map((entry) => { const tag = entry.kind === "term" ? "dt" : "dd"; return `<${tag}>${exportInline(entry.content)}</${tag}>`; }).join("")}</dl>`;
    case "table": return exportTable(block);
    case "quote": return `<blockquote>${block.blocks.map(exportBlock).join("")}</blockquote>`;
    case "pre": return `<pre>${escapeText(block.text)}</pre>`;
    case "hr": return "<hr>";
  }
}

export const exportHtml = (doc: Doc, separator = ""): string => doc.blocks.map(exportBlock).join(separator);
