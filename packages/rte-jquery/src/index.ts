// $(selector).rkEditor(options) for pages that use jQuery. The work is done by <rk-editor>; this only makes it reachable the jQuery way.
// jQuery is not imported: pass it to `install`, or let `install()` find the global one.
import type { Editor } from "@rathkit/rte-core/dom";
import type { RkEditor, RkEditorOptions } from "@rathkit/rte-element";

export interface RkJqueryOptions extends RkEditorOptions {
  /** The starting HTML. */
  html?: string;
  readOnly?: boolean;
  /** The name screen readers announce for the editing surface. */
  label: string;
}

interface JQueryLike {
  fn: Record<string, unknown>;
  (element: Element): { trigger(name: string, data: unknown[]): void };
}
interface Collection {
  each(fn: (this: HTMLElement) => void): Collection;
  length: number;
  [index: number]: HTMLElement | undefined;
}

const KEY = "rkEditor";
type Host = HTMLElement & { __rk?: RkEditor };
/** The editor element inside a host the plugin was called on (or the element itself, if it is an editor). */
const editorOf = (host: HTMLElement | undefined): RkEditor | undefined => (host as Host | undefined)?.__rk ?? (host as RkEditor | undefined);

/**
 * Adds `.rkEditor()` to jQuery:
 * - `$(el).rkEditor({ label, html, ... })` turns the element into an editor, once;
 * - `$(el).rkEditor("html")` reads the HTML of the first element, `$(el).rkEditor("html", "<p>x</p>")` replaces it;
 * - `$(el).rkEditor("editor")` gives the editor of the first element (a promise, because it is built when the element connects);
 * - `$(el).rkEditor("destroy")` removes it.
 * Changes arrive as `rk:change` events with the HTML as the second argument to the handler.
 */
export function install($: JQueryLike = (globalThis as unknown as { jQuery: JQueryLike }).jQuery): void {
  $.fn[KEY] = function (this: Collection, arg?: string | RkJqueryOptions, value?: string): unknown {
    if (typeof arg === "string") {
      const first = editorOf(this[0]);
      switch (arg) {
        case "html":
          if (value === undefined) return first?.value;
          this.each(function () { const el = editorOf(this); if (el) el.value = value; });
          return this;
        case "editor":
          return first?.whenReady() as Promise<Editor> | undefined;
        case "destroy":
          this.each(function () { (this as Host).__rk?.remove(); delete (this as Host).__rk; });
          return this;
        default:
          throw new Error(`rkEditor: unknown method "${arg}"`);
      }
    }
    const options = arg as RkJqueryOptions;
    return this.each(function () {
      const host = this as Host;
      if (host.__rk) return;
      const { html, readOnly, label, ...rest } = options;
      const el = document.createElement("rk-editor") as RkEditor;
      el.setAttribute("label", label);
      if (html !== undefined) el.setAttribute("value", html);
      if (readOnly) el.setAttribute("readonly", "");
      el.options = rest;
      el.addEventListener("rk-change", (event) => {
        const detail = (event as CustomEvent<{ html: string }>).detail;
        // Through the jQuery that was installed into (not a global one), so handlers get the html as their second argument.
        if (typeof $ === "function") $(host).trigger("rk:change", [detail.html]);
        else host.dispatchEvent(new CustomEvent("rk:change", { bubbles: true, detail }));
      });
      host.__rk = el;
      host.appendChild(el);
    });
  };
}
