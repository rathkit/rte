// Recognizes the markup word processors write for lists: paragraphs with a marker and a level, and vendor attributes that
// describe a list's marker. Free, like the rest of the standard plugins; it uses only the importer's public extension points.
import type { HElement, HNode } from "../html/parse.ts";
import type { ImportRecognizer } from "../import.ts";
import { parseStyle } from "../import.ts";


const ROMAN = new Map([["i", 1], ["v", 5], ["x", 10], ["l", 50], ["c", 100], ["d", 500], ["m", 1000]]);
const romanValue = (text: string): number => {
  let total = 0;
  const digits = [...text.toLowerCase()].map((ch) => ROMAN.get(ch) ?? 0);
  digits.forEach((value, i) => { total += value < (digits[i + 1] ?? 0) ? -value : value; });
  return total;
};

interface Marker {
  readonly type: "ul" | "ol";
  readonly style?: string;
  readonly start?: number;
}

/** Reads a list marker such as `·`, `o`, `§`, `3.`, `b)`, `iv.` into a list kind, marker style and start number. */
function parseMarker(raw: string): Marker | undefined {
  const text = raw.replace(/[\s ]+/g, "");
  if (text === "") return undefined;
  const numbered = /^\(?(\d{1,5})[.)]?$/.exec(text);
  if (numbered) return { type: "ol", start: Number(numbered[1]) };
  const lower = /^\(?([ivxlcdm]+|[a-z])[.)]$/.exec(text);
  const upper = /^\(?([IVXLCDM]+|[A-Z])[.)]$/.exec(text);
  const word = lower?.[1] ?? upper?.[1];
  if (word !== undefined) {
    const isUpper = upper !== null && lower === null;
    // `i`, `v` and `x` alone, and any longer run of roman letters, are roman numerals. Other single letters are letters.
    const roman = word.length > 1 || /^[ivxIVX]$/.test(word);
    if (roman) return { type: "ol", style: isUpper ? "upper-roman" : "lower-roman", start: romanValue(word) };
    return { type: "ol", style: isUpper ? "upper-alpha" : "lower-alpha", start: word.toLowerCase().charCodeAt(0) - 96 };
  }
  // Bullets. Symbol and Wingdings glyphs often arrive as private-use characters.
  const glyph = [...text][0] as string;
  if (/^[oO○◦∘]$/.test(glyph)) return { type: "ul", style: "circle" };
  if (/^[§▪■□◾]$/.test(glyph)) return { type: "ul", style: "square" };
  if (/^[·•●∙*\-–—]$/.test(glyph)) return { type: "ul", style: "disc" };
  return undefined;
}

const textOf = (nodes: readonly HNode[]): string => nodes.map((n) => (n.type === "text" ? n.text : textOf(n.children))).join("");

const isIgnoredMarker = (node: HNode): boolean =>
  node.type === "el" && node.tag === "span" && /mso-list\s*:\s*ignore/i.test(node.attrs.style ?? "");

/** Splits the marker a word processor wrote into a list paragraph from the paragraph's own content. */
function splitMarker(children: readonly HNode[]): { marker: string | undefined; rest: HNode[] } {
  let marker: string | undefined;
  const strip = (nodes: readonly HNode[]): HNode[] =>
    nodes.flatMap((node): HNode[] => {
      if (isIgnoredMarker(node)) {
        marker ??= textOf((node as HElement).children);
        return [];
      }
      return node.type === "el" ? [{ ...node, children: strip(node.children) }] : [node];
    });
  const rest = strip(children);
  return { marker, rest };
}

const OFFICE_LIST = /^\s*(l\d+)\s+level(\d+)/i;

/**
 * Word-for-web describes a list's marker in a JSON attribute: bullet glyph code points, or [placeholder, number format].
 * Seen in real captures: format 0 (decimal), 2 (lower roman), 4 (lower letter). Formats 1 (upper roman) and 3 (upper
 * letter) are filled in from the word processor's public numbering enumeration and have NOT been seen in a capture.
 */
export function definitionStyle(raw: string | undefined): { type: "ul" | "ol"; style?: string } | undefined {
  if (!raw) return undefined;
  try {
    const defn = JSON.parse(raw) as Record<string, unknown>;
    const spec = defn["469769242"];
    if (!Array.isArray(spec)) return undefined;
    if (spec.length === 1) {
      const glyph = String.fromCodePoint(Number(spec[0]));
      const marker = parseMarker(glyph);
      return marker?.type === "ul" ? { type: "ul", ...(marker.style ? { style: marker.style } : {}) } : { type: "ul" };
    }
    const format = (["decimal", "upper-roman", "lower-roman", "upper-alpha", "lower-alpha"] as const)[Number(spec[1])];
    return { type: "ol", ...(format && format !== "decimal" ? { style: format } : {}) };
  } catch {
    return undefined;
  }
}

/**
 * A paragraph a word processor wrote as a list item (marker text plus a level) becomes a one-item list with a level hint, and the
 * importer's nesting pass joins the items into real lists.
 */
export const wordRecognizer: ImportRecognizer = {
  element(el, ctx) {
    if (el.tag !== "p") return undefined;
    const info = OFFICE_LIST.exec(parseStyle(el.attrs.style).get("mso-list") ?? "");
    if (!info) return undefined;
    let { marker, rest } = splitMarker(el.children);
    if (marker === undefined) {
      // The wrapper that marks the bullet is gone (some browsers rewrite the markup): read the literal marker instead.
      const lead = /^[\s\u00a0]*([^\s\u00a0]{1,6})[\s\u00a0]{2,}/.exec(textOf(rest));
      if (lead && parseMarker(lead[1] as string)) {
        marker = lead[1];
        let skip = lead[0].length;
        const trim = (nodes: readonly HNode[]): HNode[] =>
          nodes.flatMap((node): HNode[] => {
            if (skip <= 0) return [node];
            if (node.type === "text") {
              const cut = Math.min(skip, node.text.length);
              skip -= cut;
              return node.text.length > cut ? [{ type: "text", text: node.text.slice(cut) }] : [];
            }
            return [{ ...node, children: trim(node.children) }];
          });
        rest = trim(rest);
      }
    }
    const parsed = marker === undefined ? undefined : parseMarker(marker);
    return [{
      listItem: {
        type: parsed?.type ?? "ul",
        ...(parsed?.start !== undefined && parsed.start !== 1 ? { start: parsed.start } : {}),
        ...(parsed?.style !== undefined ? { style: parsed.style } : {}),
        level: Number(info[2]),
        listId: info[1] as string,
        content: ctx.inline(rest),
      },
    }];
  },

  listItemStyle: (li) => definitionStyle(li.attrs["data-list-defn-props"]),
};
