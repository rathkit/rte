import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { caret, type Path } from "../path.ts";
import { find, type FindInfo } from "./plugin.ts";

const make = (html: string) => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (w) => { throw new Error(w.message); } });
  e.use(find());
  return e;
};
const info = (e: ReturnType<typeof make>): FindInfo => e.commands.state("find.set").value as FindInfo;
const html = (e: ReturnType<typeof make>) => exportHtml(e.document);
const at = (e: ReturnType<typeof make>, path: Path, offset: number) => e.setSelection(caret({ path, offset }));
const selected = (e: ReturnType<typeof make>) => `${e.selection.anchor.path.join(".")}:${e.selection.anchor.offset}-${e.selection.focus.offset}`;

test("a search finds every occurrence in document order, across paragraphs, list items and cells, ignoring case unless asked", () => {
  const e = make("<p>Cat and cat</p><ul><li>concat</li></ul><table><tbody><tr><td>CAT</td></tr></tbody></table>");
  e.commands.run("find.set", { query: "cat" });
  assert.deepEqual(info(e).matches.map((m) => `${m.path.join(".")}:${m.from}`), ["0:0", "0:8", "1.0:3", "2.0.0.0:0"]);
  e.commands.run("find.set", { matchCase: true });
  assert.deepEqual(info(e).matches.map((m) => `${m.path.join(".")}:${m.from}`), ["0:8", "1.0:3"]);
  e.commands.run("find.set", { matchCase: false, wholeWord: true });
  assert.deepEqual(info(e).matches.map((m) => `${m.path.join(".")}:${m.from}`), ["0:0", "0:8", "2.0.0.0:0"], "concat is not the word cat");
});

test("special characters in the query mean themselves, and an empty query finds nothing", () => {
  const e = make("<p>a.b a+b (x) [y] a*b</p>");
  for (const [query, count] of [["a.b", 1], ["a+b", 1], ["(x)", 1], ["[y]", 1], ["*", 1], ["", 0], ["\\", 0]] as const) {
    e.commands.run("find.set", { query });
    assert.equal(info(e).matches.length, count, query);
  }
});

test("next and previous select the matches one after another and wrap round", () => {
  const e = make("<p>x one x two x</p>");
  e.commands.run("find.set", { query: "x" });
  at(e, [0], 0);
  e.commands.run("find.next");
  assert.equal(selected(e), "0:0-1", "a caret before a match selects that match");
  assert.equal(info(e).index, 0);
  e.commands.run("find.next");
  assert.equal(selected(e), "0:6-7");
  e.commands.run("find.next");
  e.commands.run("find.next");
  assert.equal(selected(e), "0:0-1", "wrapped");
  e.commands.run("find.previous");
  assert.equal(selected(e), "0:12-13", "back round the other way");
  e.commands.run("find.set", { query: "nothing" });
  assert.equal(e.commands.run("find.next"), false);
  assert.equal(e.commands.state("find.next").enabled, false);
});

test("replace selects the next match first and then replaces the selected one; replace all does every one in a single undo step", () => {
  const e = make("<p>cat dog cat</p><p>cat</p>");
  e.commands.run("find.set", { query: "cat" });
  at(e, [0], 0);
  e.commands.run("find.replace", { with: "fox" });
  assert.equal(html(e), "<p>cat dog cat</p><p>cat</p>", "the first press only selects");
  e.commands.run("find.replace", { with: "fox" });
  assert.equal(html(e), "<p>fox dog cat</p><p>cat</p>");
  assert.equal(e.selection.focus.offset, 3, "the caret is after the new text");
  e.commands.run("find.replaceAll", { with: "bird" });
  assert.equal(html(e), "<p>fox dog bird</p><p>bird</p>");
  e.undo();
  assert.equal(html(e), "<p>fox dog cat</p><p>cat</p>", "one step");
});

test("replacing keeps the formatting of the text it replaces, and replacing with nothing deletes", () => {
  const e = make("<p>a <strong>cat</strong> b</p>");
  e.commands.run("find.set", { query: "cat" });
  e.commands.run("find.replaceAll", { with: "dog" });
  assert.equal(html(e), "<p>a <strong>dog</strong> b</p>");
  e.commands.run("find.set", { query: "dog" });
  e.commands.run("find.replaceAll", { with: "" });
  assert.equal(html(e), "<p>a&nbsp; b</p>");
});

test("the search is editor state that does not touch the document or the history, and read-only editors can search but not replace", () => {
  const e = createEngine({ doc: importHtml("<p>cat</p>"), platform: "other", readOnly: true, onWarning: () => undefined });
  e.use(find());
  assert.equal(e.commands.run("find.open"), true);
  assert.equal(e.commands.state("find.open").active, true);
  e.commands.run("find.set", { query: "cat" });
  assert.equal((e.commands.state("find.set").value as FindInfo).matches.length, 1);
  assert.equal(e.commands.run("find.next"), true);
  assert.equal(e.commands.run("find.replaceAll", { with: "x" }), false);
  assert.equal(e.canUndo, false);
  e.commands.run("find.close");
  assert.equal(e.commands.state("find.open").active, false);
});

test("the search follows the document: edits move and remove matches", () => {
  const e = make("<p>cat</p>");
  e.commands.run("find.set", { query: "cat" });
  const first = info(e);
  assert.equal(info(e), first, "the same object while nothing changed");
  e.apply("type", (doc, sel) => ({ doc: importHtml("<p>cat cat</p>"), selection: sel }));
  assert.equal(info(e).matches.length, 2);
});
