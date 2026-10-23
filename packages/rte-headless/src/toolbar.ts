// A toolbar, as behavior. It reads the interface items for a place (a slot), works out each item's state from the command it points
// at, and, when given the elements a person's own interface drew, makes them behave: one tab stop that the arrow keys move, buttons
// that keep the editor's selection when pressed, the right ARIA state, and focus returned to the editor afterwards.
import type { UiItem } from "@rathkit/rte-core";
import type { HeadlessEditor, Unsubscribe } from "./types.ts";

export interface ItemState {
  readonly id: string;
  readonly kind: UiItem["kind"];
  /** Always set: the item's own label, else the command's, else the item's id. A control without a name is a bug. */
  readonly label: string;
  readonly icon: string | undefined;
  /** Not available right now. The control stays focusable (`aria-disabled`), so people can find it. */
  readonly disabled: boolean;
  /** For toggles: on or off. Undefined for other kinds. */
  readonly pressed: boolean | undefined;
  /** For selects: the current value. */
  readonly value: unknown;
  /** The key that runs it, written for `aria-keyshortcuts`, if it has one. */
  readonly shortcut: string | undefined;
  /** The same key written for people ("Ctrl+B"), for a tooltip. */
  readonly shortcutLabel: string | undefined;
}

export interface ToolbarOptions {
  /** The place to read items from. Default: the main toolbar. */
  readonly slot?: string;
  /** Names the toolbar for assistive technology. Required in practice: a toolbar without a name is announced as just "toolbar". */
  readonly label?: string;
  readonly orientation?: "horizontal" | "vertical";
}

export interface BindOptions {
  /** Called for items that open something rather than run a command (a dialog, a menu, a panel), with the control that was pressed. */
  readonly onOpen?: (item: UiItem, control: HTMLElement) => void;
}

export interface Toolbar {
  /** The items now, in display order. The same array until the items change. */
  readonly items: readonly UiItem[];
  /** The state of one item. The same object until that item's state changes, so a framework can compare by identity. */
  state(id: string): ItemState | undefined;
  /** Runs the item's command: a button or toggle with its own argument; a select with the chosen value. False if it did nothing. */
  activate(id: string, value?: unknown): boolean;
  /** Called, once per turn, when the items or the state of any of them change. */
  subscribe(callback: () => void): Unsubscribe;
  /** Makes the elements a person's own interface drew behave. Mark each with `data-rk-item="<id>"`. */
  bind(root: HTMLElement, options?: BindOptions): Unsubscribe;
  destroy(): void;
}

const commandOf = (item: UiItem): string | undefined => ("command" in item ? item.command : undefined);

export function createToolbar(editor: HeadlessEditor, options: ToolbarOptions = {}): Toolbar {
  const slot = options.slot ?? "toolbar.main";
  const labels = new Map(editor.commands.list().map((c) => [c.name, c.label]));
  const listeners = new Set<() => void>();
  const cache = new Map<string, { state: ItemState; source: unknown; label: string; shortcut: string | undefined }>();
  let items = editor.ui.items(slot);
  let watching: Unsubscribe[] = [];
  let scheduled = false;
  let destroyed = false;

  const notify = (): void => {
    if (scheduled || destroyed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!destroyed) for (const callback of [...listeners]) callback();
    });
  };

  // Watch the commands that items point at, so the toolbar hears about real changes only.
  const watch = (): void => {
    for (const stop of watching) stop();
    watching = [];
    const seen = new Set<string>();
    for (const item of items) {
      const command = commandOf(item);
      if (command && !seen.has(command)) {
        seen.add(command);
        watching.push(editor.commands.subscribe(command, notify));
      }
    }
  };
  watch();
  const stopItems = editor.ui.subscribe(slot, () => {
    items = editor.ui.items(slot);
    watch();
    notify();
  });

  const find = (id: string): UiItem | undefined => items.find((i) => i.id === id);

  function state(id: string): ItemState | undefined {
    const item = find(id);
    if (!item) return undefined;
    const command = commandOf(item);
    const source = command ? editor.commands.state(command) : undefined;
    const label = ("label" in item && item.label) || (command && labels.get(command)) || item.id;
    const shortcut = command ? editor.keymap.ariaShortcut(command) : undefined;
    const hit = cache.get(id);
    if (hit && hit.source === source && hit.label === label && hit.shortcut === shortcut) return hit.state;
    const arg = "arg" in item ? item.arg : undefined;
    // A toggle that carries an argument ("align center") is on when the command's current value is that argument.
    const pressed = item.kind === "toggle" && source ? (arg !== undefined && source.value !== undefined ? Object.is(source.value, arg) : source.active) : undefined;
    const next: ItemState = {
      id, kind: item.kind, label, icon: "icon" in item ? item.icon : undefined,
      disabled: source ? !source.enabled : false,
      pressed, value: item.kind === "select" ? source?.value : undefined,
      shortcut, shortcutLabel: command ? editor.keymap.shortcutFor(command) : undefined,
    };
    cache.set(id, { state: next, source, label, shortcut });
    return next;
  }

  function activate(id: string, value?: unknown): boolean {
    const item = find(id);
    const command = item ? commandOf(item) : undefined;
    if (!item || !command) return false;
    const arg = item.kind === "select" ? value : item.kind === "button" || item.kind === "toggle" ? item.arg : value;
    const ran = editor.commands.run(command, arg);
    return ran;
  }

  function bind(root: HTMLElement, bindOptions: BindOptions = {}): Unsubscribe {
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-orientation", options.orientation ?? "horizontal");
    if (options.label) root.setAttribute("aria-label", options.label);
    const controls = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>("[data-rk-item]")];
    let current = 0;

    const sync = (): void => {
      const all = controls();
      all.forEach((control, index) => {
        const s = state(control.getAttribute("data-rk-item") ?? "");
        if (!s) return;
        // Disabled controls stay in the tab order with aria-disabled, so a person can find out they exist and why they are unavailable.
        control.setAttribute("aria-disabled", String(s.disabled));
        if (s.pressed !== undefined) control.setAttribute("aria-pressed", String(s.pressed));
        if (s.shortcut) control.setAttribute("aria-keyshortcuts", s.shortcut);
        else control.removeAttribute("aria-keyshortcuts");
        if (!control.hasAttribute("aria-label") && !(control.textContent ?? "").trim()) control.setAttribute("aria-label", s.label);
        if (control.tagName === "SELECT" && s.value !== undefined) (control as HTMLSelectElement).value = String(s.value);
        control.tabIndex = index === current ? 0 : -1;
      });
    };
    sync();
    const stop = (() => { listeners.add(sync); return () => listeners.delete(sync); })();

    const focusAt = (index: number): void => {
      const all = controls();
      if (all.length === 0) return;
      current = (index + all.length) % all.length;
      all.forEach((c, i) => { c.tabIndex = i === current ? 0 : -1; });
      all[current]?.focus();
    };
    const control = (target: EventTarget | null): HTMLElement | null => (target instanceof Element ? target.closest<HTMLElement>("[data-rk-item]") : null);
    const press = (el: HTMLElement): void => {
      const id = el.getAttribute("data-rk-item") ?? "";
      const item = find(id);
      if (!item || el.getAttribute("aria-disabled") === "true") return;
      if (item.kind === "dialog" || item.kind === "menu" || item.kind === "panel") {
        bindOptions.onOpen?.(item, el);
        return;
      }
      if (activate(id)) editor.focus();
    };

    const onMouseDown = (e: MouseEvent): void => {
      const el = control(e.target);
      // Pressing a control must not move the selection out of the editor.
      if (el && el.tagName !== "SELECT" && el.tagName !== "INPUT") e.preventDefault();
    };
    const onClick = (e: MouseEvent): void => {
      const el = control(e.target);
      if (el && el.tagName !== "SELECT") press(el);
    };
    const onChange = (e: Event): void => {
      const el = control(e.target);
      if (!el || el.tagName !== "SELECT") return;
      const item = find(el.getAttribute("data-rk-item") ?? "");
      if (item?.kind !== "select") return;
      const chosen = item.options.find((o) => String(o.value) === (el as HTMLSelectElement).value);
      if (chosen && activate(item.id, chosen.value)) editor.focus();
    };
    const onFocusIn = (e: FocusEvent): void => {
      const el = control(e.target);
      if (el) current = controls().indexOf(el);
      sync();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      const el = control(e.target);
      if (!el) return;
      const vertical = (options.orientation ?? "horizontal") === "vertical";
      const index = controls().indexOf(el);
      const next = vertical ? "ArrowDown" : "ArrowRight";
      const prev = vertical ? "ArrowUp" : "ArrowLeft";
      if (e.key === next) focusAt(index + 1);
      else if (e.key === prev) focusAt(index - 1);
      else if (e.key === "Home") focusAt(0);
      else if (e.key === "End") focusAt(controls().length - 1);
      else if (e.key === "Escape") editor.focus();
      // Elements that are not real buttons get Enter and Space from here.
      else if ((e.key === "Enter" || e.key === " ") && el.tagName !== "BUTTON" && el.tagName !== "SELECT") press(el);
      else return;
      e.preventDefault();
    };
    root.addEventListener("mousedown", onMouseDown);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      stop();
      root.removeEventListener("mousedown", onMouseDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("keydown", onKeyDown);
    };
  }

  return {
    get items() { return items; },
    state, activate,
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    bind,
    destroy() {
      destroyed = true;
      stopItems();
      for (const stop of watching) stop();
      watching = [];
      listeners.clear();
    },
  };
}
