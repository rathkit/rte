// A modal dialog: focus moves in, Tab stays inside, Escape cancels, the page behind is out of reach, and focus goes back to where it
// came from. It uses the browser's own `<dialog>` when the element is one, which gives all of that for free; otherwise it does the work.
import type { Field } from "@rathkit/rte-core";
import { uniqueId } from "./disclosure.ts";
import type { Unsubscribe } from "./types.ts";

export interface DialogOptions {
  readonly dialog: HTMLElement;
  /** What opened it; focus returns here. If it is gone, focus goes to the editor. */
  readonly opener?: HTMLElement | null;
  readonly editor?: { focus(): void };
  readonly onClose?: (result: "submit" | "cancel") => void;
  /** Called with a developer-facing warning, such as a dialog with no name. Default: the console. */
  readonly warn?: (message: string) => void;
}

export interface Dialog {
  readonly isOpen: boolean;
  open(): void;
  close(result?: "submit" | "cancel"): void;
  destroy: Unsubscribe;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function createDialog(options: DialogOptions): Dialog {
  const { dialog } = options;
  const warn = options.warn ?? ((m: string) => console.warn(`[rte] ${m}`));
  const native = typeof HTMLDialogElement !== "undefined" && dialog instanceof HTMLDialogElement && typeof dialog.showModal === "function";
  if (!dialog.hasAttribute("aria-labelledby") && !dialog.hasAttribute("aria-label")) warn("A dialog needs a name: give it aria-labelledby or aria-label.");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  let isOpen = false;
  let result: "submit" | "cancel" = "cancel";

  const focusable = (): HTMLElement[] => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.hidden && e.getAttribute("aria-hidden") !== "true");
  const returnFocus = (): void => {
    const opener = options.opener;
    if (opener && opener.isConnected) opener.focus();
    else options.editor?.focus();
  };
  const finish = (): void => {
    if (!isOpen) return;
    isOpen = false;
    dialog.setAttribute("data-state", "closed");
    returnFocus();
    options.onClose?.(result);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close("cancel");
    } else if (e.key === "Tab" && !native) {
      const list = focusable();
      if (list.length === 0) return;
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const onCancel = (e: Event): void => { e.preventDefault(); close("cancel"); };
  dialog.addEventListener("keydown", onKeyDown);
  if (native) dialog.addEventListener("cancel", onCancel);

  function close(how: "submit" | "cancel" = "cancel"): void {
    if (!isOpen) return;
    result = how;
    if (native) (dialog as HTMLDialogElement).close();
    else dialog.hidden = true;
    finish();
  }
  function open(): void {
    if (isOpen) return;
    isOpen = true;
    result = "cancel";
    dialog.setAttribute("data-state", "open");
    if (native) (dialog as HTMLDialogElement).showModal();
    else dialog.hidden = false;
    const target = dialog.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0] ?? dialog;
    if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
    target.focus();
  }
  return {
    get isOpen() { return isOpen; },
    open, close,
    destroy() {
      dialog.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("cancel", onCancel);
    },
  };
}

export interface FormCheck {
  readonly ok: boolean;
  readonly values: Record<string, string | boolean>;
}

/**
 * Checks a dialog's form against the fields an item asked for. Each field that is missing or wrong gets `aria-invalid` and is tied to
 * its message by `aria-describedby`; put an element marked `data-rk-error="<field name>"` where the message should appear. The first
 * bad field takes the focus, and the messages are announced when an announcer is given.
 */
export function checkFields(form: HTMLElement, fields: readonly Field[], messages: { readonly required?: string; readonly url?: string } = {}, announce?: (message: string) => void): FormCheck {
  const values: Record<string, string | boolean> = {};
  const problems: string[] = [];
  let firstBad: HTMLElement | undefined;
  for (const field of fields) {
    const input = form.querySelector<HTMLInputElement>(`[name="${field.name}"]`);
    if (!input) continue;
    // A checkbox is a yes or no; everything else is its trimmed text.
    if (field.type === "checkbox") {
      values[field.name] = input.checked;
      continue;
    }
    const value = input.value.trim();
    values[field.name] = value;
    let problem = "";
    if (field.required && value === "") problem = messages.required ?? `${field.label} is required.`;
    else if (value !== "" && field.type === "url" && /^\s*(javascript|vbscript|data):/i.test(value)) problem = messages.url ?? `${field.label} must be a web, mail or phone address.`;
    const slot = form.querySelector<HTMLElement>(`[data-rk-error="${field.name}"]`);
    if (slot) slot.textContent = problem;
    if (problem) {
      input.setAttribute("aria-invalid", "true");
      if (slot) {
        if (!slot.id) slot.id = uniqueId("rk-error");
        input.setAttribute("aria-describedby", slot.id);
      }
      problems.push(problem);
      firstBad ??= input;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
  if (firstBad) {
    firstBad.focus();
    announce?.(problems.join(" "));
  }
  return { ok: problems.length === 0, values };
}

