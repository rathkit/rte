// The HTML source view: the document's HTML in a text box, in place of the writing area. Closing it with the button applies what was
// typed as one undo step (through the `document.setHtml` command, so it is read like anything pasted); Escape closes it and throws the
// changes away. While it is open the formatting buttons do nothing, since the writing area they act on is not showing.
import type { UiEditor } from "./types.ts";

export interface SourceViewOptions {
  readonly editor: UiEditor;
  readonly content: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly part: <E extends HTMLElement>(el: E, name: string) => E;
  readonly message: (key: string) => string;
  readonly announce: (message: string) => void;
}

export interface SourceView {
  toggle(opener: HTMLElement): void;
  readonly isOpen: boolean;
  /** Words may have changed: write them again. */
  refresh(): void;
  destroy(): void;
}

export function createSourceView(options: SourceViewOptions): SourceView {
  const { editor, content, toolbar } = options;
  const area = options.part(document.createElement("textarea"), "source");
  area.hidden = true;
  area.spellcheck = false;
  area.setAttribute("aria-label", options.message("source.label"));
  area.setAttribute("autocapitalize", "off");
  // HTML reads left to right, whatever the language of the interface or the document.
  area.dir = "ltr";
  content.appendChild(area);
  let original = "";
  let opener: HTMLElement | undefined;

  const button = (): HTMLElement | null => toolbar.querySelector('[data-rte-item="source"]');
  const close = (apply: boolean): void => {
    if (area.hidden) return;
    const changed = area.value !== original;
    area.hidden = true;
    content.removeAttribute("data-rte-source");
    button()?.setAttribute("aria-pressed", "false");
    if (apply && changed) editor.commands.run("document.setHtml", { html: area.value });
    editor.focus();
    (opener ?? button())?.removeAttribute("data-rte-busy");
  };
  const open = (from: HTMLElement): void => {
    opener = from;
    original = editor.getHtml?.("\n") ?? "";
    area.value = original;
    area.hidden = false;
    content.setAttribute("data-rte-source", "");
    button()?.setAttribute("aria-pressed", "true");
    area.focus();
    area.setSelectionRange(0, 0);
  };

  // The other buttons would act on a writing area that is not showing, so they are ignored while this is open.
  const guard = (e: Event): void => {
    if (area.hidden) return;
    const control = (e.target as Element | null)?.closest<HTMLElement>("[data-rte-item]");
    if (!control || control.getAttribute("data-rte-item") === "source") return;
    if (e.type === "keydown" && !["Enter", " "].includes((e as KeyboardEvent).key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  toolbar.addEventListener("click", guard, true);
  toolbar.addEventListener("keydown", guard, true);
  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
  });

  return {
    toggle(from) { if (area.hidden) open(from); else close(true); },
    get isOpen() { return !area.hidden; },
    refresh() { area.setAttribute("aria-label", options.message("source.label")); },
    destroy() {
      toolbar.removeEventListener("click", guard, true);
      toolbar.removeEventListener("keydown", guard, true);
      area.remove();
      content.removeAttribute("data-rte-source");
    },
  };
}
