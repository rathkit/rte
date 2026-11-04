// The editing surface. The editor is built when the surface appears and torn down when it goes; options are read once, as the custom
// element reads them, because rebuilding an editor under someone who is typing is never what they meant.
import { createElement, useEffect, useRef, useState } from "react";
import type { Editor } from "@rathkit/rte-core/dom";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

export type RteOptions = Omit<StandardOptions, "element" | "html" | "readOnly">;

export interface RteEditorProps extends RteOptions {
  /** The starting HTML. Later changes to this prop are ignored: call `editor.setHtml` to replace the document. */
  defaultValue?: string;
  readOnly?: boolean;
  /** The name screen readers announce for the editing surface. Required: an unnamed editor is an accessibility fault. */
  label: string;
  className?: string;
  /** Called with the HTML after each change that alters it. */
  onChange?: (html: string) => void;
  /** Called once the editor exists, with the editor to run commands on and subscribe to. */
  onReady?: (editor: Editor) => void;
}

/** The hook behind `RteEditor`, for those who draw their own surface: give `ref` to one element. */
export function useRteEditor(props: Omit<RteEditorProps, "label" | "className">): { ref: (element: HTMLElement | null) => void; editor: Editor | undefined } {
  const [element, ref] = useState<HTMLElement | null>(null);
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  // Built in an effect so that React's development double-run (build, tear down, build) is harmless.
  useEffect(() => {
    if (!element) return;
    const { defaultValue, readOnly, onChange: _c, onReady: _r, ...options } = latest.current;
    const made = createEditor({ ...(options as RteOptions), element, html: defaultValue ?? "", readOnly: readOnly ?? false });
    let last = made.getHtml();
    const stop = made.subscribe(() => {
      const html = made.getHtml();
      if (html === last) return;
      last = html;
      latest.current.onChange?.(html);
    });
    setEditor(made);
    latest.current.onReady?.(made);
    return () => {
      stop();
      made.destroy();
      setEditor(undefined);
    };
  }, [element]);
  useEffect(() => { editor?.setReadOnly(props.readOnly ?? false); }, [editor, props.readOnly]);
  return { ref, editor };
}

/** The editing surface as a component. */
export function RteEditor(props: RteEditorProps): unknown {
  const { label, className, ...rest } = props;
  const { ref } = useRteEditor(rest);
  return createElement("div", { ref, "aria-label": label, className, "data-rte-surface": "" });
}
