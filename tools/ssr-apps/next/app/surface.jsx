"use client";
import { useState } from "react";
import { RteEditor, useCommand } from "@rathkit/rte-react";

function Bold({ editor }) {
  const state = useCommand(editor, "format.bold");
  return (
    <button id="bold" aria-pressed={String(state.active)} disabled={!state.enabled} onClick={() => editor.commands.run("format.bold")}>
      Bold
    </button>
  );
}

export default function Surface() {
  const [editor, setEditor] = useState(undefined);
  return (
    <>
      <Bold editor={editor} />
      <RteEditor label="Body" defaultValue="<p>one two three</p>" onReady={(e) => { window.__ssr = { ready: true, editor: e }; setEditor(e); }} />
    </>
  );
}
