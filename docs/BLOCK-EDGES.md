# Enter, Shift+Enter, Backspace and Delete at block edges

What each of the four keys does at the edges of every kind of block. **Every row of the table below is a test**
(`packages/rte-core/src/block-edges.test.ts` reads this file): the start is the document with `‸` where the caret is, each key column is
the document after the key, with `‸` where the caret then is, and `(nothing)` means neither the document nor the caret moved. `\n` is
a new line inside a code block. The keys are the editor's own handling of the browser's `insertParagraph`, `insertLineBreak`,
`deleteContentBackward` and `deleteContentForward`, so the same thing happens on every platform; the browser checks repeat a sample in
Chromium, Firefox and WebKit.

## The ideas behind the table

1. **Enter splits the block; on an empty one it leaves.** An empty last list item, definition entry or quote paragraph leaves its
   container (a list item to a paragraph after the list, or one level out of a nested list; a quote paragraph to a paragraph after the
   quote, or the only paragraph of a quote to a plain paragraph). A heading split at its end continues as a paragraph.
2. **Enter in a code block adds a line; on the empty last line it leaves.** The empty line goes and a paragraph follows. Shift+Enter in
   a code block is the same as Enter.
3. **Shift+Enter is a soft line break** in everything that holds text. It never changes the structure.
4. **Backspace at the start of a block undoes the block, then joins it.** In this order: a task loses its checkbox; a list item comes out
   of its list (the first item) or joins the item before; the first paragraph of a quote comes out of the quote; a code block turns
   back into a paragraph (its text stays); a heading with nothing before it turns into a paragraph; a rule before the block goes;
   otherwise the block joins the one before it. Text that cannot join (after a code block, after a table) moves the caret into it instead,
   so the key is never dead; an empty paragraph after a table is removed.
5. **Delete at the end of a block is the same from the other side**: the next block joins, a rule after goes first, and a table is
   entered, not pulled apart. An empty paragraph before a table is removed.
6. **A table is never cut or merged by these keys.** At the edge of a cell Backspace and Delete do nothing (Enter makes a new
   paragraph in the cell; Tab and the arrows move between cells).
7. **A rule between two blocks is removed first** by the key that points at it, and the text on either side stays where it was.
8. **An atom is one character.** An inline image or footnote reference is removed whole by Backspace after it or Delete before it,
   and Enter and Shift+Enter put it on one side or the other of the break.

## Footnotes

A footnote's own text (not its extra paragraphs) is never lifted out of the notes list, merged into another note or joined to the body:
Backspace at its start and Delete at the end of the last body paragraph do nothing. Enter in a note starts another paragraph of the
same note; Enter on an empty note leaves to an empty body paragraph. Shift+Enter is a soft line break. (Tested in
`block-edges.test.ts`, below the table; notes are written out in full there because their HTML carries ids.)

## The table

| Situation | Start | Enter | Shift+Enter | Backspace | Delete |
| --- | --- | --- | --- | --- | --- |
| p | `<p>ab‸cd</p>` | `<p>ab</p><p>‸cd</p>` | `<p>ab<br>‸cd</p>` | `<p>a‸cd</p>` | `<p>ab‸d</p>` |
| p start | `<p>‸abcd</p>` | `<p></p><p>‸abcd</p>` | `<p><br>‸abcd</p>` | (nothing) | `<p>‸bcd</p>` |
| p end | `<p>abcd‸</p>` | `<p>abcd</p><p>‸</p>` | `<p>abcd<br>‸</p>` | `<p>abc‸</p>` | (nothing) |
| p empty | `<p>‸</p>` | `<p></p><p>‸</p>` | `<p><br>‸</p>` | (nothing) | (nothing) |
| p empty after p | `<p>a</p><p>‸</p>` | `<p>a</p><p></p><p>‸</p>` | `<p>a</p><p><br>‸</p>` | `<p>a‸</p>` | (nothing) |
| p start after p | `<p>a</p><p>‸b</p>` | `<p>a</p><p></p><p>‸b</p>` | `<p>a</p><p><br>‸b</p>` | `<p>a‸b</p>` | `<p>a</p><p>‸</p>` |
| h end | `<h2>ab‸</h2>` | `<h2>ab</h2><p>‸</p>` | `<h2>ab<br>‸</h2>` | `<h2>a‸</h2>` | (nothing) |
| h start | `<h2>‸ab</h2>` | `<h2></h2><h2>‸ab</h2>` | `<h2><br>‸ab</h2>` | `<p>‸ab</p>` | `<h2>‸b</h2>` |
| h empty | `<h2>‸</h2>` | `<h2></h2><p>‸</p>` | `<h2><br>‸</h2>` | `<p>‸</p>` | (nothing) |
| h after p start | `<p>a</p><h2>‸b</h2>` | `<p>a</p><h2></h2><h2>‸b</h2>` | `<p>a</p><h2><br>‸b</h2>` | `<p>a‸b</p>` | `<p>a</p><h2>‸</h2>` |
| p after h start | `<h2>a</h2><p>‸b</p>` | `<h2>a</h2><p></p><p>‸b</p>` | `<h2>a</h2><p><br>‸b</p>` | `<h2>a‸b</h2>` | `<h2>a</h2><p>‸</p>` |
| li mid | `<ul><li>ab‸cd</li></ul>` | `<ul><li>ab</li><li>‸cd</li></ul>` | `<ul><li>ab<br>‸cd</li></ul>` | `<ul><li>a‸cd</li></ul>` | `<ul><li>ab‸d</li></ul>` |
| li end | `<ul><li>ab‸</li></ul>` | `<ul><li>ab</li><li>‸</li></ul>` | `<ul><li>ab<br>‸</li></ul>` | `<ul><li>a‸</li></ul>` | (nothing) |
| li empty only | `<ul><li>‸</li></ul>` | `<p>‸</p>` | `<ul><li><br>‸</li></ul>` | `<p>‸</p>` | (nothing) |
| li empty last | `<ul><li>a</li><li>‸</li></ul>` | `<ul><li>a</li></ul><p>‸</p>` | `<ul><li>a</li><li><br>‸</li></ul>` | `<ul><li>a‸</li></ul>` | (nothing) |
| li empty first of 2 | `<ul><li>‸</li><li>b</li></ul>` | `<p>‸</p><ul><li>b</li></ul>` | `<ul><li><br>‸</li><li>b</li></ul>` | `<p>‸</p><ul><li>b</li></ul>` | `<ul><li>‸b</li></ul>` |
| li start 2nd | `<ul><li>a</li><li>‸b</li></ul>` | `<ul><li>a</li><li></li><li>‸b</li></ul>` | `<ul><li>a</li><li><br>‸b</li></ul>` | `<ul><li>a‸b</li></ul>` | `<ul><li>a</li><li>‸</li></ul>` |
| li start 1st | `<ul><li>‸a</li><li>b</li></ul>` | `<ul><li></li><li>‸a</li><li>b</li></ul>` | `<ul><li><br>‸a</li><li>b</li></ul>` | `<p>‸a</p><ul><li>b</li></ul>` | `<ul><li>‸</li><li>b</li></ul>` |
| li end 1st | `<ul><li>a‸</li><li>b</li></ul>` | `<ul><li>a</li><li>‸</li><li>b</li></ul>` | `<ul><li>a<br>‸</li><li>b</li></ul>` | `<ul><li>‸</li><li>b</li></ul>` | `<ul><li>a‸b</li></ul>` |
| li end last | `<ul><li>a</li><li>b‸</li></ul>` | `<ul><li>a</li><li>b</li><li>‸</li></ul>` | `<ul><li>a</li><li>b<br>‸</li></ul>` | `<ul><li>a</li><li>‸</li></ul>` | (nothing) |
| nested empty last child | `<ul><li>a<ul><li>b</li><li>‸</li></ul></li></ul>` | `<ul><li>a<ul><li>b</li></ul></li><li>‸</li></ul>` | `<ul><li>a<ul><li>b</li><li><br>‸</li></ul></li></ul>` | `<ul><li>a<ul><li>b‸</li></ul></li></ul>` | (nothing) |
| nested only empty child | `<ul><li>a<ul><li>‸</li></ul></li></ul>` | `<ul><li>a</li><li>‸</li></ul>` | `<ul><li>a<ul><li><br>‸</li></ul></li></ul>` | `<ul><li>a</li><li>‸</li></ul>` | (nothing) |
| nested li start | `<ul><li>a<ul><li>‸b</li></ul></li></ul>` | `<ul><li>a<ul><li></li><li>‸b</li></ul></li></ul>` | `<ul><li>a<ul><li><br>‸b</li></ul></li></ul>` | `<ul><li>a</li><li>‸b</li></ul>` | `<ul><li>a<ul><li>‸</li></ul></li></ul>` |
| li end before nested | `<ul><li>a‸<ul><li>b</li></ul></li></ul>` | `<ul><li>a</li><li>‸<ul><li>b</li></ul></li></ul>` | `<ul><li>a<br>‸<ul><li>b</li></ul></li></ul>` | `<ul><li>‸<ul><li>b</li></ul></li></ul>` | `<ul><li>a‸b</li></ul>` |
| li start after list | `<ul><li>a</li></ul><p>‸b</p>` | `<ul><li>a</li></ul><p></p><p>‸b</p>` | `<ul><li>a</li></ul><p><br>‸b</p>` | `<ul><li>a‸b</li></ul>` | `<ul><li>a</li></ul><p>‸</p>` |
| p end before list | `<p>a‸</p><ul><li>b</li></ul>` | `<p>a</p><p>‸</p><ul><li>b</li></ul>` | `<p>a<br>‸</p><ul><li>b</li></ul>` | `<p>‸</p><ul><li>b</li></ul>` | `<p>a‸b</p>` |
| ol empty last | `<ol><li>a</li><li>‸</li></ol>` | `<ol><li>a</li></ol><p>‸</p>` | `<ol><li>a</li><li><br>‸</li></ol>` | `<ol><li>a‸</li></ol>` | (nothing) |
| quote p mid | `<blockquote><p>ab‸cd</p></blockquote>` | `<blockquote><p>ab</p><p>‸cd</p></blockquote>` | `<blockquote><p>ab<br>‸cd</p></blockquote>` | `<blockquote><p>a‸cd</p></blockquote>` | `<blockquote><p>ab‸d</p></blockquote>` |
| quote empty p only | `<blockquote><p>‸</p></blockquote>` | `<p>‸</p>` | `<blockquote><p><br>‸</p></blockquote>` | `<p>‸</p>` | (nothing) |
| quote empty last of 2 | `<blockquote><p>a</p><p>‸</p></blockquote>` | `<blockquote><p>a</p></blockquote><p>‸</p>` | `<blockquote><p>a</p><p><br>‸</p></blockquote>` | `<blockquote><p>a‸</p></blockquote>` | (nothing) |
| quote start first | `<blockquote><p>‸a</p></blockquote>` | `<blockquote><p></p><p>‸a</p></blockquote>` | `<blockquote><p><br>‸a</p></blockquote>` | `<p>‸a</p>` | `<blockquote><p>‸</p></blockquote>` |
| quote start 2nd | `<blockquote><p>a</p><p>‸b</p></blockquote>` | `<blockquote><p>a</p><p></p><p>‸b</p></blockquote>` | `<blockquote><p>a</p><p><br>‸b</p></blockquote>` | `<blockquote><p>a‸b</p></blockquote>` | `<blockquote><p>a</p><p>‸</p></blockquote>` |
| p after quote start | `<blockquote><p>a</p></blockquote><p>‸b</p>` | `<blockquote><p>a</p></blockquote><p></p><p>‸b</p>` | `<blockquote><p>a</p></blockquote><p><br>‸b</p>` | `<blockquote><p>a‸b</p></blockquote>` | `<blockquote><p>a</p></blockquote><p>‸</p>` |
| quote end before p | `<blockquote><p>a‸</p></blockquote><p>b</p>` | `<blockquote><p>a</p><p>‸</p></blockquote><p>b</p>` | `<blockquote><p>a<br>‸</p></blockquote><p>b</p>` | `<blockquote><p>‸</p></blockquote><p>b</p>` | `<blockquote><p>a‸b</p></blockquote>` |
| p start first doc | `<p>‸a</p>` | `<p></p><p>‸a</p>` | `<p><br>‸a</p>` | (nothing) | `<p>‸</p>` |
| code mid | `<pre>ab‸cd</pre>` | `<pre>ab\n‸cd</pre>` | `<pre>ab\n‸cd</pre>` | `<pre>a‸cd</pre>` | `<pre>ab‸d</pre>` |
| code end | `<pre>ab‸</pre>` | `<pre>ab\n‸</pre>` | `<pre>ab\n‸</pre>` | `<pre>a‸</pre>` | (nothing) |
| code empty | `<pre>‸</pre>` | `<pre>\n‸</pre>` | `<pre>\n‸</pre>` | `<p>‸</p>` | (nothing) |
| code start | `<pre>‸ab</pre>` | `<pre>\n‸ab</pre>` | `<pre>\n‸ab</pre>` | `<p>‸ab</p>` | `<pre>‸b</pre>` |
| p start after code | `<pre>a</pre><p>‸b</p>` | `<pre>a</pre><p></p><p>‸b</p>` | `<pre>a</pre><p><br>‸b</p>` | `<pre>a‸</pre><p>b</p>` | `<pre>a</pre><p>‸</p>` |
| code end before p | `<pre>a‸</pre><p>b</p>` | `<pre>a\n‸</pre><p>b</p>` | `<pre>a\n‸</pre><p>b</p>` | `<pre>‸</pre><p>b</p>` | `<pre>a</pre><p>‸b</p>` |
| empty p after code | `<pre>a</pre><p>‸</p>` | `<pre>a</pre><p></p><p>‸</p>` | `<pre>a</pre><p><br>‸</p>` | `<pre>a‸</pre>` | (nothing) |
| cell mid | `<table><tbody><tr><td>ab‸cd</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td><p>ab</p><p>‸cd</p></td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td>ab<br>‸cd</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td>a‸cd</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td>ab‸d</td><td>x</td></tr></tbody></table>` |
| cell start 2nd | `<table><tbody><tr><td>a</td><td>‸x</td></tr></tbody></table>` | `<table><tbody><tr><td>a</td><td><p></p><p>‸x</p></td></tr></tbody></table>` | `<table><tbody><tr><td>a</td><td><br>‸x</td></tr></tbody></table>` | (nothing) | `<table><tbody><tr><td>a</td><td>‸</td></tr></tbody></table>` |
| cell end 1st | `<table><tbody><tr><td>a‸</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td><p>a</p><p>‸</p></td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td>a<br>‸</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td>‸</td><td>x</td></tr></tbody></table>` | (nothing) |
| cell empty | `<table><tbody><tr><td>‸</td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td><p></p><p>‸</p></td><td>x</td></tr></tbody></table>` | `<table><tbody><tr><td><br>‸</td><td>x</td></tr></tbody></table>` | (nothing) | (nothing) |
| cell start first | `<table><tbody><tr><td>‸a</td></tr></tbody></table>` | `<table><tbody><tr><td><p></p><p>‸a</p></td></tr></tbody></table>` | `<table><tbody><tr><td><br>‸a</td></tr></tbody></table>` | (nothing) | `<table><tbody><tr><td>‸</td></tr></tbody></table>` |
| cell end last | `<table><tbody><tr><td>a‸</td></tr></tbody></table>` | `<table><tbody><tr><td><p>a</p><p>‸</p></td></tr></tbody></table>` | `<table><tbody><tr><td>a<br>‸</td></tr></tbody></table>` | `<table><tbody><tr><td>‸</td></tr></tbody></table>` | (nothing) |
| p start after table | `<table><tbody><tr><td>a</td></tr></tbody></table><p>‸b</p>` | `<table><tbody><tr><td>a</td></tr></tbody></table><p></p><p>‸b</p>` | `<table><tbody><tr><td>a</td></tr></tbody></table><p><br>‸b</p>` | `<table><tbody><tr><td>a‸</td></tr></tbody></table><p>b</p>` | `<table><tbody><tr><td>a</td></tr></tbody></table><p>‸</p>` |
| p end before table | `<p>a‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p>a</p><p>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p>a<br>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p>a</p><table><tbody><tr><td>‸b</td></tr></tbody></table>` |
| empty p after table | `<table><tbody><tr><td>a</td></tr></tbody></table><p>‸</p>` | `<table><tbody><tr><td>a</td></tr></tbody></table><p></p><p>‸</p>` | `<table><tbody><tr><td>a</td></tr></tbody></table><p><br>‸</p>` | `<table><tbody><tr><td>a‸</td></tr></tbody></table>` | (nothing) |
| empty p before table | `<p>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p></p><p>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | `<p><br>‸</p><table><tbody><tr><td>b</td></tr></tbody></table>` | (nothing) | `<table><tbody><tr><td>‸b</td></tr></tbody></table>` |
| cell 2 paras start 2nd | `<table><tbody><tr><td><p>a</p><p>‸b</p></td></tr></tbody></table>` | `<table><tbody><tr><td><p>a</p><p></p><p>‸b</p></td></tr></tbody></table>` | `<table><tbody><tr><td><p>a</p><p><br>‸b</p></td></tr></tbody></table>` | `<table><tbody><tr><td>a‸b</td></tr></tbody></table>` | `<table><tbody><tr><td><p>a</p><p>‸</p></td></tr></tbody></table>` |
| cell list empty last | `<table><tbody><tr><td><ul><li>a</li><li>‸</li></ul></td></tr></tbody></table>` | `<table><tbody><tr><td><ul><li>a</li></ul><p>‸</p></td></tr></tbody></table>` | `<table><tbody><tr><td><ul><li>a</li><li><br>‸</li></ul></td></tr></tbody></table>` | `<table><tbody><tr><td><ul><li>a‸</li></ul></td></tr></tbody></table>` | (nothing) |
| hr: p after | `<p>a</p><hr><p>‸b</p>` | `<p>a</p><hr><p></p><p>‸b</p>` | `<p>a</p><hr><p><br>‸b</p>` | `<p>a</p><p>‸b</p>` | `<p>a</p><hr><p>‸</p>` |
| hr: p before end | `<p>a‸</p><hr><p>b</p>` | `<p>a</p><p>‸</p><hr><p>b</p>` | `<p>a<br>‸</p><hr><p>b</p>` | `<p>‸</p><hr><p>b</p>` | `<p>a‸</p><p>b</p>` |
| hr: empty p after | `<p>a</p><hr><p>‸</p>` | `<p>a</p><hr><p></p><p>‸</p>` | `<p>a</p><hr><p><br>‸</p>` | `<p>a</p><p>‸</p>` | (nothing) |
| atom: img after | `<p>a<img src="x.png" alt="i">‸b</p>` | `<p>a<img src="x.png" alt="i"></p><p>‸b</p>` | `<p>a<img src="x.png" alt="i"><br>‸b</p>` | `<p>a‸b</p>` | `<p>a<img src="x.png" alt="i">‸</p>` |
| atom: img before | `<p>a‸<img src="x.png" alt="i">b</p>` | `<p>a</p><p>‸<img src="x.png" alt="i">b</p>` | `<p>a<br>‸<img src="x.png" alt="i">b</p>` | `<p>‸<img src="x.png" alt="i">b</p>` | `<p>a‸b</p>` |
| atom: only img after | `<p><img src="x.png" alt="i">‸</p>` | `<p><img src="x.png" alt="i"></p><p>‸</p>` | `<p><img src="x.png" alt="i"><br>‸</p>` | `<p>‸</p>` | (nothing) |
| dl dt end | `<dl><dt>a‸</dt><dd>b</dd></dl>` | `<dl><dt>a</dt><dd>‸</dd><dd>b</dd></dl>` | `<dl><dt>a<br>‸</dt><dd>b</dd></dl>` | `<dl><dt>‸</dt><dd>b</dd></dl>` | `<dl><dt>a‸b</dt></dl>` |
| dl dd empty | `<dl><dt>a</dt><dd>‸</dd></dl>` | `<dl><dt>a</dt></dl><p>‸</p>` | `<dl><dt>a</dt><dd><br>‸</dd></dl>` | `<dl><dt>a‸</dt></dl>` | (nothing) |
| dl dd start | `<dl><dt>a</dt><dd>‸b</dd></dl>` | `<dl><dt>a</dt><dd></dd><dd>‸b</dd></dl>` | `<dl><dt>a</dt><dd><br>‸b</dd></dl>` | `<dl><dt>a‸b</dt></dl>` | `<dl><dt>a</dt><dd>‸</dd></dl>` |
| br then caret | `<p>a<br>‸b</p>` | `<p>a<br></p><p>‸b</p>` | `<p>a<br><br>‸b</p>` | `<p>a‸b</p>` | `<p>a<br>‸</p>` |
| code after Enter at end | `<pre>ab\n‸</pre>` | `<pre>ab</pre><p>‸</p>` | `<pre>ab\n\n‸</pre>` | `<pre>ab‸</pre>` | (nothing) |
| code after Enter mid-doc | `<pre>ab\n‸</pre><p>x</p>` | `<pre>ab</pre><p>‸</p><p>x</p>` | `<pre>ab\n\n‸</pre><p>x</p>` | `<pre>ab‸</pre><p>x</p>` | `<pre>ab\n</pre><p>‸x</p>` |
| code empty line mid | `<pre>ab\n‸\ncd</pre>` | `<pre>ab\n\n‸\ncd</pre>` | `<pre>ab\n\n‸\ncd</pre>` | `<pre>ab‸\ncd</pre>` | `<pre>ab\n‸cd</pre>` |
