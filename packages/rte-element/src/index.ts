// @rathkit/rte-element: the editor as custom elements. Importing this module defines nothing; call `define()` (or import
// `@rathkit/rte-element/define`) to register <rte-editor> and <rte-toolbar>.
import { RteEditorElement, type RteElementOptions } from "./editor-element.ts";
import { RteToolbarElement } from "./toolbar-element.ts";

export { RteEditorElement, RteToolbarElement, type RteElementOptions };

/** Registers the elements. Safe to call more than once, and does nothing where there is no `customElements` (a server). */
export function define(names: { readonly editor?: string; readonly toolbar?: string } = {}): void {
  if (typeof customElements === "undefined") return;
  const editor = names.editor ?? "rte-editor";
  const toolbar = names.toolbar ?? "rte-toolbar";
  if (!customElements.get(editor)) customElements.define(editor, RteEditorElement);
  if (!customElements.get(toolbar)) customElements.define(toolbar, RteToolbarElement);
}
