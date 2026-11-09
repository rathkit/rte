// <rte-toolbar>: a plain toolbar for an <rte-editor>, built from the editor's interface items and made to behave by the headless layer.
// Unstyled, with text labels: style it from the page, or draw your own from `editor.ui` and the headless layer instead.
import { createToolbar, type Toolbar } from "@rathkit/rte-headless";
import { ElementBase } from "./base.ts";
import type { RteEditorElement } from "./editor-element.ts";

export class RteToolbarElement extends ElementBase {
  static observedAttributes = ["for", "label", "slot-name"];
  private toolbar: Toolbar | undefined;
  private unbind: (() => void) | undefined;
  private unwatch: (() => void) | undefined;
  private building = 0;

  connectedCallback(): void { void this.build(); }
  disconnectedCallback(): void { this.teardown(); }
  attributeChangedCallback(): void { if (this.isConnected) void this.build(); }

  /** The editor this toolbar belongs to: the element named by `for`, else the nearest <rte-editor> beside or around it. */
  private target(): RteEditorElement | null {
    const id = this.getAttribute("for");
    if (id) return this.ownerDocument.getElementById(id) as RteEditorElement | null;
    return (this.parentElement?.querySelector("rte-editor") ?? this.closest("rte-editor")) as RteEditorElement | null;
  }

  private teardown(): void {
    this.unwatch?.();
    this.unbind?.();
    this.toolbar?.destroy();
    this.toolbar = undefined;
  }

  private async build(): Promise<void> {
    const ticket = ++this.building;
    this.teardown();
    const host = this.target();
    if (!host) return;
    await customElements.whenDefined("rte-editor");
    const editor = await host.whenReady();
    if (ticket !== this.building || !this.isConnected) return;
    const toolbar = createToolbar(editor, { label: this.getAttribute("label") ?? "Formatting", slot: this.getAttribute("slot-name") ?? "toolbar.main" });
    this.toolbar = toolbar;
    const draw = (): void => {
      this.unbind?.();
      const controls: HTMLElement[] = [];
      for (const item of toolbar.items) {
        if (item.kind === "separator") {
          const s = document.createElement("span");
          s.setAttribute("role", "separator");
          controls.push(s);
        } else if (item.kind === "select") {
          const select = document.createElement("select");
          select.setAttribute("data-rte-item", item.id);
          for (const o of item.options) {
            const option = document.createElement("option");
            option.value = String(o.value);
            option.textContent = o.label;
            select.appendChild(option);
          }
          controls.push(select);
        } else if (item.kind !== "menu") {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-rte-item", item.id);
          button.textContent = toolbar.state(item.id)?.label ?? item.id;
          controls.push(button);
        }
      }
      this.replaceChildren(...controls);
      // A dialog item asks the page to open its dialog: this element only says so, and the page (or the styled interface) answers.
      this.unbind = toolbar.bind(this, { onOpen: (item, control) => this.dispatchEvent(new CustomEvent("rte-open", { bubbles: true, composed: true, detail: { item, control } })) });
    };
    draw();
    this.unwatch = editor.ui.subscribe(this.getAttribute("slot-name") ?? "toolbar.main", draw);
  }
}
