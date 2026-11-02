// Two small surfaces that come up where the person is working, both made from interface items on the headless layer:
//   - the selection toolbar: a short row of formatting controls that appears over selected text (slot `toolbar.floating`);
//   - the context menu: a list of commands at the pointer when the right button is pressed (slot `menu.context`).
// Both are off unless asked for. When a slot has no items of its own, it gets a default set copied from the main toolbar, so the labels,
// icons and dialogs are the ones the person already knows.
import type { UiItem } from "@rathkit/rte-core";
import { createMenu, createToolbar, type Menu, type Toolbar } from "@rathkit/rte-headless";
import { setIcon } from "./icon.ts";
import type { UiEditor } from "./types.ts";

export const FLOATING_SLOT = "toolbar.floating";
export const CONTEXT_SLOT = "menu.context";

type Dialog = Extract<UiItem, { kind: "dialog" }>;

export interface FloatingOptions {
  readonly editor: UiEditor;
  readonly root: HTMLElement;
  readonly selectionToolbar: boolean;
  readonly contextMenu: boolean;
  readonly part: <E extends HTMLElement>(el: E, name: string) => E;
  readonly message: (key: string, fallback?: string) => string;
  readonly icon: (name: string | undefined) => string | (() => Node) | undefined;
  readonly openDialog: (item: Dialog, opener: HTMLElement) => void;
}

export interface Floating {
  /** Words or icons may have changed: draw again. */
  refresh(): void;
  destroy(): void;
}

/** The main toolbar's items with these ids, as items of another slot, in this order, with a group of the caller's choosing. */
function copyItems(editor: UiEditor, ids: readonly (readonly [string, string])[]): UiItem[] {
  const main = editor.ui.items("toolbar.main");
  const out: UiItem[] = [];
  ids.forEach(([id, group], index) => {
    const found = main.find((i) => i.id === id);
    if (found && found.kind !== "menu" && found.kind !== "separator" && found.kind !== "select" && found.kind !== "panel") out.push({ ...found, group, order: index });
  });
  return out;
}

const SELECTION_DEFAULTS = [["bold", "text"], ["italic", "text"], ["underline", "text"], ["strike", "text"], ["code", "text"], ["link", "link"], ["unlink", "link"], ["clear-format", "clear"]] as const;
const CONTEXT_DEFAULTS = [["undo", "history"], ["redo", "history"], ["bold", "text"], ["italic", "text"], ["underline", "text"], ["strike", "text"], ["code", "text"], ["link", "link"], ["unlink", "link"], ["clear-format", "clear"]] as const;

let counter = 0;

export function createFloating(options: FloatingOptions): Floating {
  const { editor, root, part, message } = options;
  const stops: (() => void)[] = [];
  const redraws: (() => void)[] = [];

  /** Fills a slot with defaults when nothing else has: the caller's own items are never mixed with ours. */
  const seed = (slot: string, ids: readonly (readonly [string, string])[]): void => {
    if (editor.ui.items(slot).length > 0) return;
    const removers = copyItems(editor, ids).map((item) => editor.ui.add(slot, item));
    stops.push(() => removers.forEach((remove) => remove()));
  };

  const iconInto = (el: HTMLElement, name: string | undefined): boolean => {
    const holder = part(document.createElement("span"), "icon");
    holder.setAttribute("aria-hidden", "true");
    if (!setIcon(holder, options.icon(name))) return false;
    el.appendChild(holder);
    return true;
  };

  // ---- the selection toolbar ---------------------------------------------------------------------------------
  if (options.selectionToolbar) {
    seed(FLOATING_SLOT, SELECTION_DEFAULTS);
    const toolbar = createToolbar(editor, { slot: FLOATING_SLOT, label: message("floating.label") });
    const bar = part(document.createElement("div"), "floating");
    bar.hidden = true;
    root.appendChild(bar);

    const draw = (): void => {
      const controls: HTMLElement[] = [];
      let group: string | undefined;
      for (const item of toolbar.items) {
        if (item.kind !== "button" && item.kind !== "toggle" && item.kind !== "dialog") continue;
        const next = item.group ?? "";
        if (group !== undefined && next !== group) controls.push(part(document.createElement("span"), "separator"));
        group = next;
        const button = part(document.createElement("button"), "button");
        button.type = "button";
        button.setAttribute("data-rk-item", item.id);
        const state = toolbar.state(item.id);
        const label = message(`item.${item.id}`, state?.label ?? item.id);
        button.setAttribute("aria-label", label);
        button.setAttribute("data-rk-tip", state?.shortcutLabel ? `${label} (${state.shortcutLabel})` : label);
        if (!iconInto(button, state?.icon)) {
          const words = part(document.createElement("span"), "label");
          words.textContent = label;
          button.appendChild(words);
        }
        controls.push(button);
      }
      bar.replaceChildren(...controls);
      unbind?.();
      unbind = toolbar.bind(bar, { onOpen: (item, opener) => { if (item.kind === "dialog") options.openDialog(item, opener); } });
    };
    let unbind: (() => void) | undefined;
    draw();
    const stopItems = toolbar.subscribe(() => {
      // A change in which controls exist needs drawing again; a change in state is the toolbar's own business.
      const drawn = [...bar.querySelectorAll("[data-rk-item]")].map((el) => el.getAttribute("data-rk-item")).join("\u0000");
      if (drawn !== toolbar.items.filter((i) => i.kind === "button" || i.kind === "toggle" || i.kind === "dialog").map((i) => i.id).join("\u0000")) draw();
    });

    // When to show it: text is selected, the person is in the editor (or in the bar), and is not in the middle of dragging or touching.
    let pointerDown = false;
    let touched = false;
    // Escape hides the bar for the selection it was pressed on; a different selection brings it back.
    let dismissedFor = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const focused = (): boolean => {
      const active = (root.getRootNode() as Document | ShadowRoot).activeElement;
      return !!active && (editor.element.contains(active) || bar.contains(active));
    };
    const selectionKey = (): string => {
      const { anchor, focus } = editor.snapshot.selection;
      return `${anchor.path.join()}:${anchor.offset}-${focus.path.join()}:${focus.offset}`;
    };
    const hasSelection = (): boolean => {
      const s = editor.snapshot.selection;
      return s.anchor.offset !== s.focus.offset || s.anchor.path.join() !== s.focus.path.join();
    };
    const place = (): void => {
      const selection = root.ownerDocument.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { bar.hidden = true; return; }
      const box = root.getBoundingClientRect();
      const left0 = box.left + root.clientLeft;
      const top0 = box.top + root.clientTop;
      bar.hidden = false;
      const above = rect.top - top0 - bar.offsetHeight - 8;
      // Over the selection; under it when there is no room above.
      const top = above >= 0 ? above : rect.bottom - top0 + 8;
      const left = Math.max(0, Math.min(rect.left + rect.width / 2 - left0 - bar.offsetWidth / 2, root.clientWidth - bar.offsetWidth));
      bar.style.top = `${Math.round(top)}px`;
      bar.style.left = `${Math.round(left)}px`;
    };
    const update = (): void => {
      timer = undefined;
      const show = hasSelection() && !pointerDown && !touched && dismissedFor !== selectionKey() && focused();
      if (show) place();
      else if (!bar.contains((root.getRootNode() as Document | ShadowRoot).activeElement)) bar.hidden = true;
    };
    const schedule = (): void => { timer ??= setTimeout(update, 80); };
    stops.push(editor.subscribe(schedule));

    const on = <T extends Event>(target: EventTarget, type: string, handler: (e: T) => void, capture = false): void => {
      target.addEventListener(type, handler as EventListener, capture);
      stops.push(() => target.removeEventListener(type, handler as EventListener, capture));
    };
    on<PointerEvent>(editor.element, "pointerdown", (e) => { pointerDown = true; touched = e.pointerType === "touch"; if (!bar.hidden && !bar.contains(e.target as Node)) bar.hidden = true; });
    on<Event>(root.ownerDocument, "pointerup", () => { if (pointerDown) { pointerDown = false; schedule(); } }, true);
    on<Event>(root.ownerDocument, "pointercancel", () => { pointerDown = false; }, true);
    on<FocusEvent>(editor.element, "focusout", (e) => { if (!bar.contains(e.relatedTarget as Node | null)) schedule(); });
    on<FocusEvent>(bar, "focusout", (e) => { if (!editor.element.contains(e.relatedTarget as Node | null) && !bar.contains(e.relatedTarget as Node | null)) schedule(); });
    on<Event>(root.ownerDocument.defaultView ?? window, "scroll", () => { if (!bar.hidden) place(); }, true);
    on<Event>(root.ownerDocument.defaultView ?? window, "resize", () => { if (!bar.hidden) place(); });
    // Alt+F10 moves the focus into the bar; Escape in the bar puts it back and hides the bar until the selection changes.
    on<KeyboardEvent>(editor.element, "keydown", (e) => {
      touched = false;
      if (e.key === "F10" && e.altKey && !bar.hidden) {
        e.preventDefault();
        bar.querySelector<HTMLElement>("[data-rk-item][tabindex='0']")?.focus();
      }
    });
    on<KeyboardEvent>(bar, "keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); dismissedFor = selectionKey(); bar.hidden = true; editor.focus(); } });
    redraws.push(draw);
    stops.push(() => { stopItems(); unbind?.(); toolbar.destroy(); if (timer) clearTimeout(timer); bar.remove(); });
  }

  // ---- the context menu --------------------------------------------------------------------------------------
  if (options.contextMenu) {
    seed(CONTEXT_SLOT, CONTEXT_DEFAULTS);
    const toolbar: Toolbar = createToolbar(editor, { slot: CONTEXT_SLOT });
    const popup = part(document.createElement("div"), "menu");
    popup.setAttribute("data-rk-context", "");
    // The menu is opened by a button, as far as the headless menu knows. This one is never seen; the focus it is asked to take goes to the editor.
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.hidden = true;
    anchor.setAttribute("aria-label", message("context.label"));
    anchor.id = `rk-context-anchor-${++counter}`;
    anchor.focus = () => editor.focus();
    root.append(anchor, popup);
    const entries = new Map<string, UiItem>();
    let menu: Menu | undefined;
    let at = { x: 0, y: 0 };

    const draw = (): void => {
      menu?.destroy();
      entries.clear();
      const children: HTMLElement[] = [];
      let group: string | undefined;
      for (const item of toolbar.items) {
        if (item.kind !== "button" && item.kind !== "toggle" && item.kind !== "dialog") continue;
        const next = item.group ?? "";
        if (group !== undefined && next !== group) {
          const rule = part(document.createElement("div"), "menu-separator");
          rule.setAttribute("role", "separator");
          children.push(rule);
        }
        group = next;
        entries.set(item.id, item);
        const entry = part(document.createElement("button"), "menu-item");
        entry.type = "button";
        entry.setAttribute("data-rk-menuitem", "");
        entry.setAttribute("data-rk-menu-item", item.id);
        if (item.kind === "toggle") entry.setAttribute("role", "menuitemcheckbox");
        entry.append(part(document.createElement("span"), "label"), part(document.createElement("span"), "menu-keys"));
        children.push(entry);
      }
      popup.replaceChildren(...children);
      menu = createMenu({
        trigger: anchor, menu: popup,
        onOpen: () => {
          // At the pointer, moved back in when it would run off the screen.
          popup.style.position = "fixed";
          popup.style.insetBlockStart = popup.style.insetInlineStart = "auto";
          const w = popup.offsetWidth;
          const h = popup.offsetHeight;
          const view = root.ownerDocument.documentElement;
          popup.style.left = `${Math.max(4, Math.min(at.x, view.clientWidth - w - 4))}px`;
          popup.style.top = `${Math.max(4, Math.min(at.y, view.clientHeight - h - 4))}px`;
        },
        onSelect: (entry) => {
          const id = entry.getAttribute("data-rk-menu-item") ?? "";
          const item = entries.get(id);
          if (item?.kind === "dialog") { options.openDialog(item, editor.element); return; }
          toolbar.activate(id);
          editor.focus();
        },
      });
      words();
    };
    const words = (): void => {
      anchor.setAttribute("aria-label", message("context.label"));
      for (const entry of popup.querySelectorAll<HTMLElement>("[data-rk-menu-item]")) {
        const id = entry.getAttribute("data-rk-menu-item") ?? "";
        const item = entries.get(id);
        const state = toolbar.state(id);
        if (!item || !state) continue;
        const label = message(`item.${id}`, state.label);
        const name = entry.querySelector<HTMLElement>('[data-rk-part="label"]');
        if (name) name.textContent = label;
        const keys = entry.querySelector<HTMLElement>('[data-rk-part="menu-keys"]');
        if (keys) keys.textContent = state.shortcutLabel ?? "";
        entry.setAttribute("aria-disabled", String(state.disabled));
        if (item.kind === "toggle") entry.setAttribute("aria-checked", String(state.pressed === true));
      }
    };
    draw();
    const stopState = toolbar.subscribe(() => {
      const drawn = [...popup.querySelectorAll("[data-rk-menu-item]")].map((el) => el.getAttribute("data-rk-menu-item")).join("\u0000");
      if (drawn !== toolbar.items.filter((i) => i.kind === "button" || i.kind === "toggle" || i.kind === "dialog").map((i) => i.id).join("\u0000")) draw();
      else words();
    });

    const onContextMenu = (e: MouseEvent): void => {
      // Left to the browser: the touch long-press (it brings the selection handles), and Shift with the right button, the way out to the
      // browser's own menu (its spelling suggestions, say).
      if (e.shiftKey || (e as PointerEvent).pointerType === "touch") return;
      if (toolbar.items.length === 0) return;
      e.preventDefault();
      // From the keyboard there is no pointer: the menu goes where the selection is.
      let x = e.clientX;
      let y = e.clientY;
      if (x === 0 && y === 0) {
        const selection = root.ownerDocument.getSelection();
        const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : editor.element.getBoundingClientRect();
        x = rect.left;
        y = rect.bottom;
      }
      at = { x, y };
      words();
      menu?.close(false);
      menu?.open();
    };
    editor.element.addEventListener("contextmenu", onContextMenu);
    redraws.push(draw);
    stops.push(() => { editor.element.removeEventListener("contextmenu", onContextMenu); stopState(); menu?.destroy(); toolbar.destroy(); anchor.remove(); popup.remove(); });
  }

  return {
    refresh: () => { for (const redraw of redraws) redraw(); },
    destroy: () => { for (const stop of stops.splice(0).reverse()) stop(); },
  };
}
