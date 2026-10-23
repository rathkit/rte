import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText } from "@rathkit/rte-core";
import { command, selector } from "./stores.ts";

const setup = (html: string) => {
  const engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, editor };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const select = (a: number, b: number) => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });

test("a command store is called at once, then once per change of the command's state, and not after it stops", async () => {
  const { engine, editor } = setup("<p>one two</p>");
  const seen: string[] = [];
  const stop = command(editor, "format.bold").subscribe((s) => seen.push(`${s.enabled}/${s.active}`));
  for (let i = 0; i < 20; i++) { engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick(); }
  assert.deepEqual(seen, ["false/false"]);
  engine.setSelection(select(0, 3)); await tick();
  engine.commands.run("format.bold"); await tick();
  assert.deepEqual(seen, ["false/false", "true/false", "true/true"]);
  stop();
  engine.commands.run("format.bold"); await tick();
  assert.equal(seen.length, 3);
});

test("a selector store hears only about changes in the selected value", async () => {
  const { engine, editor } = setup("<p>one</p>");
  const seen: number[] = [];
  selector(editor, (s) => s.doc.blocks.length).subscribe((n) => seen.push(n));
  engine.apply("type", (doc, sel) => insertText(doc, sel, "x")); await tick();
  engine.apply("other", () => ({ doc: importHtml("<p>a</p><p>b</p>"), selection: select(0, 0) })); await tick();
  assert.deepEqual(seen, [1, 2]);
});
