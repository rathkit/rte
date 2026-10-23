import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "./core.ts";
import { lists } from "./lists/index.ts";
import { UiRegistry } from "./ui.ts";

test("items come back grouped (groups in order of first appearance), then by order, then as added", () => {
  const ui = new UiRegistry();
  ui.add("bar", { kind: "button", id: "b", command: "x", group: "two", order: 1 });
  ui.add("bar", { kind: "button", id: "a", command: "x", group: "one", order: 2 });
  ui.add("bar", { kind: "button", id: "c", command: "x", group: "one", order: 1 });
  ui.add("bar", { kind: "button", id: "d", command: "x", group: "two", order: 1 });
  assert.deepEqual(ui.items("bar").map((i) => i.id), ["b", "d", "c", "a"]);
  assert.deepEqual(ui.items("empty"), []);
});

test("the same array is returned until the slot changes; ids are unique within a slot; removal and subscription work", () => {
  const ui = new UiRegistry();
  const remove = ui.add("bar", { kind: "separator", id: "s" });
  const first = ui.items("bar");
  assert.equal(ui.items("bar"), first);
  assert.throws(() => ui.add("bar", { kind: "separator", id: "s" }), /already has an item s/);
  ui.add("other", { kind: "separator", id: "s" });
  let heard = 0;
  ui.subscribe("bar", () => heard++);
  ui.add("bar", { kind: "separator", id: "t" });
  assert.equal(heard, 1);
  assert.notEqual(ui.items("bar"), first);
  remove();
  assert.deepEqual(ui.items("bar").map((i) => i.id), ["t"]);
  assert.equal(heard, 2);
});

test("the editor offers its own items, plugins add theirs, and removing a plugin takes them away", () => {
  const e = createEngine({ onWarning: () => undefined });
  const ids = () => e.ui.items("toolbar.main").map((i) => i.id);
  assert.ok(ids().includes("bold") && ids().includes("block") && ids().includes("link"));
  assert.ok(!ids().includes("list-bulleted"));
  const remove = e.use(lists());
  assert.ok(ids().includes("list-bulleted") && ids().includes("indent"));
  remove();
  assert.ok(!ids().includes("list-bulleted"));
  // Every item that names a command names one that exists.
  e.use(lists());
  for (const item of e.ui.items("toolbar.main")) if ("command" in item) assert.ok(e.commands.has(item.command), item.id);
});

test("choosing a heading level sets exactly that level; zero is a paragraph", () => {
  const e = createEngine({ onWarning: () => undefined });
  assert.equal(e.commands.run("block.heading", 2), true);
  assert.equal(e.commands.state("block.heading").value, 2);
  assert.equal(e.commands.run("block.heading", 2), false, "already in it");
  assert.equal(e.commands.run("block.heading", 0), true);
  assert.equal(e.commands.state("block.heading").value, 0);
});
