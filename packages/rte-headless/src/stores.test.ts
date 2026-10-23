import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText } from "@rathkit/rte-core";
import { commandStore, selectStore, snapshotStore, toReadable } from "./stores.ts";

const setup = (html: string) => {
  const engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, editor };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test("a command store gives the same state object until the state changes, and wakes only for real changes", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const store = commandStore(editor, "format.bold");
  let woke = 0;
  const stop = store.subscribe(() => woke++);
  const first = store.getSnapshot();
  assert.equal(store.getSnapshot(), first);
  for (let i = 0; i < 10; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); }
  assert.equal(woke, 0);
  assert.equal(store.getSnapshot(), first);
  engine.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 3 } });
  await tick();
  assert.equal(woke, 0, "selecting text does not change what bold reports");
  engine.commands.run("format.bold");
  await tick();
  assert.equal(woke, 1);
  assert.notEqual(store.getSnapshot(), first);
  stop();
  engine.commands.run("format.bold");
  await tick();
  assert.equal(woke, 1, "stopped");
});

test("a select store remembers its value per editor state and only wakes when the selected value changes", async () => {
  const { engine, editor } = setup("<p>one</p>");
  let calls = 0;
  const words = selectStore(editor as never, (s) => { calls++; return s.doc.blocks.length; });
  let woke = 0;
  words.subscribe(() => woke++);
  const a = words.getSnapshot();
  const callsAfterFirst = calls;
  words.getSnapshot();
  assert.equal(calls, callsAfterFirst, "asked twice, worked out once");
  engine.apply("type", (doc, sel) => insertText(doc, sel, "x"));
  await tick();
  assert.equal(woke, 0);
  assert.equal(words.getSnapshot(), a);
  engine.apply("split", (doc, sel) => ({ doc: importHtml("<p>a</p><p>b</p>"), selection: sel }));
  await tick();
  assert.equal(woke, 1);
  assert.equal(words.getSnapshot(), 2);
});

test("the snapshot store follows the editor", async () => {
  const { engine, editor } = setup("<p>x</p>");
  const store = snapshotStore(editor as never);
  let woke = 0;
  store.subscribe(() => woke++);
  engine.setFocused(true);
  await tick();
  assert.equal(woke, 1);
});

test("a readable follows the Svelte store contract: now, on each change, and not after it stops", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const seen: boolean[] = [];
  const stop = toReadable(commandStore(editor, "format.bold")).subscribe((s) => seen.push(s.active));
  assert.deepEqual(seen, [false], "called at once");
  engine.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 3 } });
  engine.commands.run("format.bold");
  await tick();
  assert.deepEqual(seen, [false, true]);
  stop();
  engine.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 0 } });
  await tick();
  assert.deepEqual(seen, [false, true]);
});
