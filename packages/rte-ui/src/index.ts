// @rathkit/rte-ui: the styled editor interface. `createUi(editor, { root, style })` builds a toolbar and dialogs from the editor's interface
// items, on the headless layer, and styles them with tokens. Load `base.css` and a theme from @rathkit/rte-themes. Icons: pass them in
// `style.icons`, or use `@rathkit/rte-ui/standard`, which brings the default set.
export { createUi } from "./ui.ts";
export { DEFAULT_MESSAGES } from "./messages.ts";
export type { MessageKey, PartContext, PartName, StyleProvider, Ui, UiEditor, UiOptions } from "./types.ts";
