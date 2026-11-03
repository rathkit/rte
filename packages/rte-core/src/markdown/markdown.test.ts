import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importHtml } from "../import.ts";
import { pasteBlocks } from "../paste.ts";
import { caret } from "../path.ts";
import type { Block, Doc } from "../model.ts";
import { exportMarkdown, looksLikeMarkdown, markdown, parseMarkdown } from "./index.ts";

const html = (md: string): string => exportHtml({ blocks: parseMarkdown(md) });
const md = (h: string): string => exportMarkdown(importHtml(h));

test("headings, paragraphs, rules and breaks", () => {
  assert.equal(html("# One\n\n### Three ###\n\nText\nsecond line\n\n---"), "<h1>One</h1><h3>Three</h3><p>Text second line</p><hr>");
  assert.equal(html("Setext\n===\n\nTwo\n---"), "<h1>Setext</h1><h2>Two</h2>");
  assert.equal(html("a  \nb\\\nc"), "<p>a<br>b<br>c</p>");
  assert.equal(html("#hashtag"), "<p>#hashtag</p>");
});

test("emphasis, strike, code and links", () => {
  assert.equal(html("**b** *i* _i_ ***both*** ~~s~~ `c`"), "<p><strong>b</strong> <em>i</em> <em>i</em> <strong><em>both</em></strong> <s>s</s> <code>c</code></p>");
  assert.equal(html("snake_case_name and 2*3*4"), "<p>snake_case_name and 2<em>3</em>4</p>");
  assert.equal(html("[a **b**](https://x.test/p?q=1 \"t\") <https://y.test> www.z.test."), '<p><a href="https://x.test/p?q=1">a </a><a href="https://x.test/p?q=1"><strong>b</strong></a> <a href="https://y.test">https://y.test</a> <a href="https://www.z.test">www.z.test</a>.</p>');
  assert.equal(html("`` a`b ``"), "<p><code>a`b</code></p>");
  assert.equal(html("\\*not\\* &amp; &copy;"), "<p>*not* &amp; ©</p>");
});

test("lists: nested, ordered start, tasks, separate lists", () => {
  assert.equal(html("- a\n  - b\n- c"), "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  assert.equal(html("3. x\n4. y"), '<ol start="3"><li>x</li><li>y</li></ol>');
  const list = parseMarkdown("- [ ] open\n- [x] done")[0] as Extract<Block, { type: "ul" | "ol" }>;
  assert.deepEqual(list.items.map((i) => i.checked), [false, true]);
  assert.equal(parseMarkdown("- a\n\n* b").length, 2);
});

test("a list item keeps code, quotes, rules and later paragraphs, in order", () => {
  assert.equal(html("- first\n\n  second\n\n  ```\n  code\n  ```\n\n  after\n\n  > quoted\n- next"),
    "<ul><li><p>first</p><p>second</p><pre>code</pre><p>after</p><blockquote><p>quoted</p></blockquote></li><li>next</li></ul>");
  assert.equal(html("1. step\n   ```\n   run\n   ```\n   - sub\n2. two"), '<ol><li>step<pre>run</pre><ul><li>sub</li></ul></li><li>two</li></ol>');
  assert.equal(html("- # head\n  ---"), "<ul><li><h1>head</h1><hr></li></ul>");
  assert.equal(html("- ```\n  only code\n  ```"), "<ul><li><pre>only code</pre></li></ul>");
});

test("quotes, code and tables", () => {
  assert.equal(html("> a\n> b\n>\n> c"), "<blockquote><p>a b</p><p>c</p></blockquote>");
  assert.equal(html("```js\nlet a = 1;\n  b\n```"), "<pre>let a = 1;\n  b</pre>");
  assert.equal(html("    indented\n    code"), "<pre>indented\ncode</pre>");
  const t = parseMarkdown("| a | b |\n|:--|--:|\n| 1 | x \\| y |\n| 2 |")[0] as Extract<Block, { type: "table" }>;
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0]?.[0]?.header, true);
  assert.deepEqual(t.rows[1]?.map((c) => (c.blocks[0]?.type === "p" ? c.blocks[0].align : "?")), ["left", "right"]);
  assert.equal(t.rows[2]?.length, 2);
});

test("raw HTML and unsafe addresses stay harmless", () => {
  assert.equal(html("<script>alert(1)</script> <b>x</b>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;x&lt;/b&gt;</p>");
  assert.equal(html("[x](javascript:alert(1)) [y](&#106;avascript:1) [z](JAVASCRIPT:1) [v](vbscript:1) [d](data:text/html,x)"), "<p>x y z v d</p>");
  assert.equal(html("[y](JaVa\tScript:1)"), "<p>[y](JaVa\tScript:1)</p>");
  assert.equal(html("![a](javascript:alert(1))"), "<p>a</p>");
  assert.equal(html("![alt](https://i.test/a.png)"), '<p><img src="https://i.test/a.png" alt="alt"></p>');
  assert.equal(html("[x](file:///etc/passwd)"), "<p>x</p>");
});

test("export escapes what would be read as formatting", () => {
  assert.equal(md("<p>1. not a list</p>"), "1\\. not a list");
  assert.equal(md("<p># no heading</p><p>- no list</p><p>&gt; no quote</p>"), "\\# no heading\n\n\\- no list\n\n\\> no quote");
  assert.equal(md("<p>a*b*c [x] `y` _z_ snake_case</p>"), "a\\*b\\*c \\[x\\] \\`y\\` \\_z\\_ snake_case");
  assert.equal(md("<p>see https://x.test and www.y.test</p>"), "see https\\://x.test and www\\.y.test");
  assert.equal(md("<p><strong>a </strong>b</p>"), "**a** b");
  assert.equal(md("<p><code>a`b</code> <code>`</code></p>"), "``a`b`` `` ` ``");
});

test("export of structure", () => {
  assert.equal(md("<ul><li>a<ul><li>b</li></ul></li></ul><ol start=\"9\"><li>x</li><li>y</li></ol>"), "- a\n  - b\n\n9. x\n10. y");
  assert.equal(md("<ul><li>a</li></ul><ul><li>b</li></ul>"), "- a\n\n* b");
  assert.equal(md("<blockquote><p>a</p><p>b</p></blockquote>"), "> a\n>\n> b");
  assert.equal(md("<pre>a ``` b</pre>"), "````\na ``` b\n````");
  assert.equal(md("<table><tr><th>A</th><th>B|</th></tr><tr><td colspan=\"2\">x</td></tr></table>"), "| A | B\\| |\n| --- | --- |\n| x |  |");
  assert.equal(md("<p>a<br>b</p>"), "a\\\nb");
});

test("export drops what Markdown cannot say, and says nothing in HTML", () => {
  const out = md("<p><u>u</u> <sup>2</sup> <span style=\"color: red;\">r</span></p>");
  assert.equal(out, "u 2 r");
  assert.ok(!/</.test(md("<p style=\"text-align: right\"><sub>x</sub></p>")));
});

// A corpus of documents; reading what was written must give the same document (except the dropped details).
const CORPUS: string[] = [
  "<h2>Title *with* stars</h2><p>plain</p>",
  "<p>a <strong>b <em>c</em></strong> <s>d</s> <code>e</code> <a href=\"https://x.test/a_b\">l</a></p>",
  "<p>1. x</p><p>* y</p><p>+ z</p><p># w</p><p>&gt; q</p><p>--- </p><p>=== </p>",
  "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>",
  "<ol start=\"5\"><li>a</li><li>b<ol><li>c</li></ol></li></ol>",
  "<ul><li data-checked=\"true\"><input type=\"checkbox\" checked>done</li><li><input type=\"checkbox\">open</li></ul>",
  "<blockquote><p>q1</p><blockquote><p>nested</p></blockquote></blockquote>",
  "<pre>line 1\n    indented\n```\nfence</pre><hr><p>after</p>",
  "<ul><li>a<pre>code\n```</pre><p>after code</p><blockquote><p>q</p></blockquote><ul><li>sub</li></ul><hr></li><li>b</li></ul>",
  "<ol><li>x<pre>y</pre></li><li><pre>only</pre></li></ol>",
  "<table><tr><th>H1</th><th>H2</th></tr><tr><td>a | b</td><td><em>c</em></td></tr></table>",
  "<p>x<br>y<br>z</p>",
  "<p>back\\slash &lt;tag&gt; &amp;amp; ~tilde~ [br](acket) ![not image](x)</p>",
  "<p>under_score and snake_case_name and _lead and trail_</p>",
  "<p><a href=\"https://x.test/a(b)c d\">paren</a> <img src=\"https://i.test/p.png\" alt=\"pic\"></p>",
  "<p><strong>bold</strong><em>adjacent</em> <strong>a</strong> <strong>b</strong></p>",
];
const stripDoc = (d: Doc): string => exportHtml(d);

test("reading what was written gives back the same document", () => {
  for (const source of CORPUS) {
    const doc = importHtml(source);
    const text = exportMarkdown(doc);
    const back = parseMarkdown(text);
    assert.equal(stripDoc({ blocks: back }), stripDoc(doc), `${source}\n--- markdown ---\n${text}`);
  }
});

test("writing it again changes nothing", () => {
  for (const source of CORPUS) {
    const once = exportMarkdown(importHtml(source));
    assert.equal(exportMarkdown({ blocks: parseMarkdown(once) }), once, source);
  }
});

test("hostile input stays fast", () => {
  const cases = [
    "*".repeat(10_000), "[".repeat(10_000), "[]".repeat(10_000), "](".repeat(10_000), "![".repeat(5_000) + "](x)".repeat(5_000),
    ">".repeat(1_000) + " x", "- ".repeat(2_000) + "x", "`".repeat(10_000), "`a".repeat(10_000), "*a ".repeat(10_000), "_a_ ".repeat(5_000) + "*".repeat(5_000),
    "~".repeat(10_000), "(".repeat(10_000), "[a](" + "(".repeat(10_000), "<".repeat(10_000), "http://" + "a.".repeat(20_000), "|a".repeat(5_000) + "\n" + "|-".repeat(5_000),
    "  ".repeat(5_000) + "- x", "1.".repeat(10_000), "\\".repeat(10_000), "&".repeat(10_000), "# ".repeat(10_000),
  ];
  for (const input of cases) {
    const start = performance.now();
    parseMarkdown(input);
    looksLikeMarkdown(input);
    const took = performance.now() - start;
    assert.ok(took < 1500, `${input.slice(0, 12)}… took ${Math.round(took)} ms`);
  }
});

test("detection: text that is not Markdown stays plain", () => {
  for (const plain of [
    "just a sentence", "snake_case_names and other_things", "2*3*4 = 24", "write to jo@example.com", "- one line in prose",
    "C:\\Users\\me\\file_name.txt", "/usr/local/bin/some_tool --flag", "# install deps\nnpm install", "a * b * c", "see (a)[b] and [c]",
    "price: 5 * 3\nnext: 7 * 2", "1. only one numbered line", "x | y",
  ]) assert.equal(looksLikeMarkdown(plain), false, plain);
  for (const yes of [
    "# Title\n\n- a\n- b", "Some **bold** text", "see [the docs](https://x.test)", "```js\ncode\n```", "| a | b |\n|---|---|\n| 1 | 2 |",
    "- a\n- b", "1. a\n2. b", "- [ ] todo\n- [x] done", "~~gone~~ text",
  ]) assert.equal(looksLikeMarkdown(yes), true, yes);
});

const engineWith = (opts: Parameters<typeof markdown>[0], doc: string, at: number[] = [0]) => {
  const e = createEngine({ doc: importHtml(doc), platform: "other", onWarning: (m) => { throw new Error(m); } });
  e.use(markdown(opts));
  e.setSelection(caret({ path: at, offset: 0 }));
  return e;
};

test("the paste handler: plain text only, never into code, only when asked", () => {
  const text = "# Hi\n\n- a\n- b";
  const e = engineWith({}, "<p></p>");
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text }, e.pasteHandlers)] }), "<h1>Hi</h1><ul><li>a</li><li>b</li></ul>");
  // HTML on the clipboard: the standard handling reads it.
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text, html: "<p>rich</p>" }, e.pasteHandlers)] }), "<p>rich</p>");
  // Not Markdown: declined, so plain-text handling runs.
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text: "snake_case and 2*3*4" }, e.pasteHandlers)] }), "<p>snake_case and 2*3*4</p>");
  // In a code block the text stays literal.
  const code = engineWith({}, "<pre>x</pre>");
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text }, code.pasteHandlers)] }), "<p># Hi</p><p>- a<br>- b</p>");
  // always / never
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text: "# one line" }, engineWith({ paste: "always" }, "<p></p>").pasteHandlers)] }), "<h1>one line</h1>");
  assert.equal(engineWith({ paste: "never" }, "<p></p>").pasteHandlers.length, 0);
});

test("link schemes can be narrowed", () => {
  const e = engineWith({ paste: "always", linkSchemes: ["https"] }, "<p></p>");
  assert.equal(exportHtml({ blocks: [...pasteBlocks({ text: "[a](http://x.test) [b](https://y.test)" }, e.pasteHandlers)] }), '<p>a <a href="https://y.test">b</a></p>');
});

test("reference links and images use definitions anywhere in the text", () => {
  const text = "[a][x] [b][] [c] [Two Words] ![pic][p]\n\n[x]: https://x.test \"T\"\n[b]: <https://b.test>\n[c]: /rel\n[two  WORDS]: https://two.test\n[p]: https://i.test/p.png\n[bad]: javascript:alert(1)\n\n[bad] [missing] [a][nope]";
  assert.equal(html(text), '<p><a href="https://x.test">a</a> <a href="https://b.test">b</a> <a href="/rel">c</a> <a href="https://two.test">Two Words</a> <img src="https://i.test/p.png" alt="pic"></p><p>bad [missing] [a][nope]</p>');
  assert.equal(html("```\n[q]: http://q.test\n```\n\n[q]"), "<pre>[q]: http://q.test</pre><p>[q]</p>");
  assert.equal(html("> [q]: https://q.test\n\n[q]"), '<p><a href="https://q.test">q</a></p>');
  assert.equal(html("a\n[q]: https://q.test"), `<p>a [q]: <a href="https://q.test">https://q.test</a></p>`);
});

test("lazy continuation follows paragraph text only", () => {
  assert.equal(html("> a\nb"), "<blockquote><p>a b</p></blockquote>");
  assert.equal(html("> # h\nb"), "<blockquote><h1>h</h1></blockquote><p>b</p>");
  assert.equal(html("> ```\n> x\ny"), "<blockquote><pre>x</pre></blockquote><p>y</p>");
  assert.equal(html("> a\n2. b"), "<blockquote><p>a 2. b</p></blockquote>");
  assert.equal(html("- a\nb"), "<ul><li>a b</li></ul>");
  assert.equal(html("- ```\n  x\ny"), "<ul><li><pre>x</pre></li></ul><p>y</p>");
});

test("copy: the plugin adds text/markdown, can replace the plain text, or can be turned off", () => {
  const blocks = importHtml("<h1>T</h1><p>a <em>b</em></p>").blocks;
  const formats = (opts: Parameters<typeof markdown>[0]) => {
    const e = engineWith(opts, "<p></p>");
    return e.copyFormatters.map((f) => f(blocks)).filter(Boolean);
  };
  assert.deepEqual(formats({}), [{ "text/markdown": "# T\n\na *b*" }]);
  assert.deepEqual(formats({ copy: "plain" }), [{ "text/markdown": "# T\n\na *b*", "text/plain": "# T\n\na *b*" }]);
  assert.deepEqual(formats({ copy: "off" }), []);
});

test("markdown.copy writes the selection, or the whole document when nothing is selected", async () => {
  const written: string[] = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async (t: string) => { written.push(t); } } }, configurable: true });
  try {
    const e = engineWith({}, "<p>one <strong>two</strong></p><p>three</p>");
    assert.equal(e.commands.run("markdown.copy"), true);
    e.setSelection({ anchor: { path: [0], offset: 0 }, focus: { path: [0], offset: 3 } });
    assert.equal(e.commands.run("markdown.copy"), true);
    assert.deepEqual(written, ["one **two**\n\nthree", "one"]);
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    assert.equal(e.commands.run("markdown.copy"), false);
  } finally {
    Reflect.deleteProperty(globalThis, "navigator");
  }
});
