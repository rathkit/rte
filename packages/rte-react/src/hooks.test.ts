import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText } from "@rathkit/rte-core";
import { render } from "../test/react-stub.ts";
import { useCommand, useSelector } from "./hooks.ts";

const setup = (html: string) => {
  const engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, editor };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const select = (a: number, b: number) => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });
const blocks = (s: { doc: { blocks: readonly unknown[] } }) => s.doc.blocks.length;

test("after many edits the bold button has rendered once for each change of its state", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const view = render(() => useCommand(editor, "format.bold"));
  assert.equal(view.renders, 1);
  for (let i = 0; i < 25; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); view.flush(); }
  assert.equal(view.renders, 1, "typing does not touch bold");
  engine.setSelection(select(0, 3)); await tick(); view.flush();
  assert.equal(view.renders, 1, "a selection does not change what bold reports");
  engine.commands.run("format.bold"); await tick(); view.flush();
  assert.equal(view.renders, 2, "turning it on");
  engine.setSelection(select(0, 2)); await tick(); view.flush();
  assert.equal(view.renders, 2, "a different selection with the same state");
  view.unmount();
  engine.commands.run("format.bold"); await tick();
  assert.equal(view.renders, 2, "nothing after unmount");
});

test("a command hook before the editor exists is off, then follows the editor", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  let target: typeof editor | undefined;
  const view = render(() => useCommand(target, "format.bold"));
  assert.deepEqual([view.output.enabled, view.output.active], [false, false]);
  target = editor;
  // a new render with the editor present, as React gives when state holding the editor is set
  const again = render(() => useCommand(target, "format.bold"));
  engine.setSelection(select(0, 3)); await tick(); again.flush();
  assert.equal(again.output.enabled, true);
});

test("a selector hook re-renders only when the selected value changes", async () => {
  const { engine, editor } = setup("<p>one</p>");
  const view = render(() => useSelector(editor, blocks));
  assert.equal(view.output, 1);
  for (let i = 0; i < 10; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); view.flush(); }
  assert.equal(view.renders, 1);
  engine.apply("other", () => ({ doc: importHtml("<p>a</p><p>b</p>"), selection: select(0, 0) })); await tick(); view.flush();
  assert.equal(view.renders, 2);
  assert.equal(view.output, 2);
});
