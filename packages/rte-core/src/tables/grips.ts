// Handles for the table the caret is in: one to drag the caret's row up or down, one to drag its column left or right, and, where the
// pointer is a finger, ones on the cell's right and bottom edge to set its width and height (the edges themselves are too thin to
// take hold of with a finger, and touching them would scroll the page). Each does its work through a table command, so it is one undo
// step, and each is a real element a pointer or a finger can take hold of. Like the image handle they are fixed to the window and kept
// out of the document.
import type { Engine } from "../engine.ts";
import { getBlock } from "../path.ts";
import { inRow, locateCell, toGrid } from "../tablegrid.ts";
import type { ViewHost } from "../plugin.ts";

const SIZE = 22;
const COLOR = "#17408b";

type Kind = "row" | "column" | "width" | "height";

export class TableGrips {
  private readonly grips = new Map<Kind, HTMLElement>();
  private guide: HTMLElement | undefined;
  private readonly stops: (() => void)[] = [];
  private cell: HTMLElement | undefined;
  private table: HTMLElement | undefined;
  private path: readonly number[] = [];
  private touch = false;

  private readonly root: HTMLElement;
  private readonly engine: Engine;

  constructor(private readonly host: ViewHost) {
    this.root = host.element as HTMLElement;
    this.engine = host.engine;
    const reposition = (): void => this.place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    this.stops.push(() => window.removeEventListener("scroll", reposition, true), () => window.removeEventListener("resize", reposition));
    // A finger on the editor, rather than a mouse, brings up the resize grips as well.
    const seen = (e: Event): void => {
      const touch = (e as PointerEvent).pointerType === "touch";
      if (touch !== this.touch) { this.touch = touch; this.update(); }
    };
    this.root.addEventListener("pointerdown", seen);
    this.stops.push(() => this.root.removeEventListener("pointerdown", seen));
  }

  private available(command: string): boolean {
    return !this.engine.readOnly && this.engine.commands.list().some((c) => c.name === command);
  }

  /** The drawn cell the caret is in, and its table, when the table is at the top level. Found from the page, so it costs nothing in a big table. */
  private find(): { cell: HTMLElement; table: HTMLElement; path: readonly number[] } | undefined {
    if (!this.engine.snapshot.focused) return undefined;
    const path = this.engine.selection.focus.path;
    const top = this.root.children[path[0] as number];
    if (!(top instanceof HTMLElement) || top.tagName !== "TABLE") return undefined;
    const at = this.host.domFromPos(this.engine.selection.focus) as { node: Node; offset: number } | null;
    const from = at ? (at.node instanceof Element ? at.node : at.node.parentElement) : null;
    const cell = from?.closest("td, th");
    return cell instanceof HTMLElement && cell.closest("table") === top ? { cell, table: top, path } : undefined;
  }

  update(): void {
    const found = this.find();
    if (!found) {
      this.hide();
      return;
    }
    this.cell = found.cell;
    this.table = found.table;
    this.path = found.path;
    const wanted: Kind[] = [];
    if (this.available("table.moveRow")) wanted.push("row");
    if (this.available("table.moveColumn")) wanted.push("column");
    if (this.touch && this.available("table.columnWidth")) wanted.push("width");
    if (this.touch && this.available("table.rowHeight")) wanted.push("height");
    for (const [kind, el] of this.grips) if (!wanted.includes(kind)) { el.remove(); this.grips.delete(kind); }
    for (const kind of wanted) if (!this.grips.has(kind)) this.grips.set(kind, this.make(kind));
    this.place();
  }

  private hide(): void {
    for (const el of this.grips.values()) el.remove();
    this.grips.clear();
    this.cell = this.table = undefined;
  }

  private make(kind: Kind): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-rk-grip", kind);
    el.setAttribute("role", "presentation");
    const cursor = kind === "row" ? "ns-resize" : kind === "column" ? "ew-resize" : kind === "width" ? "col-resize" : "row-resize";
    el.style.cssText = `position:fixed;z-index:2147483646;width:${SIZE}px;height:${SIZE}px;box-sizing:border-box;background:${COLOR};border:2px solid #fff;border-radius:${kind === "row" || kind === "column" ? "4px" : "50%"};cursor:${cursor};touch-action:none;opacity:0.9`;
    el.addEventListener("pointerdown", (e) => this.start(kind, e));
    document.body.appendChild(el);
    return el;
  }

  private place(): void {
    const cell = this.cell;
    const table = this.table;
    if (!cell || !table || !cell.isConnected) return;
    const c = cell.getBoundingClientRect();
    const t = table.getBoundingClientRect();
    const put = (kind: Kind, x: number, y: number): void => {
      const el = this.grips.get(kind);
      if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
    };
    put("row", t.left - SIZE - 2, c.top + c.height / 2 - SIZE / 2);
    put("column", c.left + c.width / 2 - SIZE / 2, t.top - SIZE - 2);
    put("width", c.right - SIZE / 2, c.top + c.height / 2 - SIZE / 2);
    put("height", c.left + c.width / 2 - SIZE / 2, c.bottom - SIZE / 2);
  }

  private start(kind: Kind, event: PointerEvent): void {
    const cell = this.cell;
    const table = this.table;
    if (!cell || !table || event.button !== 0) return;
    event.preventDefault();
    const path = this.path;
    const c = cell.getBoundingClientRect();
    const t = table.getBoundingClientRect();
    const horizontal = kind === "column" || kind === "width";
    const line = document.createElement("div");
    line.setAttribute("data-rk-resize-line", "");
    line.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;background:${COLOR};${horizontal ? `width:2px;top:${t.top}px;height:${t.height}px` : `height:2px;left:${t.left}px;width:${t.width}px`}`;
    document.body.appendChild(line);
    this.guide = line;
    const startX = event.clientX;
    const startY = event.clientY;
    let target: { to: number; after: boolean } | undefined;
    let size = horizontal ? c.width : c.height;

    // The rows, or the columns, as the pointer can land on them: each a range along the axis and the grid number it stands for.
    const block = getBlock(this.engine.document, locateCell(this.engine.document, path as number[])?.table ?? []);
    const grid = block?.type === "table" ? toGrid(block) : undefined;
    const rows = [...table.querySelectorAll(":scope > tbody > tr")] as HTMLElement[];
    const lanes: { from: number; to: number; index: number }[] = [];
    if (kind === "row") rows.forEach((tr, index) => { const r = tr.getBoundingClientRect(); lanes.push({ from: r.top, to: r.bottom, index }); });
    if (kind === "column" && grid) {
      for (const [i, p] of inRow(grid.cells, 0).entries()) {
        const cellEl = rows[0]?.children[i] as HTMLElement | undefined;
        if (!cellEl) continue;
        const r = cellEl.getBoundingClientRect();
        for (let k = 0; k < p.cell.colspan; k++) lanes.push({ from: r.left + (r.width * k) / p.cell.colspan, to: r.left + (r.width * (k + 1)) / p.cell.colspan, index: p.col + k });
      }
    }

    const move = (e: PointerEvent): void => {
      if (kind === "width") {
        size = Math.max(24, c.width + e.clientX - startX);
        line.style.left = `${c.left + size - 1}px`;
      } else if (kind === "height") {
        size = Math.max(16, c.height + e.clientY - startY);
        line.style.top = `${c.top + size - 1}px`;
      } else {
        const at = horizontal ? e.clientX : e.clientY;
        const lane = lanes.find((l) => at >= l.from && at < l.to) ?? (at < (lanes[0]?.from ?? 0) ? lanes[0] : lanes[lanes.length - 1]);
        if (!lane) return;
        const after = at >= (lane.from + lane.to) / 2;
        target = { to: lane.index, after };
        const edge = after ? lane.to : lane.from;
        if (horizontal) line.style.left = `${edge - 1}px`;
        else line.style.top = `${edge - 1}px`;
      }
    };
    const end = (cancel: boolean): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancelled);
      line.remove();
      this.guide = undefined;
      if (cancel) return;
      if (kind === "width" && Math.round(size) !== Math.round(c.width)) this.engine.commands.run("table.columnWidth", { width: `${Math.round(size)}px`, cell: path, edge: true });
      else if (kind === "height" && Math.round(size) !== Math.round(c.height)) this.engine.commands.run("table.rowHeight", { height: `${Math.round(size)}px`, cell: path });
      else if (kind === "row" && target) this.engine.commands.run("table.moveRow", { ...target, cell: path });
      else if (kind === "column" && target) this.engine.commands.run("table.moveColumn", { ...target, cell: path });
    };
    const up = (): void => end(false);
    const cancelled = (): void => end(true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancelled);
  }

  destroy(): void {
    for (const stop of this.stops) stop();
    this.hide();
    this.guide?.remove();
  }
}
