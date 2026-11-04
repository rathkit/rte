// <rte-ui>: the styled interface as a custom element. It wraps an <rte-editor> (from @rathkit/rte-element) and gives it the toolbar, find bar,
// status line, dialogs and, when asked for, the selection toolbar and context menu: the same interface `createUi` builds, by attributes.
//
//   <rte-ui theme="light" selection-toolbar context-menu>
//     <rte-editor label="Notes"></rte-editor>
//   </rte-ui>
//
// It draws inside the <rte-editor>, so the editor's form value, events and properties are unchanged. Load `base.css` and a theme's CSS.
import { createStandardUi } from "./standard.ts";
import type { StyleProvider, Ui, UiEditor } from "./types.ts";

/** The part of <rte-editor> this needs: the editor once it exists. */
type Host = HTMLElement & { readonly editor?: unknown };

const STYLE_ATTRIBUTES = ["theme", "scheme", "density"] as const;

export class RteUiElement extends HTMLElement {
  static observedAttributes = [...STYLE_ATTRIBUTES, "selection-toolbar", "context-menu", "status"];

  private current: Ui | undefined;
  private extra: StyleProvider = {};

  connectedCallback(): void {
    // The editor inside says when it is built (it may be defined after this element).
    this.addEventListener("rte-ready", this.onReady);
    this.attach();
  }

  disconnectedCallback(): void {
    this.removeEventListener("rte-ready", this.onReady);
    this.detach();
  }

  attributeChangedCallback(name: string): void {
    if (!this.current) return;
    if ((STYLE_ATTRIBUTES as readonly string[]).includes(name)) this.current.setStyle(this.look());
    else {
      // These are read when the interface is built, so it is built again.
      this.detach();
      this.attach();
    }
  }

  /** The interface, once it is built. */
  get ui(): Ui | undefined { return this.current; }

  /**
   * Everything about the look that attributes cannot say: icons, messages, tokens, classes. The `theme`, `scheme` and `density`
   * attributes win over the same names here.
   */
  get styleProvider(): StyleProvider { return this.extra; }
  set styleProvider(style: StyleProvider) {
    this.extra = style;
    this.current?.setStyle(this.look());
  }

  private readonly onReady = (): void => { if (!this.current) this.attach(); };

  private look(): StyleProvider {
    const given: Record<string, string> = {};
    for (const name of STYLE_ATTRIBUTES) {
      const value = this.getAttribute(name);
      if (value) given[name] = value;
    }
    return { ...this.extra, ...given };
  }

  private attach(): void {
    const host = this.querySelector<Host>("rte-editor");
    const editor = host?.editor;
    if (!host || !editor || this.current) return;
    this.current = createStandardUi(editor as UiEditor, {
      root: host, style: this.look(),
      selectionToolbar: this.hasAttribute("selection-toolbar"),
      contextMenu: this.hasAttribute("context-menu"),
      status: this.getAttribute("status") !== "false",
    });
  }

  private detach(): void {
    this.current?.destroy();
    this.current = undefined;
  }
}

/** Registers <rte-ui>. Safe to call more than once. */
export function defineUi(name = "rte-ui"): void {
  if (!customElements.get(name)) customElements.define(name, RteUiElement);
}
