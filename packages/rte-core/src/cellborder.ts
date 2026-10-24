// The lines round a table cell. A cell has one line all round (`border`) or, where the sides differ, a line for each side that has one
// (`borders`); null means "none, whatever a stylesheet says" and a missing side means "not said". This keeps the two forms canonical so
// that the same lines are always written the same way, and has the reading and writing of the CSS for them.
import { COLOR_VALUE, type CellBorder, type TableCell } from "./model.ts";

export type Side = "top" | "right" | "bottom" | "left";
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
export type Line = CellBorder | null | undefined;

export const sameLine = (a: Line, b: Line): boolean => (a === b) || (!!a && !!b && a.style === b.style && a.width === b.width && a.color === b.color);

/** What each side has: a line, null for none, undefined for not said. */
export function sidesOf(cell: TableCell): Record<Side, Line> {
  const out = {} as Record<Side, Line>;
  for (const side of SIDES) out[side] = cell.borders && side in cell.borders ? cell.borders[side] : cell.border;
  return out;
}

/** The cell with its sides set to these (a side not named keeps what it has), in the canonical form. */
export function withSides(cell: TableCell, change: Partial<Record<Side, Line>>): TableCell {
  const now = sidesOf(cell);
  const next = { ...now, ...change };
  const { border: _b, borders: _bs, ...rest } = cell;
  void _b; void _bs;
  if (SIDES.every((side) => sameLine(next[side], next.top))) return next.top === undefined ? rest : { ...rest, border: next.top };
  const borders: Partial<Record<Side, CellBorder | null>> = {};
  for (const side of SIDES) if (next[side] !== undefined) borders[side] = next[side] as CellBorder | null;
  return { ...rest, borders };
}

/** A line as CSS: `2px dashed #336699`, or `none`. */
export const lineCss = (line: CellBorder | null): string => (line === null ? "none" : `${line.width}px ${line.style} ${line.color}`);

const toPx = (token: string): number => {
  const m = /^(\d+(?:\.\d+)?)(px|pt)?$/.exec(token);
  return m ? (m[2] === "pt" ? Number(m[1]) * (96 / 72) : Number(m[1])) : Number.NaN;
};

/**
 * A line from CSS (`1px solid #000`, `thin dashed red`, `none`): solid, dashed or dotted, 1 to 8 px, a plain color. `none` is null.
 * Anything else (double lines, grooves, images) is not a line and gives undefined.
 */
export function parseLine(value: string | undefined): Line {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "" || text === "initial" || text === "inherit") return undefined;
  if (text === "none" || text === "hidden" || /^0(px|pt)?(\s|$)/.test(text)) return null;
  // Split on spaces that are not inside a color function.
  const tokens = text.split(/\s+(?![^(]*\))/);
  let width = 1;
  let style: CellBorder["style"] | undefined;
  let color = "currentcolor";
  for (const t of tokens) {
    if (t === "solid" || t === "dashed" || t === "dotted") style = t;
    else if (t === "thin") width = 1;
    else if (t === "medium") width = 3;
    else if (t === "thick") width = 5;
    else if (Number.isFinite(toPx(t))) width = Math.max(1, Math.min(8, Math.round(toPx(t))));
    else if (COLOR_VALUE.test(t)) color = t;
    else return undefined;
  }
  return style ? { style, width, color } : undefined;
}
