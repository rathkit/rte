// @rathkit/rte-element: the editor as custom elements. Importing this module defines nothing; call `define()` (or import
// `@rathkit/rte-element/define`) to register <rk-editor> and <rk-toolbar>.
import { RteEditorElement, type RteElementOptions } from "./editor-element.ts";
import { RteToolbarElement } from "./toolbar-element.ts";

export { RteEditorElement, RteToolbarElement, type RteElementOptions };

/** Registers the elements. Safe to call more than once. */
export function define(names: { readonly editor?: string; readonly toolbar?: string } = {}): void {
  const editor = names.editor ?? "rk-editor";
  const toolbar = names.toolbar ?? "rk-toolbar";
  if (!customElements.get(editor)) customElements.define(editor, RteEditorElement);
  if (!customElements.get(toolbar)) customElements.define(toolbar, RteToolbarElement);
}
