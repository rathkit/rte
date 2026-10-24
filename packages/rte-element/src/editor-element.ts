// <rk-editor>: the editor as a custom element, for any page or framework. It draws no chrome (see <rk-toolbar> or your own); it is the
// editing surface, with a form value, properties, attributes and events. It uses the light DOM, like the rest of the editor, so
// selection, labels and styles from the page behave as they do for any element.
import type { Editor } from "@rathkit/rte-core/dom";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

/** Options an app can only pass as code (functions, plugin lists): everything in the standard editor's options except what attributes control. */
export type RkEditorOptions = Omit<StandardOptions, "element" | "html" | "readOnly">;

export class RkEditor extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "readonly", "disabled", "label", "required", "placeholder"];

  private internals: ElementInternals | undefined;
  private surface: HTMLElement | undefined;
  private current: Editor | undefined;
  private html = "";
  private defaultHtml = "";
  private opts: RkEditorOptions = {};
  private stop: (() => void) | undefined;
  private atFocus = "";
  private resolveReady: ((editor: Editor) => void) | undefined;
  private ready: Promise<Editor> = new Promise((resolve) => { this.resolveReady = resolve; });

  constructor() {
    super();
    this.internals = typeof this.attachInternals === "function" ? this.attachInternals() : undefined;
  }

  // ---- the platform's own hooks ---------------------------------------------------------------------------

  connectedCallback(): void {
    if (this.current) return;
    // Starting content: the `value` attribute, else whatever is written inside the element, else what it held before it was moved.
    if (this.html === "" && !this.hasAttribute("value")) this.html = this.innerHTML.trim();
    else if (this.html === "") this.html = this.getAttribute("value") ?? "";
    if (this.defaultHtml === "") this.defaultHtml = this.hasAttribute("value") ? (this.getAttribute("value") ?? "") : this.html;
    this.replaceChildren();
    const surface = document.createElement("div");
    surface.setAttribute("data-rk-surface", "");
    this.appendChild(surface);
    this.surface = surface;
    const label = this.getAttribute("label");
    if (label) surface.setAttribute("aria-label", label);
    else if (!this.hasAttribute("aria-label") && !this.hasAttribute("aria-labelledby")) console.warn("[rte] <rk-editor> has no name: give it a label attribute.");
    const maxLength = Number.parseInt(this.getAttribute("maxlength") ?? "", 10);
    const spellcheck = this.getAttribute("spellcheck");
    const editor = createEditor({
      ...this.opts, element: surface, html: this.html, readOnly: this.hasAttribute("readonly") || this.hasAttribute("disabled"),
      ...(this.hasAttribute("placeholder") ? { placeholder: this.getAttribute("placeholder") ?? "" } : {}),
      ...(Number.isFinite(maxLength) && maxLength >= 0 ? { maxLength } : {}),
      ...(spellcheck === "true" || spellcheck === "false" ? { spellcheck: spellcheck === "true" } : {}),
      ...(this.hasAttribute("autofocus") ? { autofocus: true } : {}),
    });
    this.current = editor;
    this.stop = editor.subscribe(() => this.changed());
    surface.addEventListener("focusin", this.onFocusIn);
    surface.addEventListener("focusout", this.onFocusOut);
    this.sync();
    this.resolveReady?.(editor);
    this.dispatchEvent(new CustomEvent("rk-ready", { bubbles: true, composed: true, detail: { editor } }));
  }

  disconnectedCallback(): void {
    const editor = this.current;
    if (!editor) return;
    this.html = editor.getHtml();
    this.stop?.();
    editor.destroy();
    this.surface?.removeEventListener("focusin", this.onFocusIn);
    this.surface?.removeEventListener("focusout", this.onFocusOut);
    this.current = undefined;
    this.surface = undefined;
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "value") {
      if (value !== null && value !== this.value) this.value = value;
    } else if (name === "readonly" || name === "disabled") {
      this.current?.setReadOnly(this.hasAttribute("readonly") || this.hasAttribute("disabled"));
    } else if (name === "placeholder") {
      this.current?.setPlaceholder(value ?? "");
    } else if (name === "label") {
      if (value) this.surface?.setAttribute("aria-label", value);
    } else if (name === "required") {
      this.sync();
    }
  }

  // ---- form association -----------------------------------------------------------------------------------

  formResetCallback(): void { this.value = this.defaultHtml; }
  formDisabledCallback(disabled: boolean): void { this.current?.setReadOnly(disabled || this.hasAttribute("readonly")); }
  formStateRestoreCallback(state: string | File | FormData | null): void { if (typeof state === "string") this.value = state; }
  get form(): HTMLFormElement | null { return this.internals?.form ?? null; }
  get name(): string { return this.getAttribute("name") ?? ""; }
  set name(value: string) { this.setAttribute("name", value); }
  get validity(): ValidityState | undefined { return this.internals?.validity; }
  checkValidity(): boolean { return this.internals?.checkValidity() ?? true; }
  reportValidity(): boolean { return this.internals?.reportValidity() ?? true; }

  // ---- the part an app uses -------------------------------------------------------------------------------

  /** The document as HTML. Setting it replaces the document and clears the undo history. */
  get value(): string { return this.current ? this.current.getHtml() : this.html; }
  set value(html: string) {
    this.html = html;
    if (this.current) this.current.setHtml(html);
    else this.defaultHtml ||= html;
    this.sync();
  }
  get readOnly(): boolean { return this.hasAttribute("readonly"); }
  set readOnly(value: boolean) { this.toggleAttribute("readonly", value); }
  /** The editor inside, once it exists: for commands, plugins and subscriptions. */
  get editor(): Editor | undefined { return this.current; }
  /** Resolves with the editor once the element is connected and the editor is built. */
  whenReady(): Promise<Editor> { return this.ready; }
  /** Options only code can give (an upload function, more plugins). Set them before the element is connected. */
  get options(): RkEditorOptions { return this.opts; }
  set options(options: RkEditorOptions) {
    if (this.current) console.warn("[rte] <rk-editor> options set after it was connected have no effect.");
    this.opts = options;
  }
  override focus(): void { this.current?.focus(); }

  // ---- inside ---------------------------------------------------------------------------------------------

  private changed(): void {
    const html = this.value;
    if (html === this.lastSent) return;
    this.lastSent = html;
    this.sync();
    this.dispatchEvent(new CustomEvent("rk-change", { bubbles: true, composed: true, detail: { html } }));
    // The plain `input` event, so code written for ordinary form fields keeps working.
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
  private lastSent = "";

  /** Brings the form value and validity up to date. */
  private sync(): void {
    const html = this.value;
    this.internals?.setFormValue(html);
    if (this.hasAttribute("required") && this.isEmpty(html)) this.internals?.setValidity({ valueMissing: true }, "Please fill in this field.", this.surface);
    else this.internals?.setValidity({});
  }
  private isEmpty(html: string): boolean { return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim() === "" && !html.includes("<img"); }

  private onFocusIn = (): void => { this.atFocus = this.value; };
  // Like a text field, `change` fires when focus leaves and the value is not what it was when focus arrived.
  private onFocusOut = (): void => { if (this.value !== this.atFocus) this.dispatchEvent(new Event("change", { bubbles: true })); };
}
