// A polite live region for saying what happened when nothing visible moves: "Bold on", "Link added". One per editor.
import type { Unsubscribe } from "./types.ts";

export interface Announcer {
  /** Says a message to assistive technology. The same message twice in a row is said twice. */
  announce(message: string): void;
  /** The element, so a host can place it. It is visually hidden, but not removed from the accessibility tree. */
  readonly element: HTMLElement;
  destroy: Unsubscribe;
}

export function createAnnouncer(parent: HTMLElement = document.body): Announcer {
  const element = document.createElement("div");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  // Visually hidden, in the one way that keeps it announced. (Hiding it with display:none or hidden would silence it.)
  element.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";
  parent.appendChild(element);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    element,
    announce(message) {
      // Clearing first makes a repeated message a change, so it is announced again.
      element.textContent = "";
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { element.textContent = message; }, 50);
    },
    destroy() {
      if (timer) clearTimeout(timer);
      element.remove();
    },
  };
}
