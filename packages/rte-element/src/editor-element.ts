// <rte-editor>: the editor as a custom element, for any page or framework. It draws no chrome (see <rte-toolbar> or your own); it is the
// editing surface, with a form value, properties, attributes and events. It uses the light DOM, like the rest of the editor, so
// selection, labels and styles from the page behave as they do for any element.
import type { Editor } from "@rathkit/rte-core/dom";
import type { Warning } from "@rathkit/rte-core";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

/** Options an app can only pass as code (functions, plugin lists): everything in the standard editor's options except what attributes control. */
export type RteElementOptions = Omit<StandardOptions, "element" | "html" | "readOnly" | "disabled">;

export class RteEditorElement extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "readonly", "disabled", "label", "required", "placeholder"];

  private internals: ElementInternals | undefined;
  private surface: HTMLElement | undefined;
  private current: Editor | undefined;
  private html = "";
  private defaultHtml = "";
  private opts: RteElementOptions = {};
  private stop: (() => void) | undefined;
  private atFocus = "";
  /** Whether a disabled `<fieldset>` around the element disables it. */
  private formDisabled = false;
  private resolveReady: ((editor: Editor) => void) | undefined;
  private ready: Promise<Editor> = new Promise((resolve) => { this.resolveReady = resolve; });

  constructor() {
    super();
    this.internals = typeof this.attachInternals === "function" ? this.attachInternals() : undefined;
  }

  /** Problems found before there is an editor to report them, on the same channel (`options.onWarning`, else the console). */
  private warn(warning: Warning): void {
    try { (this.opts.onWarning ?? ((w: Warning) => console.warn(`[rte] ${w.code}: ${w.message}`)))(warning); } catch { /* the handler's own failure is not ours to raise */ }
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
    surface.setAttribute("data-rte-surface", "");
    this.appendChild(surface);
    this.surface = surface;
    const label = this.getAttribute("label");
    if (label) surface.setAttribute("aria-label", label);
    else if (!this.hasAttribute("aria-label") && !this.hasAttribute("aria-labelledby")) this.warn({ code: "missing-label", message: "<rte-editor> has no name: give it a label attribute." });
    const maxLength = Number.parseInt(this.getAttribute("maxlength") ?? "", 10);
    const spellcheck = this.getAttribute("spellcheck");
    // `content="strict"` (or standard, loose) picks the content profile; single choices given as the `content` option still apply on top of it.
    const profile = this.getAttribute("content");
    const known = profile === "strict" || profile === "standard" || profile === "loose";
    if (profile !== null && !known) this.warn({ code: "bad-option", message: `<rte-editor content="${profile}"> is not a content profile: use strict, standard or loose.` });
    const editor = createEditor({
      ...this.opts, element: surface, html: this.html, readOnly: this.hasAttribute("readonly"), disabled: this.hasAttribute("disabled") || this.formDisabled,
      ...(this.hasAttribute("placeholder") ? { placeholder: this.getAttribute("placeholder") ?? "" } : {}),
      ...(known ? { content: { ...this.opts.content, profile } } : {}),
      ...(Number.isFinite(maxLength) && maxLength >= 0 ? { maxLength } : {}),
      ...(spellcheck === "true" || spellcheck === "false" ? { spellcheck: spellcheck === "true" } : {}),
      ...(this.hasAttribute("autofocus") ? { autofocus: true } : {}),
    });
    this.current = editor;
    const offs = [
      editor.on("change", (html) => this.changed(html)),
      editor.on("focus", () => this.announce("rte-focus", {})),
      editor.on("blur", () => this.announce("rte-blur", {})),
      editor.on("selection", (selection) => this.announce("rte-selection", { selection })),
    ];
    this.stop = () => { for (const off of offs) off(); };
    surface.addEventListener("focusin", this.onFocusIn);
    surface.addEventListener("focusout", this.onFocusOut);
    this.sync();
    this.resolveReady?.(editor);
    this.announce("rte-ready", { editor });
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
      this.current?.setReadOnly(this.hasAttribute("readonly"));
      this.current?.setDisabled(this.hasAttribute("disabled") || this.formDisabled);
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
  formDisabledCallback(disabled: boolean): void { this.formDisabled = disabled; this.current?.setDisabled(disabled || this.hasAttribute("disabled")); }
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
  get disabled(): boolean { return this.hasAttribute("disabled") || this.formDisabled; }
  set disabled(value: boolean) { this.toggleAttribute("disabled", value); }
  /** The editor inside, once it exists: for commands, plugins and subscriptions. */
  get editor(): Editor | undefined { return this.current; }
  /** Resolves with the editor once the element is connected and the editor is built. */
  whenReady(): Promise<Editor> { return this.ready; }
  /** Options only code can give (an upload function, more plugins). Set them before the element is connected. */
  get options(): RteElementOptions { return this.opts; }
  set options(options: RteElementOptions) {
    if (this.current) this.warn({ code: "late-options", message: "<rte-editor> options set after it was connected have no effect." });
    this.opts = options;
  }
  override focus(): void { this.current?.focus(); }

  // ---- inside ---------------------------------------------------------------------------------------------

  private changed(html: string): void {
    this.sync();
    this.announce("rte-change", { html });
    // The plain `input` event, so code written for ordinary form fields keeps working.
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
  private announce(name: string, detail: object): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  /** Brings the form value and validity up to date. */
  private sync(): void {
    const html = this.value;
    this.internals?.setFormValue(html);
    if (this.hasAttribute("required") && this.isEmpty(html)) this.internals?.setValidity({ valueMissing: true }, "Please fill in this field.", this.surface);
    else this.internals?.setValidity({});
  }
  private isEmpty(html: string): boolean {
    if (html.includes("<img")) return false;
    // The text outside the tags, read once: a "<" that never closes counts as text.
    let text = "";
    let open = -1;
    for (let i = 0; i < html.length; i++) {
      const ch = html[i] as string;
      if (open >= 0) { if (ch === ">") open = -1; } else if (ch === "<") open = i; else text += ch;
    }
    if (open >= 0) text += html.slice(open);
    return text.replace(/&nbsp;/g, "").trim() === "";
  }

  private onFocusIn = (): void => { this.atFocus = this.value; };
  // Like a text field, `change` fires when focus leaves and the value is not what it was when focus arrived.
  private onFocusOut = (): void => { if (this.value !== this.atFocus) this.dispatchEvent(new Event("change", { bubbles: true })); };
}
