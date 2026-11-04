// Markdown inline syntax to inline content. Written for untrusted input: every scan moves forward only, the
// work for bracket and emphasis matching is bounded, and nothing here uses a pattern that can backtrack.
// Raw HTML is never interpreted; it stays text. Links and images go through the same address checks as pasted HTML.
import { decodeEntities } from "../html/entities.ts";
import { checkImageSrc, safeUrl } from "../import.ts";
import { normalizeInline, type Inline, type ListItem, type Mark } from "../model.ts";

export interface MarkdownOptions {
  /** URL schemes a link may use besides relative and fragment addresses. Default: http, https, mailto, tel. */
  readonly linkSchemes?: readonly string[];
  /** Cleans an SVG data address, or returns undefined to refuse it. Without it, SVG images are refused. */
  readonly sanitizeSvg?: ((dataUrl: string) => string | undefined) | undefined;
  /** Largest `data:` image address, in characters. */
  readonly maxDataImageLength?: number;
  /** Keep an image whose address is relative. Default true. */
  readonly relativeImages?: boolean;
}

/** Link reference definitions found in the document: `[label]: address "title"`. Keys come from `refLabel`. */
export type Refs = ReadonlyMap<string, { readonly dest: string }>;
/**
 * The footnotes of the text being read. `keys` has a label (in `refLabel` form) for each definition found before reading begins;
 * `use` gives the id for one more reference to a label (a label used twice gets two ids, as each reference has its own note).
 */
export interface NoteState {
  readonly keys: ReadonlyMap<string, string>;
  readonly items: Map<string, ListItem>;
  /** Each id handed out, with the label it stands for, in the order the references were read. */
  readonly used: Map<string, string>;
  use(key: string): string | undefined;
}
/** What a footnote label may be: letters, digits, underscore, dot and dash. */
export const NOTE_LABEL = /^[\p{L}\p{N}_.-]{1,64}$/u;
export interface InlineContext extends MarkdownOptions { readonly refs?: Refs; readonly notes?: NoteState | undefined }

/** The form of a reference label that is compared: case and runs of white space do not matter. */
export const refLabel = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

const DEFAULT_SCHEMES = ["http", "https", "mailto", "tel"];
const MAX_DESTINATION = 2000;
const MAX_TITLE = 1000;
const MAX_PAREN_DEPTH = 32;
const MAX_BRACKETS = 64;

type Emphasis = "bold" | "italic" | "strike";
/** Marks an inline HTML tag can switch on. Only these tags are read, and only without attributes. */
type SpanMark = Emphasis | "underline" | "sup" | "sub" | "code";
const HTML_TAGS: Readonly<Record<string, SpanMark>> = {
  u: "underline", ins: "underline", sup: "sup", sub: "sub", b: "bold", strong: "bold", i: "italic", em: "italic",
  s: "strike", del: "strike", strike: "strike", kbd: "code", code: "code",
};

interface Delimiter {
  k: "d";
  ch: string;
  n: number;
  open: boolean;
  close: boolean;
  opens: Emphasis[];
  closes: Emphasis[];
  prev: Delimiter | null;
  next: Delimiter | null;
}
interface Bracket {
  k: "lb";
  image: boolean;
  active: boolean;
  index: number;
  /** Where the text after the opening bracket starts in the source. */
  textStart: number;
  delimBefore: Delimiter | null;
}
type Piece =
  | { k: "t"; s: string; dead?: true }
  | { k: "code"; s: string; dead?: true }
  | { k: "br"; dead?: true }
  | { k: "img"; src: string; alt: string; dead?: true }
  | { k: "note"; id: string; dead?: true }
  | { k: "lopen"; href: string | undefined; dead?: true }
  | { k: "lclose"; dead?: true }
  | { k: "tag"; mark: SpanMark; close: boolean; raw: string; paired?: boolean; dead?: true }
  | (Delimiter & { dead?: true })
  | (Bracket & { dead?: true });

const isSpace = (ch: string): boolean => ch === "" || /\s/u.test(ch);
const isPunct = (ch: string): boolean => ch !== "" && /[\p{P}\p{S}]/u.test(ch);
const isAsciiPunct = (ch: string): boolean => ch.length === 1 && "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".includes(ch);

/** Reads the character before an index, whole (a surrogate pair is one character). */
const before = (s: string, i: number): string => {
  if (i <= 0) return "";
  const low = s.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s.charAt(i - 1);
};
const after = (s: string, i: number): string => {
  if (i >= s.length) return "";
  const high = s.charCodeAt(i);
  if (high >= 0xd800 && high <= 0xdbff && i + 1 < s.length) return s.slice(i, i + 2);
  return s.charAt(i);
};

const MARK_ORDER = ["link", "bold", "italic", "underline", "strike", "code", "sup", "sub"] as const;

export function parseInline(src: string, options: InlineContext = {}): Inline[] {
  const schemes = new Set(options.linkSchemes ?? DEFAULT_SCHEMES);
  const pieces: Piece[] = [];
  const brackets: (Bracket & { dead?: true })[] = [];
  let head: Delimiter | null = null;
  let tail: Delimiter | null = null;
  let buffer = "";

  const flush = (): void => {
    if (buffer !== "") { pieces.push({ k: "t", s: buffer }); buffer = ""; }
  };
  const unlink = (d: Delimiter): void => {
    if (d.prev) d.prev.next = d.next; else head = d.next;
    if (d.next) d.next.prev = d.prev; else tail = d.prev;
  };

  const processEmphasis = (bottom: Delimiter | null): void => {
    const floors = new Map<string, Delimiter | null>();
    let closer: Delimiter | null = bottom ? bottom.next : head;
    while (closer) {
      if (!closer.close) { closer = closer.next; continue; }
      const key = `${closer.ch}${closer.n % 3}${closer.open ? 1 : 0}`;
      const floor = floors.has(key) ? floors.get(key) ?? null : bottom;
      let opener: Delimiter | null = closer.prev;
      let found: Delimiter | null = null;
      while (opener && opener !== bottom && opener !== floor) {
        if (opener.ch === closer.ch && opener.open) {
          const tilde = closer.ch === "~";
          const odd = (opener.close || closer.open) && (opener.n + closer.n) % 3 === 0 && !(opener.n % 3 === 0 && closer.n % 3 === 0);
          if (tilde ? opener.n === closer.n : !odd) { found = opener; break; }
        }
        opener = opener.prev;
      }
      if (!found) {
        floors.set(key, closer.prev);
        const next: Delimiter | null = closer.next;
        if (!closer.open) unlink(closer);
        closer = next;
        continue;
      }
      const tilde = closer.ch === "~";
      const use = tilde ? closer.n : closer.n >= 2 && found.n >= 2 ? 2 : 1;
      const mark: Emphasis = tilde ? "strike" : use === 2 ? "bold" : "italic";
      found.n -= use;
      closer.n -= use;
      found.opens.push(mark);
      closer.closes.push(mark);
      // Everything between the pair can no longer match anything: it stays as literal text.
      found.next = closer;
      closer.prev = found;
      if (found.n === 0) unlink(found);
      if (closer.n === 0) {
        const next: Delimiter | null = closer.next;
        unlink(closer);
        closer = next;
      }
    }
    // Delimiters above the bottom are done with.
    if (bottom) { bottom.next = null; tail = bottom; } else { head = null; tail = null; }
  };

  /** Reads `(destination "title")` starting at the opening parenthesis. Returns the address and where it ends. */
  const linkTail = (p: number): { dest: string; end: number } | undefined => {
    let i = p + 1;
    const skip = (): void => { while (i < src.length && (src[i] === " " || src[i] === "\t" || src[i] === "\n")) i++; };
    skip();
    let raw = "";
    if (src[i] === "<") {
      i++;
      const from = i;
      while (i < src.length && src[i] !== ">" && src[i] !== "\n" && src[i] !== "<" && i - from < MAX_DESTINATION) i++;
      if (src[i] !== ">") return undefined;
      raw = src.slice(from, i);
      i++;
    } else {
      const from = i;
      let depth = 0;
      while (i < src.length && i - from < MAX_DESTINATION) {
        const c = src[i] as string;
        if (c === "\\" && i + 1 < src.length && isAsciiPunct(src[i + 1] as string)) { i += 2; continue; }
        if (c === " " || c === "\t" || c === "\n" || c < " ") break;
        if (c === "(") { if (++depth > MAX_PAREN_DEPTH) return undefined; }
        else if (c === ")") { if (depth === 0) break; depth--; }
        i++;
      }
      if (depth !== 0) return undefined;
      raw = src.slice(from, i);
    }
    skip();
    const quote = src[i];
    if (quote === '"' || quote === "'" || quote === "(") {
      const closing = quote === "(" ? ")" : quote;
      const from = ++i;
      while (i < src.length && src[i] !== closing && i - from < MAX_TITLE) { if (src[i] === "\\") i++; i++; }
      if (src[i] !== closing) return undefined;
      i++;
      skip();
    }
    if (src[i] !== ")") return undefined;
    return { dest: unescape(raw), end: i + 1 };
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "\\") {
      const n = src[i + 1] ?? "";
      if (n === "\n") { flush(); pieces.push({ k: "br" }); i += 2; while (src[i] === " " || src[i] === "\t") i++; continue; }
      if (isAsciiPunct(n)) { buffer += n; i += 2; continue; }
      buffer += c; i++; continue;
    }
    if (c === "\n") {
      let spaces = 0;
      const kept = buffer.trimEnd().length;
      spaces = buffer.length - kept;
      buffer = buffer.slice(0, kept);
      if (spaces >= 2) { flush(); pieces.push({ k: "br" }); } else buffer += " ";
      i++;
      while (src[i] === " " || src[i] === "\t") i++;
      continue;
    }
    if (c === "&") {
      const m = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(src.slice(i, i + 40));
      if (m) { buffer += decodeEntities(m[0]); i += m[0].length; continue; }
      buffer += c; i++; continue;
    }
    if (c === "`") {
      let run = 1;
      while (src[i + run] === "`") run++;
      const end = closingTicks(src, i + run, run);
      if (end === -1) { buffer += "`".repeat(run); i += run; continue; }
      flush();
      let body = src.slice(i + run, end).replace(/\n/g, " ");
      if (body.length >= 2 && body.startsWith(" ") && body.endsWith(" ") && body.trim() !== "") body = body.slice(1, -1);
      pieces.push({ k: "code", s: body });
      i = end + run;
      continue;
    }
    if (c === "*" || c === "_" || c === "~") {
      let run = 1;
      while (src[i + run] === c) run++;
      if (c === "~" && run > 2) { buffer += c.repeat(run); i += run; continue; }
      const prev = before(src, i);
      const next = after(src, i + run);
      const left = !isSpace(next) && (!isPunct(next) || isSpace(prev) || isPunct(prev));
      const right = !isSpace(prev) && (!isPunct(prev) || isSpace(next) || isPunct(next));
      const open = c === "_" ? left && (!right || isPunct(prev)) : left;
      const close = c === "_" ? right && (!left || isPunct(next)) : right;
      flush();
      const d: Delimiter & { dead?: true } = { k: "d", ch: c, n: run, open, close, opens: [], closes: [], prev: tail, next: null };
      if (tail) tail.next = d; else head = d;
      tail = d;
      pieces.push(d);
      i += run;
      continue;
    }
    if (c === "[" || (c === "!" && src[i + 1] === "[")) {
      const image = c === "!";
      flush();
      if (brackets.length >= MAX_BRACKETS) { buffer += image ? "![" : "["; i += image ? 2 : 1; continue; }
      const b: Bracket & { dead?: true } = { k: "lb", image, active: true, index: pieces.length, textStart: i + (image ? 2 : 1), delimBefore: tail };
      pieces.push(b);
      brackets.push(b);
      i += image ? 2 : 1;
      continue;
    }
    if (c === "]") {
      const top = brackets.pop();
      if (!top) { buffer += c; i++; continue; }
      if (!top.active) { flush(); asText(top); buffer += c; i++; continue; }
      // `[^label]` is a footnote reference when a definition for the label exists; otherwise it is text.
      const label = !top.image && src[top.textStart] === "^" ? src.slice(top.textStart + 1, i) : "";
      const noteId = options.notes && NOTE_LABEL.test(label) ? options.notes.use(refLabel(label)) : undefined;
      if (noteId !== undefined) {
        flush();
        processEmphasis(top.delimBefore);
        for (let k = top.index + 1; k < pieces.length; k++) (pieces[k] as Piece).dead = true;
        Object.assign(top, { k: "note", id: noteId });
        i++;
        continue;
      }
      let tailInfo = src[i + 1] === "(" ? linkTail(i + 1) : undefined;
      if (!tailInfo && options.refs && options.refs.size > 0) tailInfo = referenceTail(src, i, top.textStart, options.refs);
      if (!tailInfo) { flush(); asText(top); buffer += c; i++; continue; }
      flush();
      processEmphasis(top.delimBefore);
      if (top.image) {
        let alt = "";
        for (let k = top.index + 1; k < pieces.length; k++) {
          const p = pieces[k] as Piece;
          if (!p.dead) {
            if (p.k === "t" || p.k === "code") alt += p.s;
            else if (p.k === "img") alt += p.alt;
            else if (p.k === "d") alt += p.ch.repeat(p.n);
          }
          p.dead = true;
        }
        const safe = checkImageSrc(decodeEntities(tailInfo.dest), options.maxDataImageLength, options.sanitizeSvg, options.relativeImages ?? true);
        const img = top as unknown as Piece;
        if (safe) { Object.assign(img, { k: "img", src: safe, alt }); }
        else Object.assign(img, { k: "t", s: alt });
      } else {
        const href = safeUrl(decodeEntities(tailInfo.dest), schemes);
        Object.assign(top, { k: "lopen", href });
        pieces.push({ k: "lclose" });
        for (const earlier of brackets) if (!earlier.image) earlier.active = false;
      }
      i = tailInfo.end;
      continue;
    }
    if (c === "<") {
      const auto = autolink(src, i, schemes);
      if (auto) {
        flush();
        pieces.push({ k: "lopen", href: auto.href }, { k: "t", s: auto.text }, { k: "lclose" });
        i = auto.end;
        continue;
      }
      const tag = htmlTag(src, i);
      if (tag) {
        flush();
        if (tag.mark === "br") pieces.push({ k: "br" }); else pieces.push({ k: "tag", mark: tag.mark, close: tag.close, raw: src.slice(i, tag.end) });
        i = tag.end;
        continue;
      }
      buffer += c; i++; continue;
    }
    if ((c === "h" || c === "w") && brackets.length === 0 && !/[A-Za-z0-9]/.test(before(src, i))) {
      const bare = bareUrl(src, i, schemes);
      if (bare) {
        flush();
        pieces.push({ k: "lopen", href: bare.href }, { k: "t", s: bare.text }, { k: "lclose" });
        i = bare.end;
        continue;
      }
    }
    buffer += c;
    i++;
  }
  flush();
  processEmphasis(null);
  for (const b of brackets) asText(b);
  pairTags(pieces);
  return render(pieces);
}

/** `[text][label]`, `[text][]` and `[label]` against the definitions. `close` is the index of the `]`. */
function referenceTail(src: string, close: number, textStart: number, refs: Refs): { dest: string; end: number } | undefined {
  const text = src.slice(textStart, close);
  if (text.length > 999) return undefined;
  let label = text;
  let end = close + 1;
  if (src[close + 1] === "[") {
    let k = close + 2;
    while (k < src.length && k - close < 1002 && src[k] !== "]" && src[k] !== "[") k++;
    if (src[k] !== "]") return undefined;
    const given = src.slice(close + 2, k);
    if (given !== "") label = given;
    end = k + 1;
  }
  if (label.trim() === "") return undefined;
  const def = refs.get(refLabel(label));
  return def ? { dest: def.dest, end } : undefined;
}

/** `<u>`, `</sup>`, `<br>` and the like, with no attributes. Anything else that starts with `<` is text. */
function htmlTag(src: string, at: number): { mark: SpanMark | "br"; close: boolean; end: number } | undefined {
  let i = at + 1;
  const close = src[i] === "/";
  if (close) i++;
  const from = i;
  while (i < src.length && i - from < 8 && /[A-Za-z]/.test(src.charAt(i))) i++;
  const name = src.slice(from, i).toLowerCase();
  const mark = name === "br" ? "br" : HTML_TAGS[name];
  if (!mark || (mark === "br" && close)) return undefined;
  while (src[i] === " " || src[i] === "\t") i++;
  if (mark === "br" && src[i] === "/") i++;
  if (src[i] !== ">") return undefined;
  return { mark, close, end: i + 1 };
}

/** A tag counts only when its partner is there; one left over is shown as the text it was written as. */
function pairTags(pieces: Piece[]): void {
  const open = new Map<SpanMark, Piece[]>();
  for (const p of pieces) {
    if (p.dead || p.k !== "tag") continue;
    if (!p.close) { const list = open.get(p.mark) ?? []; list.push(p); open.set(p.mark, list); continue; }
    const mate = open.get(p.mark)?.pop();
    if (mate && mate.k === "tag") { mate.paired = true; p.paired = true; }
  }
}

function asText(b: Bracket): void {
  Object.assign(b as unknown as Piece, { k: "t", s: b.image ? "![" : "[" });
}

/** Finds the next run of exactly `len` backticks at or after `from`. Linear overall: the scan only moves forward. */
function closingTicks(src: string, from: number, len: number): number {
  let i = from;
  while (i < src.length) {
    const at = src.indexOf("`", i);
    if (at === -1) return -1;
    let run = 1;
    while (src[at + run] === "`") run++;
    if (run === len) return at;
    i = at + run;
  }
  return -1;
}

/** Backslash escapes and entities in an address or title. */
export function unescape(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as string;
    if (c === "\\" && isAsciiPunct(raw[i + 1] ?? "")) { out += raw[i + 1]; i++; } else out += c;
  }
  return out;
}

function autolink(src: string, at: number, schemes: ReadonlySet<string>): { href: string | undefined; text: string; end: number } | undefined {
  let i = at + 1;
  const limit = Math.min(src.length, at + MAX_DESTINATION);
  while (i < limit && src[i] !== ">" && src[i] !== "<" && src[i] !== " " && src[i] !== "\n" && src[i] !== "\t") i++;
  if (src[i] !== ">" || i === at + 1) return undefined;
  const body = src.slice(at + 1, i);
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]{1,31}):/.exec(body.slice(0, 40));
  if (scheme) return { href: safeUrl(body, schemes), text: body, end: i + 1 };
  const email = body.indexOf("@");
  if (email > 0 && email === body.lastIndexOf("@") && body.indexOf(".", email) > email + 1 && !body.endsWith(".")) return { href: safeUrl(`mailto:${body}`, schemes), text: body, end: i + 1 };
  return undefined;
}

function bareUrl(src: string, at: number, schemes: ReadonlySet<string>): { href: string | undefined; text: string; end: number } | undefined {
  const head = src.slice(at, at + 8).toLowerCase();
  const prefix = head.startsWith("https://") ? 8 : head.startsWith("http://") ? 7 : head.startsWith("www.") ? 4 : 0;
  if (prefix === 0) return undefined;
  let end = at + prefix;
  while (end < src.length && end - at < MAX_DESTINATION && !/[\s<]/.test(src.charAt(end))) end++;
  // Trailing punctuation and an unmatched closing parenthesis belong to the sentence, not the address.
  let trimming = true;
  while (trimming && end > at + prefix) {
    const last = src.charAt(end - 1);
    if ("?!.,:*_~'\";".includes(last)) end--;
    else if (last === ")") {
      let open = 0, close = 0;
      for (let k = at; k < end; k++) { const ch = src.charAt(k); if (ch === "(") open++; else if (ch === ")") close++; }
      if (close > open) end--; else trimming = false;
    } else trimming = false;
  }
  if (end <= at + prefix) return undefined;
  const text = src.slice(at, end);
  return { href: safeUrl(prefix === 4 ? `https://${text}` : text, schemes), text, end };
}

function render(pieces: readonly Piece[]): Inline[] {
  const out: Inline[] = [];
  const counts: Record<SpanMark, number> = { bold: 0, italic: 0, strike: 0, underline: 0, sup: 0, sub: 0, code: 0 };
  let link: string | undefined;
  const marks = (code: boolean): Mark[] => {
    const list: Mark[] = [];
    for (const type of MARK_ORDER) {
      if (type === "link") { if (link !== undefined) list.push({ type: "link", href: link }); }
      else if (type === "code") { if (code || counts.code > 0) list.push({ type: "code" }); }
      else if (counts[type] > 0) list.push({ type });
    }
    return list;
  };
  const emit = (text: string, code = false): void => { if (text !== "") out.push({ type: "text", text, marks: marks(code) }); };
  for (const p of pieces) {
    if (p.dead) continue;
    switch (p.k) {
      case "t": emit(p.s); break;
      case "code": emit(p.s, true); break;
      case "br": out.push({ type: "br" }); break;
      case "img": out.push({ type: "image", src: p.src, ...(p.alt ? { alt: p.alt } : {}) }); break;
      case "lopen": link = p.href; break;
      case "lclose": link = undefined; break;
      case "d":
        for (const m of p.closes) counts[m]--;
        emit(p.ch.repeat(p.n));
        for (const m of p.opens) counts[m]++;
        break;
      case "tag":
        if (!p.paired) emit(p.raw);
        else counts[p.mark] += p.close ? -1 : 1;
        break;
      case "lb": emit(p.image ? "![" : "["); break;
      case "note": out.push({ type: "note", id: p.id }); break;
    }
  }
  // A break at the very end of a paragraph says nothing.
  while (out[out.length - 1]?.type === "br") out.pop();
  return normalizeInline(out);
}
