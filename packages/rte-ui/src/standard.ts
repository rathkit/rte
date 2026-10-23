// createUi with the default icons already in the style. Importing this pulls in the whole default icon set; import `createUi` from the
// package itself and pass the icons you want if you would rather ship fewer.
import { defaultIcons } from "@rathkit/rte-icons";
import { createUi } from "./ui.ts";
import type { Ui, UiEditor, UiOptions } from "./types.ts";

export function createStandardUi(editor: UiEditor, options: UiOptions): Ui {
  return createUi(editor, { ...options, defaults: { ...options.defaults, icons: { ...defaultIcons, ...options.defaults?.icons } } });
}

export { createUi };
export type { Ui, UiEditor, UiOptions };
