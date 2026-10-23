// A tooltip: the short name of a control (and its key) shown near it on hover and keyboard focus. It follows the rules for content that
// appears on hover or focus: it can be dismissed with Escape without moving the pointer or the focus, the pointer can move onto it
// without it vanishing, and it stays until the pointer or focus leaves or it is dismissed. The words are on the control already (its
// accessible name), so the tooltip is a visual aid and is not announced a second time.
//
// Mark each control with `data-rk-tip="text"`. The caller owns the popup element and decides where it goes (`onShow`).
import { uniqueId } from "./disclosure.ts";
import type { Unsubscribe } from "./types.ts";

export interface TooltipOptions {
  /** Events are listened for here, so controls added later work without more setup. */
  readonly container: HTMLElement;
  /** The tooltip's element. It is hidden and shown, and its text is set; the caller puts it in the page. */
  readonly popup: HTMLElement;
  /** Milliseconds the pointer must rest on a control before the tip shows. Default 500. Keyboard focus shows it at once. */
  readonly delay?: number;
  /** Milliseconds the tip stays when the pointer leaves, so it can be moved onto the tip. Default 150. */
  readonly grace?: number;
  /** Called with the control and the shown popup, to position it. */
  readonly onShow?: (target: HTMLElement, popup: HTMLElement) => void;
}

export interface Tooltip {
  /** The control whose tip is showing. */
  readonly shown: HTMLElement | undefined;
  hide(): void;
  destroy: Unsubscribe;
}

const TIP = "[data-rk-tip]";

export function createTooltip(options: TooltipOptions): Tooltip {
  const { container, popup } = options;
  const delay = options.delay ?? 500;
  const grace = options.grace ?? 150;
  if (!popup.id) popup.id = uniqueId("rk-tooltip");
  popup.setAttribute("role", "tooltip");
  popup.hidden = true;
  let shown: HTMLElement | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const clear = (): void => {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    showTimer = hideTimer = undefined;
  };
  const hide = (): void => {
    clear();
    shown = undefined;
    popup.hidden = true;
  };
  const show = (target: HTMLElement): void => {
    clear();
    const text = target.getAttribute("data-rk-tip");
    if (!text) return;
    shown = target;
    popup.textContent = text;
    popup.hidden = false;
    options.onShow?.(target, popup);
  };
  const tipOf = (node: EventTarget | null): HTMLElement | null => (node instanceof Element ? node.closest<HTMLElement>(TIP) : null);
  const later = (): void => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, grace);
  };

  const onOver = (e: MouseEvent): void => {
    const target = tipOf(e.target);
    if (!target || target === shown) { if (target && hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; } return; }
    clear();
    showTimer = setTimeout(() => show(target), shown ? 0 : delay);
  };
  const onOut = (e: MouseEvent): void => {
    const from = tipOf(e.target);
    if (!from) return;
    const to = e.relatedTarget as Node | null;
    if (to && (from.contains(to) || popup.contains(to))) return;
    if (showTimer) { clearTimeout(showTimer); showTimer = undefined; }
    if (shown) later();
  };
  const onFocusIn = (e: FocusEvent): void => {
    const target = tipOf(e.target);
    if (!target) return;
    // Only for the keyboard: a click that focuses a button should not leave a tip hanging over it.
    let visible = true;
    try { visible = target.matches(":focus-visible"); } catch { /* an old engine: show it */ }
    if (visible) show(target);
  };
  const onFocusOut = (e: FocusEvent): void => {
    if (tipOf(e.target) && (e.relatedTarget as Node | null) !== popup) hide();
  };
  const onPress = (): void => hide();
  // Escape is taken here, before it reaches anything else, only while a tip is showing: the first press puts the tip away.
  const onKey = (e: KeyboardEvent): void => {
    if (shown && e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      hide();
    }
  };
  const onPopupEnter = (): void => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; } };
  const onPopupLeave = (e: MouseEvent): void => { if (!(e.relatedTarget instanceof Node && shown?.contains(e.relatedTarget))) later(); };

  container.addEventListener("mouseover", onOver);
  container.addEventListener("mouseout", onOut);
  container.addEventListener("focusin", onFocusIn);
  container.addEventListener("focusout", onFocusOut);
  container.addEventListener("pointerdown", onPress);
  // On the whole page, because the tip can be showing for the pointer while the focus is elsewhere.
  const page = container.ownerDocument;
  page.addEventListener("keydown", onKey, true);
  popup.addEventListener("mouseenter", onPopupEnter);
  popup.addEventListener("mouseleave", onPopupLeave);
  return {
    get shown() { return shown; },
    hide,
    destroy() {
      clear();
      popup.hidden = true;
      container.removeEventListener("mouseover", onOver);
      container.removeEventListener("mouseout", onOut);
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("pointerdown", onPress);
      page.removeEventListener("keydown", onKey, true);
      popup.removeEventListener("mouseenter", onPopupEnter);
      popup.removeEventListener("mouseleave", onPopupLeave);
    },
  };
}
