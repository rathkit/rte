// A small app using the React wrapper, in StrictMode (development), so the double run of effects is part of what is checked.
import { createElement as h, StrictMode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RteEditor, useCommand } from "@rathkit/rte-react";

const fw = (window.__fw = { ready: false, changes: [], events: [], readies: 0, commitCount: 0 });
fw.commits = () => fw.commitCount;

function Bold({ editor }) {
  const state = useCommand(editor, "format.bold");
  // Counts commits, not renders: StrictMode renders twice by design, and one commit is one change on screen.
  useEffect(() => { fw.commitCount++; });
  return h("button", { id: "bold", "aria-pressed": String(state.active), disabled: !state.enabled, onClick: () => editor.commands.run("format.bold") }, "Bold");
}

function App() {
  const [editor, setEditor] = useState(undefined);
  const [access, setAccess] = useState({});
  fw.access = (next) => setAccess(next);
  return h("div", null,
    h(Bold, { editor }),
    h(RteEditor, {
      label: "Body",
      readOnly: access.readOnly ?? false,
      disabled: access.disabled ?? false,
      defaultValue: "<p>one two three</p>",
      onChange: (html) => fw.changes.push(html),
      onFocus: () => fw.events.push("focus"),
      onBlur: () => fw.events.push("blur"),
      onSelection: (s) => fw.events.push(s.anchor && s.focus ? "selection" : "bad"),
      onReady: (e) => { fw.readies++; fw.editor = e; setEditor(e); },
    }));
}

const root = createRoot(document.getElementById("app"));
root.render(h(StrictMode, null, h(App)));
fw.destroy = () => root.unmount();
setTimeout(() => { fw.ready = true; }, 50);
// Mounts and unmounts the wrapper n times, in StrictMode, for the leak walk.
fw.cycle = async (n) => {
  for (let i = 0; i < n; i++) {
    const host = document.body.appendChild(document.createElement("div"));
    const leaf = createRoot(host);
    flushSync(() => leaf.render(h(StrictMode, null, h(RteEditor, { label: "Leak", defaultValue: "<p>leak</p>" }))));
    await new Promise((r) => setTimeout(r, 0));
    leaf.unmount();
    host.remove();
  }
};
