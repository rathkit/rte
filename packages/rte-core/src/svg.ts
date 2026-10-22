// An SVG sanitizer for the free core. SVG is markup that can run script and load other files, so it is never passed
// through: the text is read into a tree with a case-preserving parser, only allow-listed elements and attributes are
// kept, every value is checked, and the result is written out again from the tree. Anything the sanitizer cannot
// make sense of is refused rather than repaired.
//
// What the result can do: draw shapes, text, gradients, clips, masks and simple filters. What it cannot do: run
// script, load another file, link anywhere, animate, embed HTML, or point at anything outside the picture itself.
import { escapeAttribute, escapeText } from "./html/entities.ts";

export interface SvgLimits {
  /** Largest input, in characters. */
  readonly maxLength: number;
  /** Most elements allowed. */
  readonly maxElements: number;
  /** Deepest nesting allowed. */
  readonly maxDepth: number;
}
export const DEFAULT_SVG_LIMITS: SvgLimits = { maxLength: 262_144, maxElements: 4000, maxDepth: 32 };

const NS = "http://www.w3.org/2000/svg";

const ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "lineargradient", "radialgradient", "stop", "clippath", "mask", "pattern", "marker",
  "filter", "fegaussianblur", "feoffset", "fecolormatrix", "feblend", "fecomposite", "feflood", "femerge", "femergenode",
  "fedropshadow", "fecomponenttransfer", "fefunca", "fefuncr", "fefuncg", "fefuncb", "femorphology", "feturbulence",
]);
// The canonical spelling of the elements above whose names have capitals, since the lookup is case-insensitive.
const CANONICAL: Record<string, string> = {
  lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath", fegaussianblur: "feGaussianBlur",
  feoffset: "feOffset", fecolormatrix: "feColorMatrix", feblend: "feBlend", fecomposite: "feComposite", feflood: "feFlood",
  femerge: "feMerge", femergenode: "feMergeNode", fedropshadow: "feDropShadow", fecomponenttransfer: "feComponentTransfer",
  fefunca: "feFuncA", fefuncr: "feFuncR", fefuncg: "feFuncG", fefuncb: "feFuncB", femorphology: "feMorphology", feturbulence: "feTurbulence",
};
const TEXT_CONTAINERS = new Set(["text", "tspan", "title", "desc"]);

// Attributes kept, by their exact (case-sensitive) names. `style` and the link attributes are handled apart.
const ATTRIBUTES = new Set([
  "id", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "d", "points", "viewBox",
  "preserveAspectRatio", "transform", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "fill-opacity", "opacity", "fill-rule", "clip-rule", "clip-path",
  "mask", "filter", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "letter-spacing", "word-spacing", "text-decoration", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
  "spreadMethod", "fx", "fy", "fr", "patternUnits", "patternContentUnits", "patternTransform", "markerWidth", "markerHeight",
  "markerUnits", "refX", "refY", "orient", "marker-start", "marker-mid", "marker-end", "clipPathUnits", "maskUnits",
  "maskContentUnits", "filterUnits", "primitiveUnits", "stdDeviation", "dx", "dy", "in", "in2", "result", "mode", "operator",
  "k1", "k2", "k3", "k4", "type", "values", "flood-color", "flood-opacity", "radius", "baseFrequency", "numOctaves", "seed",
  "slope", "intercept", "amplitude", "exponent", "tableValues", "visibility", "display", "vector-effect", "shape-rendering",
  "lengthAdjust", "textLength", "rotate", "version", "xml:space",
]);
const STYLE_PROPERTIES = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "stroke-opacity", "fill-opacity", "opacity", "fill-rule", "clip-rule", "font-family", "font-size", "font-weight", "font-style",
  "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing", "text-decoration", "stop-color", "stop-opacity",
  "flood-color", "flood-opacity", "visibility", "display", "vector-effect", "shape-rendering", "paint-order",
]);

interface XNode {
  readonly tag: string;
  readonly attrs: Map<string, string>;
  readonly children: (XNode | string)[];
}

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g;
const decodeXml = (value: string): string =>
  value.replace(ENTITY, (_, dec?: string, hex?: string, name?: string) => {
    if (name) return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[name] as string;
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex as string, 16);
    return code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || code === 0 ? "�" : String.fromCodePoint(code);
  });

/** Reads XML into a tree, keeping the case of names. Returns undefined for anything it will not read. */
function parseXml(source: string, limits: SvgLimits): XNode | undefined {
  // No entity declarations (they can expand without limit), and no CDATA or processing instructions beyond the XML header.
  if (/<!ENTITY|<!ATTLIST|<!NOTATION/i.test(source) || /<!\[CDATA\[/i.test(source)) return undefined;
  const stripped = source.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/i, "").replace(/<!DOCTYPE[^>[]*(?:\[[^\]]*\])?[^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack: XNode[] = [];
  let root: XNode | undefined;
  let count = 0;
  const tokens = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  const attrPattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = tokens.exec(stripped); m; m = tokens.exec(stripped)) {
    if (m[6]) return undefined; // a stray "<"
    if (m[5] !== undefined) {
      const top = stack[stack.length - 1];
      if (top) top.children.push(decodeXml(m[5]));
      else if (m[5].trim() !== "") return undefined; // text outside the root element
      continue;
    }
    if (m[1] === "/") {
      const top = stack.pop();
      if (!top || top.tag !== m[2]) return undefined; // mismatched
      continue;
    }
    if (++count > limits.maxElements) return undefined;
    const attrs = new Map<string, string>();
    for (let a = attrPattern.exec(m[3] ?? ""); a; a = attrPattern.exec(m[3] ?? "")) {
      const value = decodeXml(a[2] ?? a[3] ?? "");
      if (attrs.has(a[1] as string)) return undefined; // duplicate attribute: not well-formed
      attrs.set(a[1] as string, value);
    }
    const node: XNode = { tag: m[2] as string, attrs, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else if (root) return undefined; // two roots
    else root = node;
    if (m[4] !== "/") {
      stack.push(node);
      if (stack.length > limits.maxDepth) return undefined;
    }
  }
  return stack.length === 0 ? root : undefined;
}

// A value may reference only things inside the same picture: no scheme, no file, no `url(` that is not `url(#id)`.
const HAS_BAD_REFERENCE = /javascript:|vbscript:|data:|expression\s*\(|@import|&#|\\/i;
function safeValue(value: string): boolean {
  // Markup characters have no business in an attribute value of a picture.
  if (HAS_BAD_REFERENCE.test(value) || /[<>]/.test(value)) return false;
  for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    if (!/^\s*['"]?#[\w.-]+['"]?\s*$/.test(match[1] as string)) return false;
  }
  return true;
}

function safeStyle(style: string): string | undefined {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (STYLE_PROPERTIES.has(property) && safeValue(value)) kept.push(`${property}:${value}`);
  }
  return kept.length > 0 ? kept.join(";") : undefined;
}

function cleanElement(node: XNode): XNode | undefined {
  const name = node.tag.toLowerCase();
  // Prefixed names (svg:rect) are accepted only for the SVG prefix, which is simply dropped.
  const local = name.startsWith("svg:") ? name.slice(4) : name;
  if (!ELEMENTS.has(local)) return undefined;
  const tag = CANONICAL[local] ?? local;
  const attrs = new Map<string, string>();
  if (tag === "svg") attrs.set("xmlns", NS);
  for (const [key, value] of node.attrs) {
    if (key === "style") {
      const style = safeStyle(value);
      if (style) attrs.set("style", style);
    } else if (key === "href" || key === "xlink:href") {
      // Only a reference to something else in the same picture. `use` needs it; nothing else may link.
      if ((tag === "use" || tag === "linearGradient" || tag === "radialGradient" || tag === "pattern") && /^#[\w.-]+$/.test(value)) attrs.set("href", value);
    } else if (ATTRIBUTES.has(key) && safeValue(value)) {
      attrs.set(key, value);
    }
  }
  const children: (XNode | string)[] = [];
  for (const child of node.children) {
    if (typeof child === "string") {
      if (TEXT_CONTAINERS.has(tag)) children.push(child);
    } else {
      const cleaned = cleanElement(child);
      if (cleaned) children.push(cleaned);
    }
  }
  return { tag, attrs, children };
}

function write(node: XNode): string {
  const attrs = [...node.attrs].map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join("");
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map((c) => (typeof c === "string" ? escapeText(c).replace(/ /g, "&#160;") : write(c))).join("")}</${node.tag}>`;
}

/**
 * `use` copies another element. Chains of copies that each copy the next one twice grow exponentially when drawn, so a `use` may
 * not point at anything that itself contains a `use`, and the number of copies is capped.
 */
function usesAreSafe(root: XNode): boolean {
  const ids = new Map<string, XNode>();
  const uses: XNode[] = [];
  const walk = (node: XNode): void => {
    const id = node.attrs.get("id");
    if (id !== undefined && !ids.has(id)) ids.set(id, node);
    if (node.tag === "use") uses.push(node);
    for (const child of node.children) if (typeof child !== "string") walk(child);
  };
  walk(root);
  if (uses.length > 64) return false;
  const containsUse = (node: XNode): boolean => node.tag === "use" || node.children.some((c) => typeof c !== "string" && containsUse(c));
  return uses.every((use) => {
    const target = ids.get((use.attrs.get("href") ?? "").slice(1));
    return !target || !containsUse(target);
  });
}

/** Returns a clean copy of an SVG document, or undefined when it cannot be read or is not an SVG picture. */
export function sanitizeSvg(source: string, limits: SvgLimits = DEFAULT_SVG_LIMITS): string | undefined {
  if (source.length > limits.maxLength) return undefined;
  const tree = parseXml(source, limits);
  if (!tree) return undefined;
  const name = tree.tag.toLowerCase();
  if (name !== "svg" && name !== "svg:svg") return undefined;
  const clean = cleanElement(tree);
  return clean && usesAreSafe(clean) ? write(clean) : undefined;
}

// ---- base64, without relying on a global that only some environments have ----------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function decodeBase64(input: string): Uint8Array | undefined {
  const text = input.replace(/\s+/g, "").replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(text)) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const ch of text) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] as string;
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)] as string;
    out += b === undefined ? "=" : (B64[((b & 15) << 2) | ((c ?? 0) >> 6)] as string);
    out += c === undefined ? "=" : (B64[c & 63] as string);
  }
  return out;
}

/**
 * Sanitizes an SVG data address (base64 or percent-encoded) and returns it as a base64 data address of the clean text.
 * Returns undefined when it is not valid SVG or cannot be made safe.
 */
export function sanitizeSvgDataUrl(url: string, limits: SvgLimits = DEFAULT_SVG_LIMITS): string | undefined {
  const match = /^data:image\/svg\+xml(?:;charset=[\w-]+)?(;base64)?,([\s\S]*)$/i.exec(url.trim());
  if (!match) return undefined;
  let text: string;
  try {
    if (match[1]) {
      const bytes = decodeBase64(match[2] as string);
      if (!bytes) return undefined;
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } else {
      text = decodeURIComponent(match[2] as string);
    }
  } catch {
    return undefined;
  }
  const clean = sanitizeSvg(text, limits);
  return clean === undefined ? undefined : `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(clean))}`;
}
