import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText } from "@rathkit/rte-core";
import { runInScope, shallowRef, watch } from "../test/vue-stub.ts";
import { useCommand, useSelector } from "./composables.ts";

const setup = (html: string) => {
  const engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, editor };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const select = (a: number, b: number) => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });

test("a command ref wakes its watchers once per change of the command's state, not per edit", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const { result: bold, dispose } = runInScope(() => useCommand(editor, "format.bold"));
  let woke = 0;
  watch(() => bold.value, () => woke++);
  for (let i = 0; i < 25; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); }
  assert.equal(woke, 0);
  engine.setSelection(select(0, 3)); await tick();
  assert.equal(woke, 0, "a selection does not change what bold reports");
  engine.commands.run("format.bold"); await tick();
  assert.equal(woke, 1);
  assert.equal(bold.value.active, true);
  dispose();
  engine.commands.run("format.bold"); await tick();
  assert.equal(woke, 1, "stopped with the scope");
});

test("an editor that arrives later through a ref is picked up, and one that leaves is let go", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const target = shallowRef<typeof editor | undefined>(undefined);
  const { result: bold } = runInScope(() => useCommand(target, "format.bold"));
  assert.equal(bold.value.enabled, false);
  target.value = editor;
  engine.setSelection(select(0, 3)); await tick();
  assert.equal(bold.value.enabled, true);
  target.value = undefined;
  assert.equal(bold.value.enabled, false);
});

test("a selector ref changes only when the selected value does", async () => {
  const { engine, editor } = setup("<p>one</p>");
  const { result: count } = runInScope(() => useSelector(editor, (s) => s.doc.blocks.length));
  let woke = 0;
  watch(() => count.value, () => woke++);
  for (let i = 0; i < 10; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); }
  assert.equal(woke, 0);
  engine.apply("other", () => ({ doc: importHtml("<p>a</p><p>b</p>"), selection: select(0, 0) })); await tick();
  assert.equal(count.value, 2);
  assert.equal(woke, 1);
});
