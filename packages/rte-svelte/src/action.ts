// `use:rteEditor={options}` turns an element into the editing surface. Options are read once; the action's `update` carries only
// `readOnly`, because rebuilding an editor under someone who is typing is never what they meant.
import type { Editor } from "@rathkit/rte-core/dom";
import type { Selection } from "@rathkit/rte-core";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

export interface RteActionOptions extends Omit<StandardOptions, "element" | "html" | "readOnly"> {
  /** The starting HTML. */
  html?: string;
  readOnly?: boolean;
  /** Called with the HTML after each change that alters it. */
  onChange?: (html: string) => void;
  /** Called once the editor exists. */
  onReady?: (editor: Editor) => void;
  /** Called when the editor gains the focus. */
  onFocus?: (editor: Editor) => void;
  /** Called when the editor loses the focus. */
  onBlur?: (editor: Editor) => void;
  /** Called when the selection moves or changes. */
  onSelection?: (selection: Selection) => void;
}

export function rteEditor(element: HTMLElement, options: RteActionOptions = {}): { update(next: RteActionOptions): void; destroy(): void } {
  const { html, readOnly, onChange: _c, onReady: _r, onFocus: _f, onBlur: _b, onSelection: _s, ...rest } = options;
  const editor = createEditor({ ...rest, element, html: html ?? "", readOnly: readOnly ?? false });
  let latest = options;
  const offs = [
    editor.on("change", (now) => latest.onChange?.(now)),
    editor.on("focus", (e) => latest.onFocus?.(e)),
    editor.on("blur", (e) => latest.onBlur?.(e)),
    editor.on("selection", (selection) => latest.onSelection?.(selection)),
  ];
  const stop = (): void => { for (const off of offs) off(); };
  options.onReady?.(editor);
  return {
    update(next) {
      latest = next;
      editor.setReadOnly(next.readOnly ?? false);
    },
    destroy() {
      stop();
      editor.destroy();
    },
  };
}
