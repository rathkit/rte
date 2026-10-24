import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { caret } from "../path.ts";
import { backspaceAtItemStart, listShortcut, splitListItem } from "./lists.ts";
import { lists } from "./plugin.ts";

// ---- tasks ------------------------------------------------------------------------------------------------


const taskEngine = (html: string) => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (m) => { throw new Error(m); } });
  e.use(lists());
  return e;
};
const taskHtml = (e: ReturnType<typeof taskEngine>) => exportHtml(e.document);
const box = (done: boolean) => `<input type="checkbox" disabled${done ? " checked" : ""}> `;
const li = (text: string, done: boolean) => `<li style="list-style-type: none;">${box(done)}${text}</li>`;

test("tasks are read from a checkbox, its wrapper, aria-checked or a class, and written as a checkbox in the item", () => {
  const e = taskEngine(
    '<ul><li><input type="checkbox" checked> bare</li><li><label><input type="checkbox"> wrapped</label></li><li aria-checked="true">aria</li><li class="task-list-item checked"><p>class</p></li><li>plain</li></ul>',
  );
  assert.equal(taskHtml(e), `<ul>${li("bare", true)}${li("wrapped", false)}${li("aria", true)}${li("class", true)}<li>plain</li></ul>`);
  const again = taskEngine(taskHtml(e));
  assert.equal(taskHtml(again), taskHtml(e), "what is written reads back the same");
});

test("the task list command makes paragraphs tasks, makes items tasks, and turns them back", () => {
  const e = taskEngine("<p>one</p><p>two</p>");
  e.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [1], offset: 1 } });
  assert.equal(e.commands.state("list.checklist").active, false);
  e.commands.run("list.checklist");
  assert.equal(taskHtml(e), `<ul>${li("one", false)}${li("two", false)}</ul>`);
  assert.equal(e.commands.state("list.checklist").active, true);
  e.commands.run("list.checklist");
  assert.equal(taskHtml(e), "<ul><li>one</li><li>two</li></ul>");
  e.commands.run("list.checklist");
  assert.equal(e.commands.state("list.checklist").active, true, "items of an existing list become tasks");
});

test("marking done: the key, a whole selection, and one item by path", () => {
  const e = taskEngine(`<ul>${li("a", false)}${li("b", false)}<li>plain</li></ul>`);
  e.setSelection(caret({ path: [0, 0], offset: 1 }));
  assert.equal(e.commands.run("list.toggleChecked"), true);
  assert.equal(taskHtml(e).startsWith(`<ul>${li("a", true)}${li("b", false)}`), true);
  assert.equal(e.commands.state("list.toggleChecked").active, true);
  e.setSelection({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 1], offset: 0 } });
  e.commands.run("list.toggleChecked");
  assert.equal(taskHtml(e).startsWith(`<ul>${li("a", true)}${li("b", true)}`), true, "some done: all become done");
  e.commands.run("list.toggleChecked");
  assert.equal(taskHtml(e).startsWith(`<ul>${li("a", false)}${li("b", false)}`), true, "all done: all cleared");
  e.setSelection(caret({ path: [0, 2], offset: 0 }));
  assert.equal(e.commands.run("list.toggleChecked"), false, "an ordinary item is not a task");
  e.commands.run("list.toggleChecked", { path: [0, 1] });
  assert.equal(taskHtml(e).startsWith(`<ul>${li("a", false)}${li("b", true)}`), true);
  assert.equal(e.commands.run("list.toggleChecked", { path: [0, 2] }), false);
  const keyed = taskEngine(`<ul>${li("a", false)}</ul>`);
  keyed.setSelection(caret({ path: [0, 0], offset: 0 }));
  assert.equal(keyed.handleKey({ key: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(taskHtml(keyed), `<ul>${li("a", true)}</ul>`);
});

test("Enter in a task makes a task that is not done; Backspace at its start takes the checkbox away; a typed [ ] starts a task list", () => {
  const e = taskEngine(`<ul>${li("one two", true)}</ul>`);
  e.setSelection(caret({ path: [0, 0], offset: 3 }));
  e.apply("split", (doc, sel) => splitListItem(doc, sel.focus) ?? { doc, selection: sel });
  assert.equal(taskHtml(e), `<ul>${li("one", true)}${li("&nbsp;two", false)}</ul>`);
  e.setSelection(caret({ path: [0, 1], offset: 0 }));
  const gone = backspaceAtItemStart(e.document, e.selection.focus);
  assert.ok(gone);
  assert.equal(exportHtml(gone.doc), `<ul>${li("one", true)}<li>&nbsp;two</li></ul>`);
  for (const [typed, done] of [["[]", false], ["[ ]", false], ["[x]", true]] as const) {
    const t = taskEngine(`<p>${typed}</p>`);
    const result = listShortcut(t.document, caret({ path: [0], offset: typed.length }));
    assert.ok(result, typed);
    assert.equal(exportHtml(result.doc), `<ul>${li("", done)}</ul>`, typed);
  }
});
