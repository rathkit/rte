// A menu button: a disclosure whose popup is a list of commands you move through with the arrow keys, jump through by typing, and
// choose from with Enter or Space. Mark each choice in the popup with `data-rk-menuitem`.
import { createDisclosure, uniqueId, type Disclosure } from "./disclosure.ts";
import type { Unsubscribe } from "./types.ts";

export interface MenuOptions {
  readonly trigger: HTMLElement;
  readonly menu: HTMLElement;
  /** Called with the item that was chosen. The menu closes and the focus returns to the trigger afterwards. */
  readonly onSelect: (item: HTMLElement) => void;
}

export interface Menu extends Pick<Disclosure, "isOpen" | "open" | "close" | "toggle"> {
  destroy: Unsubscribe;
}

export function createMenu(options: MenuOptions): Menu {
  const { trigger, menu } = options;
  if (!trigger.id) trigger.id = uniqueId("rk-menu-button");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-labelledby", trigger.id);
  const items = (): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>("[data-rk-menuitem]")];
  let typed = "";
  let typedTimer: ReturnType<typeof setTimeout> | undefined;

  const disclosure = createDisclosure({
    trigger, popup: menu, kind: "menu",
    onToggle: (open) => { if (open) queueMicrotask(() => focusAt(0)); },
  });
  // Items are roving: only the focused one is in the tab order, and a disabled one stays reachable.
  const sync = (): void => items().forEach((item) => { item.setAttribute("role", "menuitem"); item.tabIndex = -1; });
  sync();

  function focusAt(index: number): void {
    const list = items();
    if (list.length === 0) return;
    const i = (index + list.length) % list.length;
    list.forEach((item, at) => { item.tabIndex = at === i ? 0 : -1; });
    list[i]?.focus();
  }
  const current = (): number => items().indexOf(document.activeElement as HTMLElement);
  const choose = (item: HTMLElement): void => {
    if (item.getAttribute("aria-disabled") === "true") return;
    disclosure.close(true);
    options.onSelect(item);
  };

  const onMenuKey = (e: KeyboardEvent): void => {
    const list = items();
    const at = current();
    switch (e.key) {
      case "ArrowDown": focusAt(at + 1); break;
      case "ArrowUp": focusAt(at <= 0 ? list.length - 1 : at - 1); break;
      case "Home": focusAt(0); break;
      case "End": focusAt(list.length - 1); break;
      case "Enter": case " ": { const item = list[at]; if (item) choose(item); break; }
      case "Tab": disclosure.close(false); return; // let Tab carry on to the next control
      default: {
        // Type-ahead: a printable key jumps to the next item whose name starts with what has been typed.
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        typed += e.key.toLowerCase();
        if (typedTimer) clearTimeout(typedTimer);
        typedTimer = setTimeout(() => { typed = ""; }, 500);
        const names = list.map((item) => (item.textContent ?? item.getAttribute("aria-label") ?? "").trim().toLowerCase());
        const start = typed.length === 1 ? at + 1 : at;
        const hit = [...names.keys()].map((k) => (k + start + names.length) % names.length).find((k) => names[k]?.startsWith(typed));
        if (hit !== undefined) focusAt(hit);
      }
    }
    e.preventDefault();
  };
  const onTriggerKey = (e: KeyboardEvent): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      disclosure.open();
      queueMicrotask(() => focusAt(e.key === "ArrowDown" ? 0 : items().length - 1));
    }
  };
  const onClick = (e: MouseEvent): void => {
    const item = (e.target as Element | null)?.closest<HTMLElement>("[data-rk-menuitem]");
    if (item && menu.contains(item)) choose(item);
  };
  menu.addEventListener("keydown", onMenuKey);
  menu.addEventListener("click", onClick);
  trigger.addEventListener("keydown", onTriggerKey);
  return {
    get isOpen() { return disclosure.isOpen; },
    open: disclosure.open, close: disclosure.close, toggle: disclosure.toggle,
    destroy() {
      if (typedTimer) clearTimeout(typedTimer);
      menu.removeEventListener("keydown", onMenuKey);
      menu.removeEventListener("click", onClick);
      trigger.removeEventListener("keydown", onTriggerKey);
      disclosure.destroy();
    },
  };
}
