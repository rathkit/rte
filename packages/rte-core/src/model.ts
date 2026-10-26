// The document model. Plain data with no DOM types, so it runs the same in a browser, in Node and on a server.
// Values are treated as immutable: transforms build new values instead of editing old ones.

export type Mark =
  | { readonly type: "bold" | "italic" | "underline" | "strike" | "code" | "sup" | "sub" }
  | { readonly type: "link"; readonly href: string; /** Opens in a new tab (written with `rel="noopener noreferrer"`). */ readonly newTab?: boolean }
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
  /** How the image sits among text: floated to one side with text wrapping round it, or on a line of its own in the middle. Absent: in the line. */
  readonly align?: ImageAlign;
  /** A caption. Written (as a figure) only for an image alone in its paragraph. */
  readonly caption?: string;
}
export type ImageAlign = "left" | "right" | "center";
export type Inline = TextRun | LineBreak | Image;

export type Align = "left" | "center" | "right" | "justify";
/** The most a block can be indented, in steps. */
export const MAX_INDENT = 8;
/** Which way a block reads. Absent means it follows its surroundings. */
export type Direction = "ltr" | "rtl";

export interface Paragraph {
  readonly type: "p";
  readonly content: readonly Inline[];
  readonly align?: Align;
  readonly dir?: Direction;
  /** How far the block is moved in from its start edge: whole steps of 2em, 1 to 8. Absent means not at all. */
  readonly indent?: number;
}
export interface Heading {
  readonly type: "h";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly content: readonly Inline[];
  readonly align?: Align;
  readonly dir?: Direction;
  /** How far the block is moved in from its start edge: whole steps of 2em, 1 to 8. Absent means not at all. */
  readonly indent?: number;
}
export interface ListItem {
  readonly content: readonly Inline[];
  readonly sublists: readonly List[];
  /** Present when the item is a task: whether it is done. Absent for an ordinary item. */
  readonly checked?: boolean;
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
/** A line round all four sides of a cell. */
export interface CellBorder {
  readonly style: "solid" | "dashed" | "dotted";
  /** In pixels, 1 to 8. */
  readonly width: number;
  readonly color: string;
}
export interface TableCell {
  readonly header: boolean;
  readonly colspan: number;
  readonly rowspan: number;
  readonly blocks: readonly Block[];
  /** The color behind the cell. */
  readonly background?: string;
  /**
   * The line round all four sides: a line, or null for explicitly none (which hides the lines a stylesheet would draw). Absent means
   * not said. Where the sides differ, `borders` says which have a line instead and this is absent.
   */
  readonly border?: CellBorder | null;
  readonly borders?: { readonly top?: CellBorder | null; readonly right?: CellBorder | null; readonly bottom?: CellBorder | null; readonly left?: CellBorder | null };
}
export interface Table {
  readonly type: "table";
  readonly rows: readonly (readonly TableCell[])[];
  /** The width of each column of the grid as a CSS length in `px` or `%`, or null for automatic. Absent when every column is automatic. */
  readonly widths?: readonly (string | null)[];
  /** The least height of each row of the grid in `px`, or null for automatic. Absent when every row is automatic. */
  readonly heights?: readonly (string | null)[];
}

/** A row height the model accepts: a plain number with `px`. */
export const ROW_HEIGHT = /^\d{1,4}(\.\d{1,2})?px$/;

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
