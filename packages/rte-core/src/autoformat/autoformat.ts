// Typed shortcuts that turn text into formatting as it is typed: `# ` starts a heading, `> ` a quote, three backticks a code block,
// three dashes a rule, `**bold**`, `*italic*`, `` `code` `` and `~~strike~~` mark the text between them, and a web address followed by a
// space becomes a link. Each is a function from the document and caret to an edit, or undefined when the typed text is nothing special.
import { inlineText, type Doc, type Inline, type Mark } from "../model.ts";
import type { TriggerResult } from "../behaviors.ts";
import { caret, getBlock, getContent, isCollapsed, kindAt, setContent, type EditResult, type Selection } from "../path.ts";
import { insertText, sliceInline } from "../edit.ts";
import { setBlockType, toggleCodeBlock, toggleQuote, insertRule } from "../blocks.ts";
import { setLink } from "../links.ts";
import { normalizeInline } from "../model.ts";

/** The text of a plain paragraph up to the caret, when the caret is at its end; the paragraph is then emptied for the block to take over. */
function lonePrefix(doc: Doc, sel: Selection): { text: string; emptied: Doc } | undefined {
  if (!isCollapsed(sel)) return undefined;
  const path = sel.anchor.path;
  const block = getBlock(doc, path);
  if (block?.type !== "p" || kindAt(doc, path) !== "p") return undefined;
  const text = inlineText(block.content);
  if (sel.anchor.offset !== text.length || block.content.some((n) => n.type !== "text" || n.marks.length > 0)) return undefined;
  return { text, emptied: setContent(doc, path, []) };
}

/** `#` to `######` and a space make a heading of that level; `>` and a space a quote. The space is not inserted. */
export function blockShortcut(doc: Doc, sel: Selection, typed: string): EditResult | undefined {
  const lone = typed === " " || typed === "`" || typed === "-" || typed === "*" || typed === "_" ? lonePrefix(doc, sel) : undefined;
  if (!lone) return undefined;
  const at = caret({ path: sel.anchor.path, offset: 0 });
  if (typed === " ") {
    if (/^#{1,6}$/.test(lone.text)) return setBlockType(lone.emptied, at, { type: "h", level: lone.text.length as 1 | 2 | 3 | 4 | 5 | 6 });
    if (lone.text === ">") return toggleQuote(lone.emptied, at);
    return undefined;
  }
  if (typed === "`" && lone.text === "``") return toggleCodeBlock(lone.emptied, at);
  if ((typed === "-" || typed === "*" || typed === "_") && lone.text === typed + typed) return insertRule(lone.emptied, at);
  return undefined;
}

// What may open and close each kind of span. The first group is the text between the markers: not empty, not starting or ending in a
// space, and with no object (an image, a line break) inside.
const SPANS: readonly { readonly close: string; readonly pattern: RegExp; readonly mark: Mark; readonly length: number }[] = [
  { close: "*", pattern: /(?<![*\w])\*\*(?=\S)([^*\n￼]+?)(?<=\S)\*$/, mark: { type: "bold" }, length: 2 },
  { close: "~", pattern: /(?<![~\w])~~(?=\S)([^~\n￼]+?)(?<=\S)~$/, mark: { type: "strike" }, length: 2 },
  { close: "*", pattern: /(?<![*\w])\*(?=[^\s*])([^*\n￼]+?)(?<=[^\s*])$/, mark: { type: "italic" }, length: 1 },
  { close: "_", pattern: /(?<![_\w])_(?=[^\s_])([^_\n￼]+?)(?<=[^\s_])$/, mark: { type: "italic" }, length: 1 },
  { close: "`", pattern: /(?<![`\w])`(?=[^\s`])([^`\n￼]+?)(?<=[^\s`])$/, mark: { type: "code" }, length: 1 },
];

/**
 * Typing the last marker of `**bold**`, `~~strike~~`, `*italic*`, `_italic_` or `` `code` `` removes the markers and marks what was
 * between them. The caret ends up after the text, and the next characters typed are plain. The closing marker typed is not inserted.
 */
export function spanShortcut(doc: Doc, sel: Selection, typed: string): TriggerResult | undefined {
  if (!isCollapsed(sel) || typed.length !== 1) return undefined;
  const path = sel.anchor.path;
  const kind = kindAt(doc, path);
  if (kind === "pre") return undefined;
  const content = getContent(doc, path);
  const offset = sel.anchor.offset;
  const before = inlineText(sliceInline(content, 0, offset));
  for (const span of SPANS) {
    if (span.close !== typed) continue;
    // The typed character is the last of the closing marker, so what is before the caret holds all of it but that one.
    const m = span.pattern.exec(before);
    if (!m) continue;
    const start = m.index;
    const inner = m[1] as string;
    const innerFrom = start + span.length;
    const innerTo = innerFrom + inner.length;
    if (innerTo > offset) continue;
    const middle = sliceInline(content, innerFrom, innerTo);
    if (middle.some((n) => n.type !== "text" || n.marks.some((x) => x.type === span.mark.type))) continue;
    const marked: Inline[] = middle.map((n) => (n.type === "text" ? { ...n, marks: [...n.marks, span.mark] } : n));
    const next = normalizeInline([...sliceInline(content, 0, start), ...marked, ...sliceInline(content, offset)]);
    const last = sliceInline(content, 0, start).at(-1);
    return { doc: setContent(doc, path, next), selection: caret({ path, offset: start + inner.length }), storedMarks: last?.type === "text" ? last.marks : [] };
  }
  return undefined;
}

const ADDRESS = /(?:https?:\/\/|www\.)[^\s￼<>"]+$/i;

/** A web address before the caret, then a space: the address becomes a link and the space is typed after it. */
export function addressShortcut(doc: Doc, sel: Selection, typed: string): EditResult | undefined {
  if (typed !== " " || !isCollapsed(sel)) return undefined;
  const path = sel.anchor.path;
  if (kindAt(doc, path) === "pre") return undefined;
  const content = getContent(doc, path);
  const offset = sel.anchor.offset;
  const before = inlineText(sliceInline(content, 0, offset));
  const m = ADDRESS.exec(before);
  if (!m) return undefined;
  // Punctuation that ends a sentence is not part of the address.
  const word = m[0].replace(/[.,;:!?)\]'"]+$/, "");
  if (word.replace(/^(?:https?:\/\/|www\.)/i, "").length < 3 || !/[a-z0-9]/i.test(word.replace(/^(?:https?:\/\/|www\.)/i, ""))) return undefined;
  const start = m.index;
  const end = start + word.length;
  const run = sliceInline(content, start, end);
  if (run.some((n) => n.type !== "text" || n.marks.some((x) => x.type === "link"))) return undefined;
  const typedSpace = insertText(doc, caret({ path, offset }), " ");
  const linked = setLink(typedSpace.doc, { anchor: { path, offset: start }, focus: { path, offset: end } }, /^www\./i.test(word) ? `https://${word}` : word);
  return linked.doc === typedSpace.doc ? undefined : { doc: linked.doc, selection: typedSpace.selection };
}
