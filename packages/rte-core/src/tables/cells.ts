// What the view adds on top of drawing a table: the cells a selection covers are marked so they can be styled, and a column edge can
// be dragged to set the column's width. Both work from the model's grid, and neither changes the document except through a command.
import type { Engine } from "../engine.ts";
import { pathKey } from "../path.ts";
import { inRow, locateCell, selectedCells } from "../tablegrid.ts";
import type { ViewHost } from "../plugin.ts";

/** The attribute on a cell that a selection covers, for styling. */
export const SELECTED_CELL = "data-rte-cell-selected";

/** How close to a cell's right edge, in pixels, a pointer has to be to take hold of the edge. */
const GRAB = 5;
/** The narrowest a dragged column can be made, in pixels. */
const MIN_WIDTH = 24;
/** The shortest a dragged row can be made, in pixels. */
const MIN_HEIGHT = 16;

/**
 * Marks the cells of the rectangle a selection runs across (when it starts and ends in different cells of one table). The marks are
 * attributes on the drawn cells, not part of the model, and they are put on again after every change.
 */
export class CellMarks {
  private marked: HTMLElement[] = [];

  private readonly root: HTMLElement;
  private readonly engine: Engine;

  constructor(private readonly host: ViewHost) {
    this.root = host.element as HTMLElement;
    this.engine = host.engine;
  }

  private quiet(): void { this.host.quiet(); }

  update(): void {
    // A caret, or a selection inside one container, covers no cells to mark.
    const sel = this.engine.selection;
    const found = pathKey(sel.anchor.path) === pathKey(sel.focus.path) ? undefined : selectedCells(this.engine.document, sel);
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

/** Where a pointer is on the bottom edge of a cell's row (not at a column edge): the cell, or nothing. */
function rowEdgeAt(root: HTMLElement, event: PointerEvent | MouseEvent): HTMLElement | null {
  const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("td, th") : null;
  const row = cell?.parentElement;
  if (!cell || !row || !root.contains(cell) || edgeAt(root, event)) return null;
  const box = row.getBoundingClientRect();
  return event.clientY >= box.bottom - GRAB && event.clientY <= box.bottom + GRAB ? cell : null;
}

/**
 * Dragging a column edge: a line follows the pointer, and letting go sets the width through the `table.columnWidth` command, so it is
 * one undo step and does nothing where the tables plugin is not installed. Double-clicking an edge puts the column back to automatic.
 * The bottom edge of a row works the same way through `table.rowHeight`.
 * Returns what takes it away again.
 */
export function installColumnResize(host: ViewHost): void {
  const root = host.element as HTMLElement;
  const engine = host.engine;
  const quiet = (): void => host.quiet();
  const listen = (target: EventTarget, type: string, handler: (event: Event) => void): void => host.listen(target, type, handler);
  const available = (): boolean => !engine.readOnly && engine.commands.list().some((c) => c.name === "table.columnWidth");
  const cellPath = (cell: HTMLElement) => {
    const inside = cell.querySelector<HTMLElement>("[data-rte]");
    return inside ? host.posFromDom(inside, 0)?.path : undefined;
  };
  const rowAvailable = (): boolean => !engine.readOnly && engine.commands.list().some((c) => c.name === "table.rowHeight");
  let rowDrag: { path: readonly number[]; startY: number; startHeight: number; top: number; line: HTMLElement; height: number } | undefined;
  let drag: { cell: HTMLElement; path: readonly number[]; startX: number; startWidth: number; line: HTMLElement; width: number } | undefined;

  listen(root, "pointermove", (e) => {
    if (drag || rowDrag) return;
    const near = available() && edgeAt(root, e as PointerEvent) !== null;
    const nearRow = !near && rowAvailable() && rowEdgeAt(root, e as PointerEvent) !== null;
    const want = near ? "col-resize" : nearRow ? "row-resize" : "";
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
    if (!cell || !path) {
      const rowCell = rowAvailable() ? rowEdgeAt(root, event) : null;
      const rowPath = rowCell && cellPath(rowCell);
      const row = rowCell?.parentElement;
      if (!rowCell || !rowPath || !row) return;
      event.preventDefault();
      const rowBox = row.getBoundingClientRect();
      const rowTable = rowCell.closest("table")?.getBoundingClientRect() ?? rowBox;
      const rowLine = document.createElement("div");
      rowLine.setAttribute("data-rte-resize-line", "");
      rowLine.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;height:2px;background:#17408b;top:${rowBox.bottom - 1}px;left:${rowTable.left}px;width:${rowTable.width}px`;
      document.body.appendChild(rowLine);
      rowDrag = { path: rowPath, startY: event.clientY, startHeight: rowBox.height, top: rowBox.top, line: rowLine, height: rowBox.height };
      return;
    }
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const table = cell.closest("table")?.getBoundingClientRect() ?? box;
    const line = document.createElement("div");
    line.setAttribute("data-rte-resize-line", "");
    line.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;width:2px;background:#17408b;left:${box.right - 1}px;top:${table.top}px;height:${table.height}px`;
    document.body.appendChild(line);
    drag = { cell, path, startX: event.clientX, startWidth: box.width, line, width: box.width };
  });
  const move = (e: Event): void => {
    if (rowDrag) {
      rowDrag.height = Math.max(MIN_HEIGHT, rowDrag.startHeight + (e as PointerEvent).clientY - rowDrag.startY);
      rowDrag.line.style.top = `${rowDrag.top + rowDrag.height - 1}px`;
      return;
    }
    if (!drag) return;
    drag.width = Math.max(MIN_WIDTH, drag.startWidth + (e as PointerEvent).clientX - drag.startX);
    drag.line.style.left = `${drag.cell.getBoundingClientRect().left + drag.width - 1}px`;
  };
  const finish = (cancel: boolean): void => {
    if (rowDrag) {
      const { line, path, height, startHeight } = rowDrag;
      line.remove();
      rowDrag = undefined;
      if (!cancel && Math.round(height) !== Math.round(startHeight)) engine.commands.run("table.rowHeight", { height: `${Math.round(height)}px`, cell: path });
      return;
    }
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
    const rowCell = rowAvailable() ? rowEdgeAt(root, e as MouseEvent) : null;
    const rowPath = rowCell && cellPath(rowCell);
    if (rowPath && locateCell(engine.document, rowPath as number[])) {
      e.preventDefault();
      engine.commands.run("table.rowHeight", { height: "", cell: rowPath });
      return;
    }
    const cell = available() ? edgeAt(root, e as MouseEvent) : null;
    const path = cell && cellPath(cell);
    if (path && locateCell(engine.document, path as number[])) {
      e.preventDefault();
      engine.commands.run("table.columnWidth", { width: "", cell: path, edge: true });
    }
  });
}
