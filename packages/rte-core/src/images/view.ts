// What the view adds for images: a click selects the image, the selected image is marked so it can be styled, and a handle on its
// bottom right corner can be dragged to resize it. The resize goes through the `image.update` command (one undo step; nothing happens
// where the images plugin is not installed). Keyboard users set the size in the image properties dialog.
import type { Engine } from "../engine.ts";
import { imageSelection, selectedImage } from "../imageselect.ts";
import type { ViewExtension, ViewHost } from "../plugin.ts";

/** The attribute on the selected image, for styling. */
export const SELECTED_IMAGE = "data-rte-image-selected";
/** The smallest an image can be dragged to, in pixels. */
const MIN = 16;
/** The side of the square that takes a finger on the resize handle; the dot drawn in it is smaller. */
const HIT = 28;

export class ImageSelection {
  private marked: HTMLElement | undefined;
  private handle: HTMLElement | undefined;
  private drag: { startX: number; startWidth: number; width: number; guide: HTMLElement } | undefined;
  private readonly stops: (() => void)[] = [];

  private readonly root: HTMLElement;
  private readonly engine: Engine;
  private readonly quiet: () => void;

  constructor(private readonly host: ViewHost) {
    this.root = host.element as HTMLElement;
    this.engine = host.engine;
    this.quiet = () => host.quiet();
    const reposition = (): void => this.place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    this.stops.push(() => window.removeEventListener("scroll", reposition, true), () => window.removeEventListener("resize", reposition));
    // A press on an image selects it. The press is not cancelled, so that the image can still be dragged to another place.
    const select = (e: Event): void => {
      const target = e.target;
      if (!(target instanceof HTMLImageElement) || !this.root.contains(target) || this.engine.readOnly) return;
      const at = this.host.posFromDom(target.parentNode as Node, [...(target.parentNode as Node).childNodes].indexOf(target));
      if (at) this.engine.setSelection(imageSelection(at.path, at.offset));
    };
    this.root.addEventListener("mousedown", select);
    // The browser puts its own selection in once the press is over (a caret beside the image, in some), so it is made again.
    this.root.addEventListener("click", select);
    this.stops.push(() => this.root.removeEventListener("mousedown", select), () => this.root.removeEventListener("click", select));
  }

  /** The drawn element of the selected image, or undefined. */
  private find(): HTMLImageElement | undefined {
    const picked = selectedImage(this.engine.document, this.engine.selection);
    if (!picked) return undefined;
    // The place just after the image; the image is what comes right before it.
    const at = this.host.domFromPos({ path: picked.path, offset: picked.offset + 1 }) as { node: Node; offset: number } | null;
    const el = !at ? undefined : at.node.nodeType === Node.TEXT_NODE ? at.node.previousSibling : at.node.childNodes[at.offset - 1];
    return el instanceof HTMLImageElement ? el : undefined;
  }

  update(): void {
    // Nothing is selected for editing while the editor is read-only or disabled: no mark, no handle.
    const img = this.engine.readOnly ? undefined : this.find();
    if (img === this.marked) {
      this.place();
      return;
    }
    this.marked?.removeAttribute(SELECTED_IMAGE);
    this.marked = img;
    img?.setAttribute(SELECTED_IMAGE, "");
    this.quiet();
    this.place();
  }

  /** The handle sits on the image's bottom right corner (fixed to the window, so it follows the image through scrolling). */
  private place(): void {
    const img = this.marked;
    if (!img || !img.isConnected || !this.available()) {
      this.handle?.remove();
      this.handle = undefined;
      return;
    }
    if (!this.handle) {
      // A finger needs more than 12px to land on: the handle is a 28px square that cannot be selected or long-pressed (so the browser's own
      // menu does not open over it), with the visible dot in its middle; the whole square takes the drag, and touch-action stops the page panning.
      const handle = document.createElement("div");
      handle.setAttribute("data-rte-resize-handle", "");
      handle.style.cssText = `position:fixed;z-index:2147483646;width:${HIT}px;height:${HIT}px;display:flex;align-items:center;justify-content:center;cursor:nwse-resize;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent`;
      const dot = document.createElement("div");
      dot.style.cssText = "width:12px;height:12px;background:#17408b;border:2px solid #fff;border-radius:3px;box-sizing:border-box;pointer-events:none";
      handle.appendChild(dot);
      handle.addEventListener("contextmenu", (e) => e.preventDefault());
      handle.addEventListener("pointerdown", (e) => this.start(e));
      document.body.appendChild(handle);
      this.handle = handle;
    }
    const box = img.getBoundingClientRect();
    this.handle.style.left = `${box.right - HIT / 2 - 2}px`;
    this.handle.style.top = `${box.bottom - HIT / 2 - 2}px`;
  }

  private available(): boolean {
    return !this.engine.readOnly && this.engine.commands.list().some((c) => c.name === "image.update");
  }

  private start(event: PointerEvent): void {
    const img = this.marked;
    if (!img || event.button !== 0) return;
    event.preventDefault();
    // Keep every move of this finger coming to us, even when it strays off the handle.
    try { this.handle?.setPointerCapture(event.pointerId); } catch { /* a pointer that is already gone */ }
    const box = img.getBoundingClientRect();
    const guide = document.createElement("div");
    guide.setAttribute("data-rte-resize-line", "");
    guide.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;border:2px dashed #17408b;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;box-sizing:border-box`;
    document.body.appendChild(guide);
    this.drag = { startX: event.clientX, startWidth: box.width, width: box.width, guide };
    const move = (e: PointerEvent): void => {
      if (!this.drag) return;
      this.drag.width = Math.max(MIN, this.drag.startWidth + (e.clientX - this.drag.startX));
      const ratio = box.height / box.width;
      this.drag.guide.style.width = `${this.drag.width}px`;
      this.drag.guide.style.height = `${this.drag.width * ratio}px`;
      if (this.handle) {
        this.handle.style.left = `${box.left + this.drag.width - HIT / 2 - 2}px`;
        this.handle.style.top = `${box.top + this.drag.width * ratio - HIT / 2 - 2}px`;
      }
    };
    const end = (cancel: boolean): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancelled);
      const drag = this.drag;
      this.drag = undefined;
      drag?.guide.remove();
      if (drag && !cancel && Math.round(drag.width) !== Math.round(drag.startWidth)) this.engine.commands.run("image.update", { width: Math.round(drag.width) });
      this.place();
    };
    const up = (): void => end(false);
    const cancelled = (): void => end(true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancelled);
  }

  destroy(): void {
    for (const stop of this.stops) stop();
    this.handle?.remove();
    this.drag?.guide.remove();
    this.marked?.removeAttribute(SELECTED_IMAGE);
  }
}

/** Images in the page: a click selects one, and its corner can be dragged to resize it. Comes with the images plugin. */
export const imagesView: ViewExtension = (host) => {
  const selection = new ImageSelection(host);
  const stop = host.onChange(() => selection.update());
  return () => { stop(); selection.destroy(); };
};
