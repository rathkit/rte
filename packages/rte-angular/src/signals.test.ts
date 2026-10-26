import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText } from "@rathkit/rte-core";
import { effect, runInContext, signal } from "../test/angular-stub.ts";
import { commandState, selected } from "./signals.ts";

const setup = (html: string) => {
  const engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, editor };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const select = (a: number, b: number) => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });

test("a command signal wakes its readers once per change of the command's state, not per edit", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const holder = signal<typeof editor | undefined>(editor);
  const { result: bold, dispose } = runInContext(() => commandState(holder, "format.bold"));
  let woke = 0;
  effect(() => { bold(); woke++; });
  woke = 0;
  for (let i = 0; i < 25; i++) engine.apply("type", (doc, sel) => insertText(doc, sel, "x"));
  await tick();
  assert.equal(woke, 0);
  engine.setSelection(select(0, 3)); await tick();
  assert.equal(woke, 0, "a selection does not change what bold reports");
  engine.commands.run("format.bold"); await tick();
  assert.equal(woke, 1);
  assert.equal(bold().active, true);
  dispose();
  engine.commands.run("format.bold"); await tick();
  assert.equal(woke, 1, "stopped with the context");
});

test("a signal is idle until the editor exists, then follows it, and goes idle again when it goes", async () => {
  const { engine, editor } = setup("<p>one</p>");
  const holder = signal<typeof editor | undefined>(undefined);
  const { result: bold, dispose } = runInContext(() => commandState(holder, "format.bold"));
  assert.deepEqual({ ...bold() }, { enabled: false, active: false, value: undefined });
  holder.set(editor); await tick();
  engine.setSelection(select(0, 3)); await tick();
  engine.commands.run("format.bold"); await tick();
  assert.equal(bold().active, true);
  holder.set(undefined); await tick();
  assert.equal(bold().active, false);
  dispose();
});

test("a selected value changes its signal only when the value changes", async () => {
  const { engine, editor } = setup("<p>one</p><p>two</p>");
  const holder = signal<typeof editor | undefined>(editor);
  const { result: blocks, dispose } = runInContext(() => selected(holder, (s) => s.doc.blocks.length));
  let woke = 0;
  effect(() => { blocks(); woke++; });
  woke = 0;
  for (let i = 0; i < 10; i++) engine.apply("type", (doc, sel) => insertText(doc, sel, "x"));
  await tick();
  assert.equal(woke, 0);
  assert.equal(blocks(), 2);
  dispose();
});
