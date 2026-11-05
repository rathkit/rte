// The Svelte wrapper is stores and an action, so it is checked against Svelte's own store helpers: the contract Svelte components use.
import { derived, get } from "svelte/store";
import { command, rteEditor, selector } from "@rathkit/rte-svelte";

const fw = (window.__fw = { ready: false, changes: [], events: [], readies: 0, commitCount: 0, extra: {} });
fw.commits = () => fw.commitCount;

const surface = document.getElementById("surface");
const bold = document.getElementById("bold");
surface.setAttribute("aria-label", "Body");
const config = {
  html: "<p>one two three</p>",
  onChange: (html) => fw.changes.push(html),
  onFocus: () => fw.events.push("focus"),
  onBlur: () => fw.events.push("blur"),
  onSelection: (s) => fw.events.push(s.anchor && s.focus ? "selection" : "bad"),
  onReady: (editor) => { fw.readies++; fw.editor = editor; },
};
const action = rteEditor(surface, config);
fw.access = (next) => action.update({ ...config, ...next });
const state = command(fw.editor, "format.bold");
const active = derived(state, (s) => s.active);
const count = selector(fw.editor, (s) => s.doc.blocks.length);
const stops = [
  state.subscribe((s) => {
    fw.commitCount++;
    bold.setAttribute("aria-pressed", String(s.active));
    bold.disabled = !s.enabled;
  }),
];
bold.addEventListener("click", () => fw.editor.commands.run("format.bold"));
fw.extra = { active: () => get(active), blocks: () => get(count) };
fw.destroy = () => { stops.forEach((s) => s()); action.destroy(); };
setTimeout(() => { fw.ready = true; }, 50);
// Uses and destroys the action n times, for the leak walk.
fw.cycle = async (n) => {
  for (let i = 0; i < n; i++) {
    const host = document.body.appendChild(document.createElement("div"));
    const leaf = rteEditor(host, { html: "<p>leak</p>" });
    leaf.update({ html: "<p>leak</p>", readOnly: true });
    leaf.destroy();
    host.remove();
  }
};
