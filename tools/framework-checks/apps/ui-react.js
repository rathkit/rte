// <rk-ui> and <rk-editor> used from a React template, as any custom element is: attributes come from state.
import { createElement as h, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "@rathkit/rte-element/define";
import "@rathkit/rte-ui/element/define";

const fw = (window.__fw = { ready: false });

function App() {
  const [theme, setTheme] = useState("light");
  return h("div", null,
    h("button", { id: "flip", onClick: () => setTheme((t) => (t === "light" ? "dark" : "light")) }, "Flip"),
    h("rk-ui", { theme, "selection-toolbar": true, "context-menu": true },
      h("rk-editor", { label: "Body", value: "<p>one two three</p>" })));
}
const root = createRoot(document.getElementById("app"));
root.render(h(StrictMode, null, h(App)));
fw.destroy = () => root.unmount();
setTimeout(() => { fw.ready = true; }, 100);
