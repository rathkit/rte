// A button that shows and hides something next to it (a menu, a popover): the ARIA that ties them together, dismissal by Escape,
// by clicking elsewhere and by moving focus away, and focus back on the button when it closes by keyboard.
import type { Unsubscribe } from "./types.ts";

export interface DisclosureOptions {
  readonly trigger: HTMLElement;
  readonly popup: HTMLElement;
  /** What the trigger opens, for `aria-haspopup`. Default `true` (a generic popup). */
  readonly kind?: "menu" | "dialog" | "listbox" | "true";
  readonly onToggle?: (open: boolean) => void;
}

export interface Disclosure {
  readonly isOpen: boolean;
  open(): void;
  /** Closes it. By default the focus goes back to the trigger; pass false when the person has already moved on (a click elsewhere). */
  close(returnFocus?: boolean): void;
  toggle(): void;
  destroy: Unsubscribe;
}

let counter = 0;
export const uniqueId = (prefix: string): string => `${prefix}-${++counter}`;

export function createDisclosure(options: DisclosureOptions): Disclosure {
  const { trigger, popup } = options;
  if (!popup.id) popup.id = uniqueId("rte-popup");
  trigger.setAttribute("aria-haspopup", options.kind ?? "true");
  trigger.setAttribute("aria-controls", popup.id);
  let isOpen = false;

  const apply = (open: boolean): void => {
    isOpen = open;
    trigger.setAttribute("aria-expanded", String(open));
    // Styling hooks, so whoever draws the popup can animate it (and respect reduced motion). The machine itself never animates.
    trigger.setAttribute("data-state", open ? "open" : "closed");
    popup.setAttribute("data-state", open ? "open" : "closed");
    popup.hidden = !open;
    options.onToggle?.(open);
  };
  apply(false);

  const close = (returnFocus = true): void => {
    if (!isOpen) return;
    apply(false);
    if (returnFocus) trigger.focus();
  };
  const open = (): void => {
    if (!isOpen) apply(true);
  };

  const onPointerDown = (e: Event): void => {
    const target = e.target as Node | null;
    if (isOpen && target && !popup.contains(target) && !trigger.contains(target)) close(false);
  };
  const onFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    // Focus leaving for somewhere outside both closes it. (Focus going nowhere, as when a click lands on plain text, is the pointer's business.)
    if (isOpen && next && !popup.contains(next) && !trigger.contains(next)) close(false);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (isOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };
  const onClick = (): void => (isOpen ? close(true) : open());

  document.addEventListener("pointerdown", onPointerDown, true);
  popup.addEventListener("focusout", onFocusOut);
  trigger.addEventListener("keydown", onKeyDown);
  popup.addEventListener("keydown", onKeyDown);
  trigger.addEventListener("click", onClick);
  return {
    get isOpen() { return isOpen; },
    open, close, toggle: () => (isOpen ? close(true) : open()),
    destroy() {
      document.removeEventListener("pointerdown", onPointerDown, true);
      popup.removeEventListener("focusout", onFocusOut);
      trigger.removeEventListener("keydown", onKeyDown);
      popup.removeEventListener("keydown", onKeyDown);
      trigger.removeEventListener("click", onClick);
    },
  };
}
