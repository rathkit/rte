// `use:rteEditor={options}` turns an element into the editing surface. Options are read once; the action's `update` carries only
// `readOnly`, because rebuilding an editor under someone who is typing is never what they meant.
import type { Editor } from "@rathkit/rte-core/dom";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

export interface RteActionOptions extends Omit<StandardOptions, "element" | "html" | "readOnly"> {
  /** The starting HTML. */
  html?: string;
  readOnly?: boolean;
  /** Called with the HTML after each change that alters it. */
  onChange?: (html: string) => void;
  /** Called once the editor exists. */
  onReady?: (editor: Editor) => void;
}

export function rteEditor(element: HTMLElement, options: RteActionOptions = {}): { update(next: RteActionOptions): void; destroy(): void } {
  const { html, readOnly, onChange: _c, onReady: _r, ...rest } = options;
  const editor = createEditor({ ...rest, element, html: html ?? "", readOnly: readOnly ?? false });
  let latest = options;
  let last = editor.getHtml();
  const stop = editor.subscribe(() => {
    const now = editor.getHtml();
    if (now === last) return;
    last = now;
    latest.onChange?.(now);
  });
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
