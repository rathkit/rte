import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { insertText } from "../edit.ts";
import { caret } from "../path.ts";
import { lists } from "../lists/plugin.ts";
import { autoformat, type AutoformatOptions } from "./plugin.ts";

const make = (html: string, options: AutoformatOptions = {}) => {
  const e = createEngine({ doc: importHtml(html), platform: "other", onWarning: (m) => { throw new Error(m); } });
  e.use(lists());
  e.use(autoformat(options));
  e.setSelection(caret({ path: [0], offset: e.document.blocks[0]?.type === "p" ? (e.document.blocks[0].content.map((n) => (n.type === "text" ? n.text.length : 1)).reduce((a, b) => a + b, 0)) : 0 }));
  return e;
};
/** Types text one character at a time, as a keyboard does: a trigger may take over a character, otherwise it is inserted. */
const type = (e: ReturnType<typeof make>, text: string) => {
  for (const ch of text) {
    const taken = e.triggerText(ch);
    if (taken) {
      e.apply("autoformat", () => taken);
      if (taken.storedMarks) e.setStoredMarks(taken.storedMarks);
    } else e.apply("type", (doc, sel) => insertText(doc, sel, ch, e.storedMarks));
  }
};
const html = (e: ReturnType<typeof make>) => exportHtml(e.document);

test("# to ###### and a space make a heading, > a quote, three backticks a code block, three dashes a rule", () => {
  for (const [typed, out] of [["# ", "<h1></h1>"], ["### ", "<h3></h3>"], ["###### ", "<h6></h6>"], ["> ", "<blockquote><p></p></blockquote>"], ["```", "<pre></pre>"]] as const) {
    const e = make("<p></p>");
    type(e, typed);
    assert.equal(html(e), out, typed);
  }
  const rule = make("<p></p>");
  type(rule, "---");
  assert.match(html(rule), /^<hr>/);
  const heading = make("<p></p>");
  type(heading, "## Title");
  assert.equal(html(heading), "<h2>Title</h2>");
});

test("block shortcuts only fire on a paragraph that holds nothing else, and a space after other text is a space", () => {
  for (const start of ["<p>a</p>", "<p><strong>#</strong></p>"]) {
    const e = make(start);
    type(e, "# ");
    assert.doesNotMatch(html(e), /<h1>/, start);
  }
  const e = make("<p>x</p>");
  type(e, " #");
  type(e, " ");
  assert.doesNotMatch(html(e), /<h1>/);
});

test("**bold**, ~~strike~~, *italic*, _italic_ and `code` mark the text between the markers, and what follows is plain", () => {
  for (const [typed, out] of [
    ["**bold**", "<p><strong>bold</strong></p>"], ["~~gone~~", "<p><s>gone</s></p>"], ["*it*", "<p><em>it</em></p>"],
    ["_it_", "<p><em>it</em></p>"], ["`x`", "<p><code>x</code></p>"], ["a **b c** d", "<p>a <strong>b c</strong> d</p>"],
  ] as const) {
    const e = make("<p></p>");
    type(e, typed);
    assert.equal(html(e), out, typed);
  }
  const e = make("<p></p>");
  type(e, "**bold**x");
  assert.equal(html(e), "<p><strong>bold</strong>x</p>", "the next character is plain");
  const undone = make("<p></p>");
  type(undone, "**bold**");
  undone.undo();
  assert.equal(html(undone), "<p>**bold*</p>", "one undo step takes the conversion back");
});

test("markers that are not a span are left alone: spaces inside, math, snake_case, empty, and when the option is off", () => {
  for (const typed of ["2 * 3 * 4", "snake_case_name", "** **", "**", "a * b*", "~~ x~~", "``"]) {
    const e = make("<p></p>");
    type(e, typed);
    assert.doesNotMatch(html(e), /<(strong|em|s|code)>/, typed);
  }
  const off = make("<p></p>", { spans: false });
  type(off, "**b**");
  assert.equal(html(off), "<p>**b**</p>");
  const plain = make("<p></p>", { blocks: false });
  type(plain, "# ");
  assert.equal(html(plain), "<p>#&nbsp;</p>");
});

test("a web address and a space become a link; trailing punctuation stays outside; text that is already linked is left", () => {
  const e = make("<p></p>");
  type(e, "see https://example.test/a?b=1. ok");
  assert.equal(html(e), '<p>see <a href="https://example.test/a?b=1">https://example.test/a?b=1</a>. ok</p>');
  const w = make("<p></p>");
  type(w, "www.example.test ");
  assert.equal(html(w), '<p><a href="https://www.example.test">www.example.test</a>&nbsp;</p>');
  for (const typed of ["https:// ", "www. ", "http://a ", "javascript:alert(1) "]) {
    const x = make("<p></p>");
    type(x, typed);
    assert.doesNotMatch(html(x), /<a /, typed);
  }
  const linked = make('<p><a href="https://one.test">https://one.test</a></p>');
  type(linked, " ");
  assert.equal((html(linked).match(/<a /g) ?? []).length, 1);
  const off = make("<p></p>", { links: false });
  type(off, "https://example.test ");
  assert.doesNotMatch(html(off), /<a /);
});

test("an address after others, each link on its own and punctuation after it stays outside; a long run of punctuation is quick", () => {
  const e = make("<p></p>");
  type(e, "(www.a.test http://b.test/x?). ");
  assert.equal(html(e), '<p>(<a href="https://www.a.test">www.a.test</a> <a href="http://b.test/x">http://b.test/x</a>?).&nbsp;</p>');
  const started = Date.now();
  const long = make("<p></p>");
  type(long, `http://${".".repeat(20_000)} `);
  assert.ok(Date.now() - started < 4000);
});
