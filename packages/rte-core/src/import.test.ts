import assert from "node:assert/strict";
import { test } from "node:test";
import { exportHtml } from "./export.ts";
import { importBlocks, importHtml, importText } from "./import.ts";

const load = (html: string): string => exportHtml({ blocks: importBlocks(html, { keepEmptyBlocks: true }) });
const paste = (html: string): string => exportHtml({ blocks: importBlocks(html, { styles: "semantic" }) });

test("attributes outside the allow-list are dropped", () => {
  assert.equal(load('<p onclick="x()" id="i" data-x="1">a</p>'), "<p>a</p>");
});

test("script-capable addresses never become links, however they are disguised", () => {
  for (const href of ["JaVaScRiPt:alert(1)", "java&#9;script:alert(1)", "vbscript:x", " \tjavascript:x", "data:text/html,x", "file:///etc/passwd"]) {
    assert.equal(load(`<a href="${href}">x</a>`), "<p>x</p>", href);
  }
  assert.equal(load('<a href="https://x.test/">x</a>'), '<p><a href="https://x.test/">x</a></p>');
  assert.equal(load('<a href="#top">x</a><a href="mailto:a@b.test">m</a>'), '<p><a href="#top">x</a><a href="mailto:a@b.test">m</a></p>');
  assert.equal(load('<a href="C:\\Users\\someone\\a.docx">x</a>'), "<p>x</p>");
});

test("scripts, styles and document furniture produce nothing", () => {
  assert.equal(load("<script>1</script><style>p{}</style><link rel=stylesheet href=x><meta charset=x><base href=x>"), "");
  assert.equal(load('<iframe src="https://x.test"></iframe><object data="x"></object><embed src="x">'), "");
});

test("svg and math flatten to their text, unknown elements unwrap", () => {
  assert.equal(load("<svg><circle/></svg><math><mi>x</mi></math>"), "<p>x</p>");
  assert.equal(load("<h1>h</h1><h7>x</h7><custom-el>c</custom-el>"), "<h1>h</h1><p>xc</p>");
});

test("structure is repaired by reading content as flow", () => {
  assert.equal(load("<p>a<div>d</div></p>"), "<p>a</p><p>d</p>");
  assert.equal(load("<DIV><P>a<BR>b</P></DIV>"), "<p>a<br>b</p>");
  assert.equal(load("<table><tr><td>a<td>b<tr><td>c</table>"), "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td></td></tr></tbody></table>");
});

test("styles: allow-list keeps color, drops position and unknown properties", () => {
  assert.equal(load('<p style="position:fixed;color:red">a</p>'), "<p>a</p>");
  assert.equal(load('<p>a <span style="color:red;position:fixed;background:url(x)">b</span></p>'), '<p>a <span style="color: red;">b</span></p>');
  assert.equal(load('<font color="red" size="3" face="Arial">f</font>'), '<p><span style="color: red;">f</span></p>');
  assert.equal(load('<p style="text-align:center">a</p>'), '<p style="text-align: center;">a</p>');
});

test("paste keeps meaning and drops presentation", () => {
  assert.equal(paste('<b style="color:red">B</b><script>1</script><span onclick="x()">S</span>'), "<p><strong>B</strong>S</p>");
  assert.equal(paste('<div style="font-family:Verdana"><h2>Web</h2><p style="color:blue">x</p></div>'), "<h2>Web</h2><p>x</p>");
  assert.equal(paste('<span style="font-weight:700;font-style:italic;text-decoration:underline">t</span>'), "<p><strong><em><u>t</u></em></strong></p>");
});

test("an underline on a link is the link's styling, not a mark", () => {
  assert.equal(paste('<a href="https://x.test" style="text-decoration:underline">x</a>'), '<p><a href="https://x.test">x</a></p>');
});

test("a link without a usable address is plain text", () => {
  assert.equal(paste('<a target="_blank">x</a>'), "<p>x</p>");
});

test("plain text: blank line is a paragraph, single break is a line break, spaces kept", () => {
  assert.equal(exportHtml({ blocks: importText("l1\nl2\n\nl4") }), "<p>l1<br>l2</p><p>l4</p>");
  assert.equal(exportHtml({ blocks: importText("a\r\n\r\n  b <c> & d") }), "<p>a</p><p>&nbsp; b &lt;c&gt; &amp; d</p>");
  assert.deepEqual(importText("  \n\n "), []);
});

test("lists nest, keep explicit markers and starts", () => {
  // The marker a depth would show anyway is dropped. A different one is kept.
  assert.equal(load('<ul><li>one<ul style="list-style-type:circle"><li>sub</li></ul></li><li>two</li></ul>'), "<ul><li>one<ul><li>sub</li></ul></li><li>two</li></ul>");
  assert.equal(load('<ul><li>one<ul style="list-style-type:square"><li>sub</li></ul></li></ul>'), '<ul><li>one<ul style="list-style-type: square;"><li>sub</li></ul></li></ul>');
  assert.equal(load('<ol start="3"><li>x</li></ol>'), '<ol start="3"><li>x</li></ol>');
  assert.equal(load('<ol type="A" start="2"><li>x</li></ol>'), '<ol start="2" style="list-style-type: upper-alpha;"><li>x</li></ol>');
  assert.equal(load("<ol><li>one</li></ol>"), "<ol><li>one</li></ol>");
});

test("a list placed directly inside a list nests under the item before it", () => {
  assert.equal(load("<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>"), "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
});

test("one-item lists with levels merge into one nested list", () => {
  const docs = '<ul><li aria-level="1">a</li></ul><ul><li aria-level="2">b</li></ul><ul><li aria-level="2">c</li></ul><ul><li aria-level="1">d</li></ul>';
  assert.equal(load(docs), "<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>");
  const numbered = '<ol start="5"><li data-aria-level="1" data-listid="3">x</li></ol><ol start="6"><li data-aria-level="1" data-listid="3">y</li></ol>';
  assert.equal(load(numbered), '<ol start="5"><li>x</li><li>y</li></ol>');
  // Two ordinary neighbouring lists are not merged.
  assert.equal(load("<ul><li>a</li></ul><ol><li>b</li></ol>"), "<ul><li>a</li></ul><ol><li>b</li></ol>");
});

test("images: raster data and remote addresses are kept, everything else is dropped", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
  assert.equal(load(`<img src="${png}" width="32" height="32" alt="a">`), `<p><img src="${png}" alt="a" width="32" height="32"></p>`);
  assert.equal(load('<img src="https://x.test/a.png">'), '<p><img src="https://x.test/a.png"></p>');
  assert.equal(load('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), "");
  assert.equal(load('<img src="data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">'), "", "declared type is not trusted");
  assert.equal(load('<img src="file:///C:/Users/someone/clip_image001.png">'), "");
  assert.equal(load('<img src="x" onerror="alert(1)">'), '<p><img src="x"></p>');
});

test("whitespace collapses like a browser and entities decode", () => {
  assert.equal(load("<p>  a \n  b&nbsp;&nbsp;c &amp; &#169; &copy; &lt;</p>"), "<p>a b&nbsp;&nbsp;c &amp; © © &lt;</p>");
  assert.equal(load("<p>a</p>\n  <p>b</p>"), "<p>a</p><p>b</p>");
});

test("empty blocks are kept on load, written without padding, and dropped on paste", () => {
  assert.equal(load("<p></p><p><br></p><p>a</p>"), "<p></p><p></p><p>a</p>");
  assert.equal(paste("<p></p><p><br></p><p>a</p>"), "<p>a</p>");
  assert.equal(exportHtml(importHtml("")), "<p></p>");
});

test("a table keeps spans, pads short rows and has real header cells", () => {
  const html = '<table><tr><th colspan="2">h</th></tr><tr><td>a</td></tr><tr><td rowspan="2">x</td><td>y</td></tr><tr><td>z</td></tr></table>';
  assert.equal(load(html),
    '<table><tbody><tr><th scope="col" colspan="2">h</th></tr><tr><td>a</td><td></td></tr><tr><td rowspan="2">x</td><td>y</td></tr><tr><td>z</td></tr></tbody></table>');
});

test("load then save is stable", () => {
  const messy = '<div><p style="text-align:right">a <b>b<i>c</i></b> <a href="https://x.test">d</a></p><ul><li>x<ol start="2"><li>y</li></ol></li></ul><blockquote><p>q</p></blockquote><pre>l1\n l2</pre><hr></div>';
  const once = load(messy);
  assert.equal(load(once), once);
});

test("a mark given twice by one element is one mark", () => {
  assert.equal(paste('<strong style="font-weight:600">x</strong>'), "<p><strong>x</strong></p>");
});

test("bold inside a heading is dropped; headings are bold already", () => {
  assert.equal(paste('<h1><span style="font-weight:700">T</span></h1>'), "<h1>T</h1>");
});

test("table rows that arrive without their table are read as a table", () => {
  assert.equal(paste("<!--StartFragment--><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr><!--EndFragment-->"),
    "<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td></td></tr></tbody></table>");
});

test("an explicit style beats the tag: a bold wrapper with normal weight is not bold", () => {
  assert.equal(paste('<b style="font-weight:normal"><span style="font-weight:700">a</span> b</b>'), "<p><strong>a</strong> b</p>");
  assert.equal(paste('<strong>a <span style="font-weight:400">b</span></strong>'), "<p><strong>a </strong>b</p>");
  assert.equal(paste('<em style="font-style:normal">a</em>'), "<p>a</p>");
});

test("a different list kind at the same level starts a new list", () => {
  const html = '<ul><li aria-level="1">a</li></ul><ol><li aria-level="1">b</li></ol><ol><li aria-level="2">c</li></ol>';
  assert.equal(load(html), "<ul><li>a</li></ul><ol><li>b<ol><li>c</li></ol></li></ol>");
});

test("bold set on a table cell or row applies to the cell's text", () => {
  assert.equal(paste('<table><tr style="font-weight:bold"><td>h</td></tr><tr><td style="font-weight:bold">b</td><td>c</td></tr></table>'),
    "<table><tbody><tr><td><strong>h</strong></td><td></td></tr><tr><td><strong>b</strong></td><td>c</td></tr></tbody></table>");
});

test("a preformatted wrapper that holds a table is not code", () => {
  assert.equal(paste("<pre><table><tr><td>a</td></tr></table></pre>"), "<table><tbody><tr><td>a</td></tr></tbody></table>");
});

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

test("a paragraph that declares itself a heading is a heading", () => {
  assert.equal(paste('<p role="heading" aria-level="2"><span style="font-weight:bold">T</span></p><p>b</p>'), "<h2>T</h2><p>b</p>");
});

test("list markers from a word processor on the web come from its definition attribute", () => {
  const li = (level: number, defn: string, text: string): string =>
    `<ul role="list"><li data-aria-level="${level}" data-listid="9" data-list-defn-props='${defn}'>${text}</li></ul>`;
  const html = li(1, '{"469769242":[8226]}', "a") + li(2, '{"469769242":[9675]}', "b") + li(2, '{"469769242":[9675]}', "c");
  assert.equal(paste(html), "<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>");
  const ol = '<ol role="list" start="3"><li data-aria-level="1" data-listid="4" data-list-defn-props=\'{"469769242":[65533,4]}\'>x</li></ol>';
  assert.equal(paste(ol), '<ol start="3" style="list-style-type: lower-alpha;"><li>x</li></ol>');
});

test("underline inside a link is the link's styling even when the link's address was dropped", () => {
  assert.equal(paste('<a href="file:///C:/x.docx"><span style="text-decoration:underline">word</span></a>'), "<p>word</p>");
});

test("a trailing non-breaking space on pasted content is dropped; on loaded content it is kept", () => {
  assert.equal(paste('<p>One<span class="EOP">&nbsp;</span></p><p>Two&nbsp;&nbsp;</p>'), "<p>One</p><p>Two</p>");
  assert.equal(load("<p>Two&nbsp;</p>"), "<p>Two&nbsp;</p>");
});

test("spaces that Safari rewrote as non-breaking are plain spaces again, and only when the markup is Safari's", () => {
  const safari = (inner: string): string => `<p style="-webkit-text-stroke-width: 0px;">${inner}</p>`;
  assert.equal(paste(safari("<span>real&nbsp;</span><b>paste</b><span>&nbsp;now</span>")), "<p>real <strong>paste</strong> now</p>");
  assert.equal(paste(safari("10&nbsp;km and Mr.&nbsp;Smith and a&nbsp;&nbsp;b")), "<p>10&nbsp;km and Mr.&nbsp;Smith and a&nbsp;&nbsp;b</p>");
  // Not Safari's markup: nothing is touched.
  assert.equal(paste("<p><span>real&nbsp;</span><b>paste</b></p>"), "<p>real&nbsp;<strong>paste</strong></p>");
});
