import assert from "node:assert/strict";
import { test } from "node:test";
import { countDocument, countSelection, countText } from "./stats.ts";
import { importHtml } from "./import.ts";

test("words are runs of letters and digits, with apostrophes and hyphens inside a word kept in it", () => {
  assert.equal(countText("Hello, world!").words, 2);
  assert.equal(countText("don’t well-known 3.14 e-mail").words, 5, "don’t, well-known, 3, 14, e-mail");
  assert.equal(countText("日本語 テスト").words, 2, "runs of letters of any script");
  assert.equal(countText("  \n ").words, 0);
  assert.equal(countText("naïve café").words, 2, "accents are part of the word");
});

test("characters include spaces but not the ends, line breaks or images", () => {
  assert.equal(countText("ab cd").characters, 5);
  assert.equal(countText("  ab  ").characters, 2);
  assert.equal(countText("a￼b").characters, 2);
});

test("the document counts each paragraph, list item and cell as its own run, so neighbors never fuse into one word", () => {
  const doc = importHtml("<p>one two</p><ul><li>three</li></ul><table><tbody><tr><td>four</td><td>five</td></tr></tbody></table><p></p>");
  assert.deepEqual(countDocument(doc), { words: 5, characters: 7 + 5 + 4 + 4 });
});

test("a selection counts only what is selected", () => {
  const doc = importHtml("<p>one two three</p>");
  assert.deepEqual(countSelection(doc, { anchor: { path: [0], offset: 4 }, focus: { path: [0], offset: 13 } }), { words: 2, characters: 9 });
  assert.equal(countSelection(doc, { anchor: { path: [0], offset: 4 }, focus: { path: [0], offset: 4 } }).words, 0);
});
