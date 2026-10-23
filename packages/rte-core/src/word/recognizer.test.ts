import assert from "node:assert/strict";
import { test } from "node:test";
import { exportHtml } from "../export.ts";
import { importBlocks } from "../import.ts";
import { wordRecognizer } from "./recognizer.ts";

const paste = (html: string): string => exportHtml({ blocks: importBlocks(html, { styles: "semantic", recognizers: [wordRecognizer] }) });

test("word-processor list paragraphs become nested lists, with marker kinds read from the marker text", () => {
  const item = (level: number, marker: string, text: string, id = "l0"): string =>
    `<p class=MsoListParagraph style='mso-list:${id} level${level} lfo1'><![if !supportLists]><span style='mso-list:Ignore'>${marker}<span>&nbsp;&nbsp;&nbsp;</span></span><![endif]>${text}<o:p></o:p></p>`;
  const bullets = item(1, "·", "one") + item(2, "o", "sub") + item(3, "§", "subsub") + item(1, "·", "two");
  assert.equal(paste(bullets), "<ul><li>one<ul><li>sub<ul><li>subsub</li></ul></li></ul></li><li>two</li></ul>");
  const numbers = item(1, "5.", "x", "l1") + item(2, "a.", "y", "l1") + item(3, "iii.", "z", "l1");
  assert.equal(paste(numbers), '<ol start="5"><li>x<ol style="list-style-type: lower-alpha;"><li>y<ol start="3" style="list-style-type: lower-roman;"><li>z</li></ol></li></ol></li></ol>');
  // Different list identifiers are different lists.
  assert.equal(paste(item(1, "1.", "a", "l1") + item(1, "1.", "b", "l2")), "<ol><li>a</li></ol><ol><li>b</li></ol>");
});

test("a list marker survives as text when the wrapper that marks it is gone", () => {
  const html = "<p style='mso-list:l0 level1 lfo1'>1.&nbsp;&nbsp;&nbsp;first</p><p style='mso-list:l0 level1 lfo1'>2.&nbsp;&nbsp;&nbsp;second</p>";
  assert.equal(paste(html), "<ol><li>first</li><li>second</li></ol>");
});

test("list markers from a word processor on the web come from its definition attribute", () => {
  const li = (level: number, defn: string, text: string): string =>
    `<ul role="list"><li data-aria-level="${level}" data-listid="9" data-list-defn-props='${defn}'>${text}</li></ul>`;
  const html = li(1, '{"469769242":[8226]}', "a") + li(2, '{"469769242":[9675]}', "b") + li(2, '{"469769242":[9675]}', "c");
  assert.equal(paste(html), "<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>");
  const ol = '<ol role="list" start="3"><li data-aria-level="1" data-listid="4" data-list-defn-props=\'{"469769242":[65533,4]}\'>x</li></ol>';
  assert.equal(paste(ol), '<ol start="3" style="list-style-type: lower-alpha;"><li>x</li></ol>');
});

test("without the recognizer, word-processor list paragraphs are plain paragraphs", () => {
  const html = "<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>·</span>one</p>";
  assert.equal(exportHtml({ blocks: importBlocks(html, { styles: "semantic" }) }), "<p>·one</p>");
});
