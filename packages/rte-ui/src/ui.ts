// The styled interface: a toolbar and dialogs, built from the editor's interface items on the headless layer. Every element carries a
// stable data-rte-part so themes and utility classes can address it; the look comes from tokens (see @rathkit/rte-themes).
import type { UiItem } from "@rathkit/rte-core";
import { checkFields, createAnnouncer, createDialog, createMenu, createToolbar, createTooltip, type Dialog, type Menu } from "@rathkit/rte-headless";
import { createFindBar, type FindBar } from "./findbar.ts";
import { createFloating, type Floating } from "./floating.ts";
import { setIcon } from "./icon.ts";
import { createShortcuts } from "./shortcuts.ts";
import { createSourceView } from "./source.ts";
import { text } from "./messages.ts";
import type { PartName, StyleProvider, Ui, UiEditor, UiOptions } from "./types.ts";

let counter = 0;

const sameEntries = (a: object | undefined, b: object | undefined): boolean => {
  const x = Object.entries(a ?? {});
  const y = Object.entries(b ?? {});
  return x.length === y.length && x.every(([k, v], i) => y[i]?.[0] === k && Object.is(y[i]?.[1], v));
};

export function createUi(editor: UiEditor, options: UiOptions): Ui {
  const { root } = options;
  const slot = options.slot ?? "toolbar.main";
  let style: StyleProvider = {};
  const appliedTokens = new Set<string>();
  const appliedClasses = new Map<PartName, string[]>();
  const parts = new Map<PartName, Set<HTMLElement>>();

  /** Marks an element as a part: the attribute that selectors use, and any classes the style asks for. */
  const part = <E extends HTMLElement>(el: E, name: PartName): E => {
    el.setAttribute("data-rte-part", name);
    let set = parts.get(name);
    if (!set) parts.set(name, (set = new Set()));
    set.add(el);
    for (const cls of style.classes?.[name]?.split(/\s+/).filter(Boolean) ?? []) el.classList.add(cls);
    return el;
  };
  const message = (key: Parameters<typeof text>[1], fallback = "", values: Record<string, string> = {}): string => text(style.messages, key, fallback, values);

  // ---- structure -----------------------------------------------------------------------------------------
  root.classList.add("rte-root");
  part(root, "root");
  const toolbarEl = part(document.createElement("div"), "toolbar");
  const contentEl = part(document.createElement("div"), "content");
  const statusEl = part(document.createElement("div"), "status");
  root.append(toolbarEl, contentEl);
  contentEl.appendChild(editor.element);
  // The count under the writing area: worked out at most a few times a second, so a long document is not recounted on every key.
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const showStatus = (): void => {
    statusTimer = undefined;
    const counts = editor.counts?.();
    if (!counts) return;
    const words = counts.document.words;
    statusEl.textContent = counts.selection.words > 0
      ? message("status.selection", "", { selected: String(counts.selection.words), total: String(words) })
      : `${message(words === 1 ? "status.word" : "status.words", "", { count: String(words) })} · ${message("status.characters", "", { count: String(counts.document.characters) })}`;
  };
  // Find and replace, when the editor has it: a bar between the toolbar and the writing area.
  const findBar: FindBar | undefined = editor.commands.list().some((c) => c.name === "find.set")
    ? createFindBar({ editor, part: (el, name) => part(el, name as PartName), message: (key, fallback, values) => message(key as never, fallback, values), icon: (name) => iconFor(name), announce: (m) => announcer.announce(m) })
    : undefined;
  if (findBar) root.insertBefore(findBar.element, contentEl);
  const stopStatus = editor.counts && options.status !== false ? editor.subscribe(() => { statusTimer ??= setTimeout(showStatus, 150); }) : undefined;
  if (stopStatus) root.appendChild(statusEl);
  const announcer = createAnnouncer(root);
  // One tooltip for the whole toolbar, put under the control it is for and kept inside the editor's width.
  const tipEl = part(document.createElement("div"), "tooltip");
  root.appendChild(tipEl);
  const tooltip = createTooltip({
    container: root, popup: tipEl,
    onShow: (target, popup) => {
      const box = root.getBoundingClientRect();
      const at = target.getBoundingClientRect();
      popup.style.top = `${Math.round(at.bottom - box.top + 6)}px`;
      popup.style.left = `${Math.round(Math.max(0, Math.min(at.left - box.left, box.width - popup.offsetWidth)))}px`;
    },
  });
  // The HTML source view, when the editor can give its HTML: a button for it joins the toolbar.
  const removeSourceItem = editor.getHtml ? editor.ui.add(slot, { kind: "panel", id: "source", name: "source", label: "HTML source", icon: "source", group: "tools", order: 1 }) : undefined;
  const removeShortcutsItem = editor.ui.add(slot, { kind: "panel", id: "shortcuts", name: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard", group: "tools", order: 2 });
  const toolbar = createToolbar(editor, { slot, label: message("toolbar.label") });
  const shortcuts = createShortcuts({ editor, root, part: (el, name) => part(el, name as PartName), message: (key) => message(key as never) });
  const sourceView = editor.getHtml ? createSourceView({ editor, content: contentEl, toolbar: toolbarEl, part: (el, name) => part(el, name as PartName), message: (key) => message(key as never), announce: (m) => announcer.announce(m) }) : undefined;

  // ---- look: theme attributes, tokens, classes, icons, words --------------------------------------------------
  const iconSpans = new Map<HTMLElement, string>();
  const dialogs = new Map<string, { dialog: Dialog; element: HTMLDialogElement; form: HTMLFormElement; title: HTMLElement; ok: HTMLElement; cancel: HTMLElement; from: { opener: HTMLElement } }>();

  function applyStyle(given: StyleProvider): void {
    const previous = style;
    const base = options.defaults;
    // What the caller gave, over the defaults it was built with.
    const next: StyleProvider = base
      ? { ...given, icons: { ...base.icons, ...given.icons }, messages: { ...base.messages, ...given.messages } }
      : given;
    style = next;
    const set = (name: string, value: string | undefined): void => (value === undefined ? root.removeAttribute(name) : root.setAttribute(name, value));
    set("data-rte-theme", next.theme);
    set("data-rte-scheme", next.scheme);
    set("data-rte-density", next.density);
    // Tokens: set the ones asked for, and let go of the ones that were asked for before and are not any more.
    for (const name of [...appliedTokens]) if (!(next.tokens && name in next.tokens)) { root.style.removeProperty(name); appliedTokens.delete(name); }
    for (const [name, value] of Object.entries(next.tokens ?? {})) { root.style.setProperty(name, value as string); appliedTokens.add(name); }
    // Classes: take away what was added, add what is asked for.
    for (const [name, classes] of appliedClasses) for (const el of parts.get(name) ?? []) el.classList.remove(...classes);
    appliedClasses.clear();
    for (const [name, value] of Object.entries(next.classes ?? {}) as [PartName, string][]) {
      const classes = value.split(/\s+/).filter(Boolean);
      appliedClasses.set(name, classes);
      for (const el of parts.get(name) ?? []) el.classList.add(...classes);
    }
    if (!sameEntries(previous.icons, next.icons) || !sameEntries(previous.messages, next.messages) || previous.parts !== next.parts) { draw(); findBar?.refresh(); shortcuts.refresh(); floating?.refresh(); }
    syncDialogs();
  }

  function iconFor(name: string | undefined): string | (() => Node) | undefined {
    return name === undefined ? undefined : style.icons?.[name];
  }

  // ---- the toolbar ---------------------------------------------------------------------------------------------
  let unbind: (() => void) | undefined;
  let floating: Floating | undefined;

  function labelOf(item: UiItem): string {
    return message(`item.${item.id}` as `item.${string}`, toolbar.state(item.id)?.label ?? item.id);
  }

  function control(item: UiItem): HTMLElement | undefined {
    if (item.kind === "separator") return part(document.createElement("span"), "separator");
    if (item.kind === "panel" && item.name !== "source" && item.name !== "shortcuts") return undefined;
    const state = toolbar.state(item.id);
    if (!state) return undefined;
    if (item.kind === "select") {
      const select = part(document.createElement("select"), "select");
      select.setAttribute("data-rte-item", item.id);
      for (const o of item.options) {
        const option = document.createElement("option");
        option.value = String(o.value);
        option.textContent = o.label;
        select.appendChild(option);
      }
      return select;
    }
    if (item.kind === "menu") return menuControl(item, state);
    const customize = style.parts?.button;
    if (customize) {
      const el = customize({ item, state, run: (value) => toolbar.activate(item.id, value) });
      el.setAttribute("data-rte-part", "button");
      el.setAttribute("data-rte-item", item.id);
      (parts.get("button") ?? parts.set("button", new Set()).get("button"))?.add(el);
      return el;
    }
    const button = part(document.createElement("button"), "button");
    button.type = "button";
    button.setAttribute("data-rte-item", item.id);
    const icon = part(document.createElement("span"), "icon");
    icon.setAttribute("aria-hidden", "true");
    if (setIcon(icon, iconFor(state.icon))) {
      iconSpans.set(icon, state.icon ?? "");
      button.appendChild(icon);
    } else {
      // No icon for this name: show the words instead, so the control still means something.
      const label = part(document.createElement("span"), "label");
      label.textContent = labelOf(item);
      button.appendChild(label);
    }
    return button;
  }

  // ---- menus ---------------------------------------------------------------------------------------------------
  const menus: Menu[] = [];
  const menuItems = new Map<string, UiItem>();

  /** A button that opens a list of commands. The headless menu does the keys, the focus and the ARIA; this does the elements. */
  function menuControl(item: Extract<UiItem, { kind: "menu" }>, state: NonNullable<ReturnType<typeof toolbar.state>>): HTMLElement {
    const host = part(document.createElement("span"), "menu-host");
    const trigger = part(document.createElement("button"), "button");
    trigger.type = "button";
    trigger.setAttribute("data-rte-item", item.id);
    const icon = part(document.createElement("span"), "icon");
    icon.setAttribute("aria-hidden", "true");
    if (setIcon(icon, iconFor(state.icon))) {
      iconSpans.set(icon, state.icon ?? "");
      trigger.appendChild(icon);
    } else {
      const label = part(document.createElement("span"), "label");
      label.textContent = labelOf(item);
      trigger.appendChild(label);
    }
    const caret = part(document.createElement("span"), "icon");
    caret.setAttribute("aria-hidden", "true");
    if (setIcon(caret, iconFor("chevron-down"))) trigger.appendChild(caret);
    const popup = part(document.createElement("div"), "menu");
    for (const child of item.items) {
      if (child.kind === "separator") {
        const rule = part(document.createElement("div"), "menu-separator");
        rule.setAttribute("role", "separator");
        popup.appendChild(rule);
        continue;
      }
      if (child.kind !== "button" && child.kind !== "toggle" && child.kind !== "dialog") continue;
      menuItems.set(child.id, child);
      const entry = part(document.createElement("button"), "menu-item");
      entry.type = "button";
      entry.setAttribute("data-rte-menuitem", "");
      entry.setAttribute("data-rte-menu-item", child.id);
      const words = part(document.createElement("span"), "label");
      const keys = part(document.createElement("span"), "menu-keys");
      if (child.kind !== "dialog" && child.swatch) {
        // A color sample in front of the name; the name is still there for anyone who cannot see the color.
        const swatch = part(document.createElement("span"), "swatch");
        swatch.setAttribute("aria-hidden", "true");
        swatch.style.backgroundColor = child.swatch;
        entry.append(swatch);
      }
      entry.append(words, keys);
      popup.appendChild(entry);
    }
    host.append(trigger, popup);
    const menu = createMenu({
      trigger, menu: popup,
      // Kept on the screen: a menu opened from a button near the right edge of a narrow window slides back in.
      onOpen: () => {
        popup.style.translate = "";
        const box = popup.getBoundingClientRect();
        const width = document.documentElement.clientWidth;
        const dx = box.right > width - 4 ? width - 4 - box.right : box.left < 4 ? 4 - box.left : 0;
        if (dx !== 0) popup.style.translate = `${Math.round(dx)}px`;
      },
      onSelect: (entry) => {
        const id = entry.getAttribute("data-rte-menu-item") ?? "";
        const child = menuItems.get(id);
        // An entry that asks for something opens its dialog; focus comes back to the menu button when the dialog closes.
        if (child?.kind === "dialog") { openDialog(child, trigger); return; }
        if (toolbar.activate(id) && child?.kind === "toggle") {
          const now = toolbar.state(id);
          announcer.announce(message(now?.pressed ? "toggle.on" : "toggle.off", "", { label: labelOf(child) }));
        }
        editor.focus();
      },
    });
    for (const entry of popup.querySelectorAll<HTMLElement>("[data-rte-menu-item]")) {
      if (menuItems.get(entry.getAttribute("data-rte-menu-item") ?? "")?.kind === "toggle") entry.setAttribute("role", "menuitemcheckbox");
    }
    menus.push(menu);
    return host;
  }

  /** Words, keys and state for every entry of every menu. */
  function menuEntries(): void {
    for (const entry of toolbarEl.querySelectorAll<HTMLElement>("[data-rte-menu-item]")) {
      const id = entry.getAttribute("data-rte-menu-item") ?? "";
      const child = menuItems.get(id);
      const state = toolbar.state(id);
      if (!child || !state) continue;
      const label = labelOf(child);
      const words = entry.querySelector<HTMLElement>('[data-rte-part="label"]');
      if (words) words.textContent = label;
      const keys = entry.querySelector<HTMLElement>('[data-rte-part="menu-keys"]');
      if (keys) keys.textContent = state.shortcutLabel ?? "";
      if (state.shortcut) entry.setAttribute("aria-keyshortcuts", state.shortcut);
      else entry.removeAttribute("aria-keyshortcuts");
      // Unavailable entries stay reachable by keyboard; they only say they are unavailable.
      entry.setAttribute("aria-disabled", String(state.disabled));
      if (child.kind === "toggle") entry.setAttribute("aria-checked", String(state.pressed === true));
    }
  }

  function draw(): void {
    unbind?.();
    for (const menu of menus.splice(0)) menu.destroy();
    menuItems.clear();
    iconSpans.clear();
    // Forget the parts the toolbar drew last time (they are about to be replaced), and keep the ones drawn elsewhere, such as the find bar's.
    for (const name of ["button", "select", "separator", "icon", "label", "menu-host", "menu", "menu-item", "menu-separator", "menu-keys", "swatch"] as const) {
      const kept = new Set<HTMLElement>();
      for (const el of parts.get(name) ?? []) if (!toolbarEl.contains(el)) kept.add(el);
      parts.set(name, kept);
    }
    const controls: HTMLElement[] = [];
    let group: string | undefined;
    for (const item of toolbar.items) {
      const next = item.group ?? "";
      if (group !== undefined && next !== group && item.kind !== "separator") controls.push(part(document.createElement("span"), "separator"));
      group = next;
      const el = control(item);
      if (el) controls.push(el);
    }
    toolbarEl.replaceChildren(...controls);
    // A menu opens itself (the headless menu listens on its own button), so only dialogs are opened from here.
    unbind = toolbar.bind(toolbarEl, { onOpen: (item, opener) => { if (item.kind === "dialog") openDialog(item, opener); else if (item.kind === "panel" && item.name === "source") sourceView?.toggle(opener); else if (item.kind === "panel" && item.name === "shortcuts") shortcuts.open(opener); } });
    // Our click listener goes after the headless layer's, so by the time it runs the command has run and the state is the new one.
    toolbarEl.removeEventListener("click", onToolbarClick);
    toolbarEl.addEventListener("click", onToolbarClick);
    names();
    menuEntries();
  }

  /** Names for everything drawn: the accessible name and the tooltip, with the key that runs it. */
  function names(): void {
    for (const el of toolbarEl.querySelectorAll<HTMLElement>("[data-rte-item]")) {
      const id = el.getAttribute("data-rte-item") ?? "";
      const item = toolbar.items.find((i) => i.id === id);
      const state = toolbar.state(id);
      if (!item || !state) continue;
      const label = labelOf(item);
      el.setAttribute("aria-label", label);
      el.setAttribute("data-rte-tip", state.shortcutLabel ? `${label} (${state.shortcutLabel})` : label);
      if (el.tagName === "BUTTON") {
        const word = el.querySelector<HTMLElement>('[data-rte-part="label"]');
        if (word) word.textContent = label;
      }
    }
  }
  toolbar.subscribe(names);
  toolbar.subscribe(menuEntries);
  const stopRedraw = toolbar.subscribe(() => {
    // A change in which items exist (a plugin added or removed one) needs a redraw; a change in state does not.
    const ids = toolbar.items.map((i) => i.id).join("\u0000");
    if (ids !== drawn) { drawn = ids; draw(); }
  });
  let drawn = "";

  // Say what a toggle did, but only when a person pressed it, not when the caret moved.
  const onToolbarClick = (e: Event): void => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-rte-item]");
    if (!el) return;
    const item = toolbar.items.find((i) => i.id === el.getAttribute("data-rte-item"));
    const state = item ? toolbar.state(item.id) : undefined;
    if (item?.kind === "toggle" && state && !state.disabled) {
      const group = item.group === "align" || item.group === "lists";
      announcer.announce(group ? labelOf(item) : message(state.pressed ? "toggle.on" : "toggle.off", "", { label: labelOf(item) }));
    }
  };

  // ---- dialogs -------------------------------------------------------------------------------------------------
  function syncDialogs(): void {
    for (const [id, d] of dialogs) {
      const item = toolbar.items.find((i) => i.id === id) ?? menuItems.get(id);
      if (!item || item.kind !== "dialog") continue;
      d.title.textContent = labelOf(item);
      d.ok.textContent = message("dialog.ok");
      d.cancel.textContent = message("dialog.cancel");
    }
  }

  function openDialog(item: Extract<UiItem, { kind: "dialog" }>, opener: HTMLElement): void {
    let entry = dialogs.get(item.id);
    if (!entry) {
      const element = part(document.createElement("dialog"), "dialog");
      const titleId = `rte-dialog-title-${++counter}`;
      element.setAttribute("aria-labelledby", titleId);
      const form = document.createElement("form");
      form.noValidate = true;
      const title = part(document.createElement("h2"), "dialog-title");
      title.id = titleId;
      form.appendChild(title);
      for (const field of item.fields) {
        const inputId = `rte-field-${++counter}`;
        const label = part(document.createElement("label"), "field-label");
        label.htmlFor = inputId;
        label.textContent = field.label;
        // A choice is a list to pick from; everything else is an input (the others read the same way: by name, with a value).
        const input = (field.type === "choice" ? part(document.createElement("select"), "field") : part(document.createElement("input"), "field")) as HTMLInputElement;
        input.id = inputId;
        input.name = field.name;
        if (field.type === "choice") {
          for (const choice of field.choices ?? []) {
            const option = document.createElement("option");
            option.value = choice.value;
            option.textContent = choice.label;
            input.appendChild(option);
          }
        } else {
          input.type = field.type === "checkbox" ? "checkbox" : "text";
          if (field.type === "url") input.inputMode = "url";
          input.autocomplete = "off";
        }
        if (field.required) input.required = true;
        const error = part(document.createElement("span"), "field-error");
        error.setAttribute("data-rte-error", field.name);
        // A checkbox has its label after it, on one line.
        if (field.type === "checkbox") {
          const row = part(document.createElement("div"), "field-check");
          row.append(input, label);
          form.append(row, error);
        } else form.append(label, input, error);
      }
      const actions = part(document.createElement("div"), "actions");
      const ok = part(document.createElement("button"), "action");
      ok.type = "submit";
      ok.setAttribute("data-primary", "");
      const cancel = part(document.createElement("button"), "action");
      cancel.type = "button";
      actions.append(cancel, ok);
      form.appendChild(actions);
      element.appendChild(form);
      root.appendChild(element);
      // Focus goes back to whatever opened the dialog this time, so the opener is read when the dialog closes.
      const from = { opener };
      const dialog = createDialog({ dialog: element, editor, get opener() { return from.opener; } });
      cancel.addEventListener("click", () => dialog.close("cancel"));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const check = checkFields(form, item.fields, { required: message("field.required", "", { label: "{label}" }), url: message("field.url") }, (m) => announcer.announce(m));
        if (!check.ok) return;
        dialog.close("submit");
        editor.commands.run(item.command, check.values);
      });
      entry = { dialog, element, form, title, ok, cancel, from };
      dialogs.set(item.id, entry);
      syncDialogs();
    }
    // Fill the dialog with what the command says is there now: the address of the link under the caret, say. A text value fills a
    // single-field dialog; an object fills the fields it names.
    const current = editor.commands.state(item.command).value;
    for (const f of item.fields) {
      const input = entry.form.querySelector<HTMLInputElement>(`[name="${f.name}"]`);
      if (!input) continue;
      const given = current !== null && typeof current === "object" ? (current as Record<string, unknown>)[f.name] : item.fields.length === 1 ? current : undefined;
      if (f.type === "checkbox") input.checked = given === true;
      else input.value = typeof given === "string" ? given : "";
    }
    for (const f of item.fields) {
      const bad = entry.form.querySelector<HTMLElement>(`[name="${f.name}"]`);
      bad?.removeAttribute("aria-invalid");
      const err = entry.form.querySelector<HTMLElement>(`[data-rte-error="${f.name}"]`);
      if (err) err.textContent = "";
    }
    entry.from.opener = opener;
    entry.dialog.open();
  }

  // ---- go ---------------------------------------------------------------------------------------------------
  drawn = toolbar.items.map((i) => i.id).join("\u0000");
  applyStyle(options.style ?? {});
  // Made after the first look is applied, so the icons it draws are the ones the style gave.
  floating = options.selectionToolbar || options.contextMenu
    ? createFloating({
      editor, root, selectionToolbar: options.selectionToolbar === true, contextMenu: options.contextMenu === true,
      part: (el, name) => part(el, name as PartName), message: (key, fallback) => message(key as never, fallback), icon: (name) => iconFor(name),
      openDialog,
    })
    : undefined;
  if (stopStatus) showStatus();

  return {
    root, toolbar,
    setStyle: applyStyle,
    announce: (m) => announcer.announce(m),
    destroy() {
      unbind?.();
      for (const menu of menus.splice(0)) menu.destroy();
      tooltip.destroy();
      tipEl.remove();
      stopStatus?.();
      findBar?.destroy();
      floating?.destroy();
      sourceView?.destroy();
      removeSourceItem?.();
      shortcuts.destroy();
      removeShortcutsItem();
      if (statusTimer) clearTimeout(statusTimer);
      statusEl.remove();
      stopRedraw();
      toolbarEl.removeEventListener("click", onToolbarClick);
      for (const d of dialogs.values()) { d.dialog.destroy(); d.element.remove(); }
      announcer.destroy();
      toolbar.destroy();
      toolbarEl.remove();
      // The editing surface goes back where it was found: directly in the root.
      contentEl.replaceWith(...contentEl.childNodes);
      root.classList.remove("rte-root");
      for (const name of ["data-rte-theme", "data-rte-scheme", "data-rte-density", "data-rte-part"]) root.removeAttribute(name);
      for (const t of appliedTokens) root.style.removeProperty(t);
    },
  };
}
