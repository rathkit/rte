import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine, importHtml, insertText, type Engine } from "@rathkit/rte-core";
import { lists } from "@rathkit/rte-core/lists";
import { createToolbar } from "./toolbar.ts";

const setup = (html: string) => {
  const engine: Engine = createEngine({ doc: importHtml(html), platform: "other", onWarning: () => undefined });
  engine.use(lists());
  const editor = { commands: engine.commands, keymap: engine.keymap, ui: engine.ui, get snapshot() { return engine.snapshot; }, subscribe: engine.subscribe.bind(engine), select: engine.select.bind(engine), focus: () => undefined };
  return { engine, toolbar: createToolbar(editor) };
};
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const range = (a: number, b: number) => ({ anchor: { path: [0], offset: a }, focus: { path: [0], offset: b } });

test("items come in display order, each with a name, an icon and the key that runs it", () => {
  const { toolbar } = setup("<p>hello</p>");
  const ids = toolbar.items.map((i) => i.id);
  assert.deepEqual(ids.slice(0, 5), ["undo", "redo", "block", "bold", "italic"]);
  const bold = toolbar.state("bold");
  assert.equal(bold?.label, "Bold");
  assert.equal(bold?.icon, "bold");
  assert.equal(bold?.shortcut, "Control+B");
  assert.equal(bold?.shortcutLabel, "Ctrl+B");
  for (const id of ids) assert.ok(toolbar.state(id)?.label, `${id} has no name`);
  assert.equal(toolbar.state("nope"), undefined);
});

test("a toggle is available at a caret, on when the selected text has the mark, and its state object only changes when the state does", async () => {
  const { engine, toolbar } = setup("<p>one two three</p>");
  assert.equal(toolbar.state("bold")?.disabled, false, "a caret can choose bold for the text typed next");
  engine.setSelection(range(4, 7));
  assert.equal(toolbar.state("bold")?.disabled, false);
  assert.equal(toolbar.state("bold")?.pressed, false);
  const before = toolbar.state("bold");
  assert.equal(toolbar.state("bold"), before, "same object while nothing changed");
  assert.equal(toolbar.activate("bold"), true);
  assert.equal(toolbar.state("bold")?.pressed, true);
  assert.notEqual(toolbar.state("bold"), before);
  // Moving from one selection to another does not change italic's state, so the very same object comes back.
  const italic = toolbar.state("italic");
  engine.setSelection(range(0, 3));
  assert.equal(toolbar.state("italic"), italic);
  await tick();
});

test("a toggle with an argument is on when the command's value is that argument", () => {
  const { engine, toolbar } = setup('<p style="text-align:center">x</p>');
  engine.setSelection(range(0, 0));
  assert.equal(toolbar.state("align-center")?.pressed, true);
  assert.equal(toolbar.state("align-left")?.pressed, false);
  assert.equal(toolbar.activate("align-right"), true);
  assert.equal(toolbar.state("align-right")?.pressed, true);
  assert.equal(toolbar.state("align-center")?.pressed, false);
});

test("a select reports its current value and runs the command with the chosen one", () => {
  const { engine, toolbar } = setup("<p>x</p>");
  engine.setSelection(range(0, 0));
  assert.equal(toolbar.state("block")?.value, 0);
  assert.equal(toolbar.activate("block", 2), true);
  assert.equal(toolbar.state("block")?.value, 2);
  assert.equal(toolbar.activate("block", 2), false, "choosing what is already chosen changes nothing");
});

test("subscribers hear about real changes once per turn, and not about typing", async () => {
  const { engine, toolbar } = setup("<p>one two three</p>");
  engine.setSelection({ anchor: { path: [0], offset: 3 }, focus: { path: [0], offset: 3 } });
  // The first keystroke legitimately turns Undo on; after that, typing changes nothing a toolbar shows.
  engine.apply("type", (doc, sel) => insertText(doc, sel, "x"));
  await tick();
  await tick();
  let heard = 0;
  toolbar.subscribe(() => heard++);
  for (let i = 0; i < 20; i++) {
    engine.apply("type", (doc, sel) => insertText(doc, sel, "x"));
    await tick();
    await tick();
  }
  assert.equal(heard, 0, "typing woke the toolbar");
  engine.setSelection(range(0, 3));
  await tick();
  await tick();
  assert.equal(heard, 1);
  engine.commands.run("format.bold");
  engine.commands.run("block.heading", 1);
  await tick();
  await tick();
  assert.equal(heard, 2, "two changes in one turn are one notification");
});

test("items added later appear, and a destroyed toolbar goes quiet", async () => {
  const { engine, toolbar } = setup("<p>x</p>");
  let heard = 0;
  toolbar.subscribe(() => heard++);
  const before = toolbar.items;
  engine.ui.add("toolbar.main", { kind: "separator", id: "late", group: "zzz" });
  assert.notEqual(toolbar.items, before);
  assert.ok(toolbar.items.some((i) => i.id === "late"));
  await tick();
  assert.equal(heard, 1);
  toolbar.destroy();
  engine.ui.add("toolbar.main", { kind: "separator", id: "later", group: "zzz" });
  await tick();
  assert.equal(heard, 1);
});

test("an item without a label of its own takes the command's, and failing that its id", () => {
  const { engine, toolbar } = setup("<p>x</p>");
  engine.ui.add("toolbar.main", { kind: "button", id: "mystery", command: "nobody.knows" });
  assert.equal(toolbar.state("mystery")?.label, "mystery");
  assert.equal(toolbar.state("mystery")?.disabled, true, "a command that does not exist is unavailable");
  assert.equal(toolbar.activate("mystery"), false);
});

test("items inside a menu have state and can be run, and a change in their command wakes the toolbar", async () => {
  const { engine, toolbar } = setup("<p>one two three</p>");
  engine.ui.add("toolbar.main", {
    kind: "menu", id: "more", label: "More",
    items: [{ kind: "toggle", id: "more-italic", command: "format.italic" }, { kind: "separator", id: "more-sep" }, { kind: "button", id: "more-undo", command: "history.undo" }],
  });
  await tick();
  assert.equal(toolbar.items.some((i) => i.id === "more"), true);
  assert.equal(toolbar.items.some((i) => i.id === "more-italic"), false, "only the menu is at the top level");
  assert.equal(toolbar.state("more")?.label, "More");
  assert.equal(toolbar.state("more-italic")?.pressed, false);
  let woke = 0;
  toolbar.subscribe(() => woke++);
  engine.setSelection(range(0, 3));
  assert.equal(toolbar.activate("more-italic"), true);
  await tick();
  assert.equal(toolbar.state("more-italic")?.pressed, true);
  assert.equal(woke >= 1, true, "heard about the change inside the menu");
});
