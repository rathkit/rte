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
