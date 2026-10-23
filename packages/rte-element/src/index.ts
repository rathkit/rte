// @rathkit/rte-element: the editor as custom elements. Importing this module defines nothing; call `define()` (or import
// `@rathkit/rte-element/define`) to register <rk-editor> and <rk-toolbar>.
import { RkEditor, type RkEditorOptions } from "./editor-element.ts";
import { RkToolbar } from "./toolbar-element.ts";

export { RkEditor, RkToolbar, type RkEditorOptions };

/** Registers the elements. Safe to call more than once. */
export function define(names: { readonly editor?: string; readonly toolbar?: string } = {}): void {
  const editor = names.editor ?? "rk-editor";
  const toolbar = names.toolbar ?? "rk-toolbar";
  if (!customElements.get(editor)) customElements.define(editor, RkEditor);
  if (!customElements.get(toolbar)) customElements.define(toolbar, RkToolbar);
}
