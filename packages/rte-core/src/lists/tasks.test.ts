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

// ---- marker style and start number ------------------------------------------------------------------------

test("list.style and list.start set the marker and the starting number of the list the caret is in, and only that list", () => {
  const e = taskEngine("<ol><li>one<ol><li>inner</li></ol></li><li>two</li></ol><ul><li>bullet</li></ul>");
  e.setSelection(caret({ path: [0, 1], offset: 0 }));
  assert.equal(e.commands.state("list.style").value, "");
  assert.equal(e.commands.run("list.style", "upper-roman"), true);
  assert.equal(e.commands.state("list.style").value, "upper-roman");
  assert.match(taskHtml(e), /^<ol style="list-style-type: upper-roman;"><li>one<ol><li>inner<\/li><\/ol><\/li><li>two<\/li><\/ol><ul>/, "the inner list keeps its own");
  assert.equal(e.commands.run("list.start", 5), true);
  assert.equal(e.commands.state("list.start").value, "5");
  assert.match(taskHtml(e), /^<ol start="5" style="list-style-type: upper-roman;">/);
  assert.equal(e.commands.run("list.start", ""), true, "empty is 1 again");
  assert.doesNotMatch(taskHtml(e), /start=/);
  assert.equal(e.commands.run("list.style", ""), true);
  assert.doesNotMatch(taskHtml(e), /list-style-type: upper-roman/);
  for (const bad of ["disc", "wavy", "none"]) assert.equal(e.commands.run("list.style", bad), false, `${bad} is not a numbered list's style`);
  for (const bad of [-1, 1.5, 100000, "x"]) assert.equal(e.commands.run("list.start", bad), false, String(bad));
  e.setSelection(caret({ path: [0, 0, 0, 0], offset: 0 }));
  e.commands.run("list.style", "lower-alpha");
  assert.match(taskHtml(e), /<ol style="list-style-type: lower-alpha;"><li>inner/, "the caret's own list, the inner one");
  e.setSelection(caret({ path: [1, 0], offset: 0 }));
  assert.equal(e.commands.run("list.style", "square"), true);
  assert.match(taskHtml(e), /<ul style="list-style-type: square;"><li>bullet/);
  assert.equal(e.commands.run("list.start", 3), false, "a bulleted list has no number to start at");
  assert.equal(e.commands.state("list.start").enabled, false);
  e.undo();
  assert.doesNotMatch(taskHtml(e), /square/, "one undo step");
  const outside = taskEngine("<p>x</p>");
  assert.equal(outside.commands.state("list.style").enabled, false);
});

// ---- paragraphs inside an item ----------------------------------------------------------------------------

test("an item can hold paragraphs: read from <li><p>, written back as paragraphs, and started with list.paragraph", async () => {
  const html = '<ul><li><p>first</p><p>second</p><ul><li>inner</li></ul></li><li>plain</li></ul>';
  const e = taskEngine(html);
  assert.equal(taskHtml(e), '<ul><li><p>first</p><p>second</p><ul><li>inner</li></ul></li><li>plain</li></ul>', "paragraphs survive a round trip");
  assert.equal(taskHtml(taskEngine('<ul><li>a<br>b</li></ul>')), '<ul><li>a<br>b</li></ul>', "a line break stays a line break");
  const task = taskEngine('<ul><li style="list-style-type: none;"><input type="checkbox" disabled checked> <p>done one</p><p>more</p></li></ul>');
  assert.match(taskHtml(task), /^<ul><li style="list-style-type: none;"><p><input type="checkbox" disabled checked> done one<\/p><p>more<\/p><\/li><\/ul>$/, "a task's checkbox goes in the first paragraph");
  assert.equal(taskHtml(taskEngine(taskHtml(task))), taskHtml(task), "and reads back the same");
  const made = taskEngine("<ul><li>onetwo</li></ul>");
  made.setSelection(caret({ path: [0, 0], offset: 3 }));
  assert.equal(made.commands.run("list.paragraph"), true);
  assert.equal(taskHtml(made), "<ul><li><p>one</p><p>two</p></li></ul>");
  assert.deepEqual(made.selection.focus, { path: [0, 0], offset: 4 }, "the caret is at the start of the new paragraph");
  made.undo();
  assert.equal(taskHtml(made), "<ul><li>onetwo</li></ul>", "one undo step");
  const outside = taskEngine("<p>x</p>");
  assert.equal(outside.commands.run("list.paragraph"), false);
  // Enter still adds an item, splitting the paragraphs of the item between the two.
  const split = taskEngine("<ul><li><p>one</p><p>two</p></li></ul>");
  split.setSelection(caret({ path: [0, 0], offset: 1 }));
  split.apply("split", (doc, sel) => splitListItem(doc, sel.focus) ?? { doc, selection: sel });
  assert.equal(taskHtml(split), "<ul><li>o</li><li>ne<br>two</li></ul>".replace("ne<br>two", "<p>ne</p><p>two</p>"), "the break stays in the second item");
});
