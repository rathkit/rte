// The document model. Plain data with no DOM types, so it runs the same in a browser, in Node and on a server.
// Values are treated as immutable: transforms build new values instead of editing old ones.

export type Mark =
  | { readonly type: "bold" | "italic" | "underline" | "strike" | "code" | "sup" | "sub" }
  | { readonly type: "link"; readonly href: string }
  | { readonly type: "color" | "background"; readonly value: string };

export type MarkType = Mark["type"];

export interface TextRun {
  readonly type: "text";
  readonly text: string;
  readonly marks: readonly Mark[];
}
export interface LineBreak {
  readonly type: "br";
}
export interface Image {
  readonly type: "image";
  readonly src: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}
export type Inline = TextRun | LineBreak | Image;

export type Align = "left" | "center" | "right" | "justify";

export interface Paragraph {
  readonly type: "p";
  readonly content: readonly Inline[];
  readonly align?: Align;
}
export interface Heading {
  readonly type: "h";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly content: readonly Inline[];
  readonly align?: Align;
}
export interface ListItem {
  readonly content: readonly Inline[];
  readonly sublists: readonly List[];
}
export interface List {
  readonly type: "ul" | "ol";
  readonly start?: number;
  /** A CSS list-style-type keyword such as `circle` or `lower-alpha`. Absent means the default for the depth. */
  readonly style?: string;
  readonly items: readonly ListItem[];
}
export interface DefinitionEntry {
  /** A term (`dt`) or the detail that describes it (`dd`). */
  readonly kind: "term" | "detail";
  readonly content: readonly Inline[];
}
export interface DefinitionList {
  readonly type: "dl";
  readonly entries: readonly DefinitionEntry[];
}
export interface TableCell {
  readonly header: boolean;
  readonly colspan: number;
  readonly rowspan: number;
  readonly blocks: readonly Block[];
}
export interface Table {
  readonly type: "table";
  readonly rows: readonly (readonly TableCell[])[];
  /** The width of each column of the grid as a CSS length in `px` or `%`, or null for automatic. Absent when every column is automatic. */
  readonly widths?: readonly (string | null)[];
}

/** A color the model accepts: hex, a plain name, or rgb()/hsl(). Anything else is not a color. */
export const COLOR_VALUE = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

/** A column width the model accepts: a plain number with `px` or `%`. Anything else is not a width. */
export const COLUMN_WIDTH = /^\d{1,5}(\.\d{1,2})?(px|%)$/;
export interface Quote {
  readonly type: "quote";
  readonly blocks: readonly Block[];
}
export interface CodeBlock {
  readonly type: "pre";
  readonly text: string;
}
export interface Rule {
  readonly type: "hr";
}
export type Block = Paragraph | Heading | List | DefinitionList | Table | Quote | CodeBlock | Rule;

export interface Doc {
  readonly blocks: readonly Block[];
}

export const emptyDoc: Doc = { blocks: [{ type: "p", content: [] }] };

const sameMark = (a: Mark, b: Mark): boolean =>
  a.type === b.type && ("href" in a ? "href" in b && a.href === b.href : "value" in a ? "value" in b && a.value === b.value : true);

export const sameMarks = (a: readonly Mark[], b: readonly Mark[]): boolean =>
  a.length === b.length && a.every((mark, i) => sameMark(mark, b[i] as Mark));

/** Merges neighbouring runs that carry the same marks and drops empty runs. */
export function normalizeInline(content: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of content) {
    if (node.type === "text") {
      if (node.text === "") continue;
      const last = out[out.length - 1];
      if (last?.type === "text" && sameMarks(last.marks, node.marks)) {
        out[out.length - 1] = { type: "text", text: last.text + node.text, marks: last.marks };
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

/** The plain text of inline content. A line break counts as one newline and an image as one object character. */
export function inlineText(content: readonly Inline[]): string {
  let out = "";
  for (const node of content) out += node.type === "text" ? node.text : node.type === "br" ? "\n" : "￼";
  return out;
}

export const inlineLength = (content: readonly Inline[]): number => inlineText(content).length;

export const text = (value: string, marks: readonly Mark[] = []): TextRun => ({ type: "text", text: value, marks });
