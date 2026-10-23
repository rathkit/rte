// What the view adds on top of drawing a table: the cells a selection covers are marked so they can be styled, and a column edge can
// be dragged to set the column's width. Both work from the model's grid, and neither changes the document except through a command.
import type { Engine } from "../engine.ts";
import { inRow, locateCell, selectedCells } from "../tablegrid.ts";
import { posFromDom } from "./render.ts";

/** The attribute on a cell that a selection covers, for styling. */
export const SELECTED_CELL = "data-rk-cell-selected";

/** How close to a cell's right edge, in pixels, a pointer has to be to take hold of the edge. */
const GRAB = 5;
/** The narrowest a dragged column can be made, in pixels. */
const MIN_WIDTH = 24;

/**
 * Marks the cells of the rectangle a selection runs across (when it starts and ends in different cells of one table). The marks are
 * attributes on the drawn cells, not part of the model, and they are put on again after every change.
 */
export class CellMarks {
  private marked: HTMLElement[] = [];

  constructor(private readonly root: HTMLElement, private readonly engine: Engine, private readonly quiet: () => void) {}

  update(): void {
    const found = selectedCells(this.engine.document, this.engine.selection);
    const next: HTMLElement[] = [];
    // A table at the top level is the one case drawn with a plain row-and-cell structure to look cells up in.
    if (found && found.count > 1 && found.where.table.length === 1) {
      const table = this.root.children[found.where.table[0] as number];
      const rows = table?.querySelectorAll(":scope > tbody > tr");
      for (const p of found.grid.cells) {
        const e = { top: p.row, left: p.col, bottom: p.row + p.cell.rowspan - 1, right: p.col + p.cell.colspan - 1 };
        if (e.top > found.rect.bottom || e.bottom < found.rect.top || e.left > found.rect.right || e.right < found.rect.left) continue;
        const cell = rows?.[p.row]?.children[inRow(found.grid.cells, p.row).indexOf(p)];
        if (cell instanceof HTMLElement) next.push(cell);
      }
    }
    if (next.length === this.marked.length && next.every((el, i) => el === this.marked[i])) return;
    for (const el of this.marked) el.removeAttribute(SELECTED_CELL);
    for (const el of next) el.setAttribute(SELECTED_CELL, "");
    this.marked = next;
    // These attributes are the view's own doing, not a disturbance from outside.
    this.quiet();
  }
}

/** Where a pointer is on a cell's right edge: the cell, or nothing. */
function edgeAt(root: HTMLElement, event: PointerEvent | MouseEvent): HTMLElement | null {
  const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("td, th") : null;
  if (!cell || !root.contains(cell)) return null;
  const box = cell.getBoundingClientRect();
  return event.clientX >= box.right - GRAB && event.clientX <= box.right + GRAB ? cell : null;
}

/**
 * Dragging a column edge: a line follows the pointer, and letting go sets the width through the `table.columnWidth` command, so it is
 * one undo step and does nothing where the tables plugin is not installed. Double-clicking an edge puts the column back to automatic.
 * Returns what takes it away again.
 */
export function installColumnResize(root: HTMLElement, engine: Engine, listen: (target: EventTarget, type: string, handler: (event: Event) => void) => void, quiet: () => void): void {
  const available = (): boolean => !engine.readOnly && engine.commands.list().some((c) => c.name === "table.columnWidth");
  const cellPath = (cell: HTMLElement) => {
    const inside = cell.querySelector<HTMLElement>("[data-rte]");
    return inside ? posFromDom(root, inside, 0)?.path : undefined;
  };
  let drag: { cell: HTMLElement; path: readonly number[]; startX: number; startWidth: number; line: HTMLElement; width: number } | undefined;

  listen(root, "pointermove", (e) => {
    if (drag) return;
    const near = available() && edgeAt(root, e as PointerEvent) !== null;
    const want = near ? "col-resize" : "";
    if (root.style.cursor !== want) {
      root.style.cursor = want;
      quiet();
    }
  });
  listen(root, "pointerdown", (e) => {
    const event = e as PointerEvent;
    if (event.button !== 0 || !available()) return;
    const cell = edgeAt(root, event);
    const path = cell && cellPath(cell);
    if (!cell || !path) return;
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const table = cell.closest("table")?.getBoundingClientRect() ?? box;
    const line = document.createElement("div");
    line.setAttribute("data-rk-resize-line", "");
    line.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;width:2px;background:#17408b;left:${box.right - 1}px;top:${table.top}px;height:${table.height}px`;
    document.body.appendChild(line);
    drag = { cell, path, startX: event.clientX, startWidth: box.width, line, width: box.width };
  });
  const move = (e: Event): void => {
    if (!drag) return;
    drag.width = Math.max(MIN_WIDTH, drag.startWidth + (e as PointerEvent).clientX - drag.startX);
    drag.line.style.left = `${drag.cell.getBoundingClientRect().left + drag.width - 1}px`;
  };
  const finish = (cancel: boolean): void => {
    if (!drag) return;
    const { line, path, width, startWidth } = drag;
    line.remove();
    drag = undefined;
    if (!cancel && Math.round(width) !== Math.round(startWidth)) engine.commands.run("table.columnWidth", { width: `${Math.round(width)}px`, cell: path, edge: true });
  };
  listen(document, "pointermove", move);
  listen(document, "pointerup", () => finish(false));
  listen(document, "pointercancel", () => finish(true));
  listen(document, "keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") finish(true); });
  listen(root, "dblclick", (e) => {
    const cell = available() ? edgeAt(root, e as MouseEvent) : null;
    const path = cell && cellPath(cell);
    if (path && locateCell(engine.document, path as number[])) {
      e.preventDefault();
      engine.commands.run("table.columnWidth", { width: "", cell: path, edge: true });
    }
  });
}
