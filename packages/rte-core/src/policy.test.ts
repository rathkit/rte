// The content policy: docs/CONTENT-POLICY.md is compared with the tables in policy.ts and with the importer's source, and
// each rule on the page has a hostile-markup test (named `rule N`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SIDES } from "./cellborder.ts";
import { createEngine } from "./core.ts";
import { exportHtml } from "./export.ts";
import { defaultPaste } from "./paste.ts";
import { importBlocks, importHtml, type ImportOptions } from "./import.ts";
import { parseMarkdown } from "./markdown/parse.ts";
import {
  CONTENT_PROFILES, DATA_IMAGE_SIGNATURES, DEFAULT_LINK_SCHEMES, DROPPED_ELEMENTS, GROUPING_ELEMENTS,
  contentPolicy, type ContentProfile,
} from "./policy.ts";
import { KEPT_ELEMENTS, READ_ATTRIBUTES, READ_STYLES } from "./policy-tables.ts";

const page = readFileSync(new URL("../../../docs/CONTENT-POLICY.md", import.meta.url), "utf8");
const source = readFileSync(new URL("./import.ts", import.meta.url), "utf8");

/** The rows of the first table under a `## heading`, as cell texts without backticks. */
function table(heading: string): string[][] {
  const start = page.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the page has no "${heading}" section`);
  const end = page.indexOf("\n## ", start + 1);
  const rows = page.slice(start, end === -1 ? undefined : end).split("\n").filter((l) => l.startsWith("|")).slice(2);
  return rows.map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", "")));
}

const load = (html: string, options: ImportOptions = {}): string => exportHtml(importHtml(html, options));
const paste = (html: string, options: ImportOptions = {}): string => exportHtml({ blocks: defaultPaste({ html }, options) });

// ---- the page matches the tables, and the tables match the code ----------------------------------------------------

test("the elements table lists exactly the elements in policy.ts, each with what happens to it", () => {
  const rows = table("Elements");
  const listed = new Map(rows.map(([tag, what]) => [tag as string, what as string]));
  assert.equal(listed.size, rows.length, "an element is listed twice");
  const expected = new Map<string, string>();
  for (const [tag, meaning] of Object.entries(KEPT_ELEMENTS)) expected.set(tag, `kept: ${meaning}`);
  for (const tag of GROUPING_ELEMENTS) expected.set(tag, "grouping: ends the paragraph around it, its content is kept");
  for (const tag of DROPPED_ELEMENTS) expected.set(tag, "dropped with everything inside it");
  assert.deepEqual([...listed].sort(), [...expected].sort());
  assert.equal(new Set([...Object.keys(KEPT_ELEMENTS), ...GROUPING_ELEMENTS, ...DROPPED_ELEMENTS]).size, Object.keys(KEPT_ELEMENTS).length + GROUPING_ELEMENTS.size + DROPPED_ELEMENTS.size, "an element is in two groups");
});

test("the attributes table lists exactly the attributes the importer reads", () => {
  assert.deepEqual(Object.fromEntries(table("Attributes").map(([k, v]) => [k, v])), READ_ATTRIBUTES);
  const read = new Set<string>();
  for (const m of source.matchAll(/attrs(?:\.([a-z]+)|\["([a-z-]+)"\])/g)) read.add((m[1] ?? m[2]) as string);
  assert.deepEqual([...read].sort(), Object.keys(READ_ATTRIBUTES).sort(), "the importer reads an attribute the page does not list, or the page lists one it does not read");
});

test("the style table lists exactly the properties the importer reads", () => {
  assert.deepEqual(Object.fromEntries(table("Style properties").map(([k, v]) => [k, v])), READ_STYLES);
  const read = new Set<string>();
  for (const m of source.matchAll(/(?:style|parseStyle\([^)]*\))\.(?:get|has)\("([a-z-]+)"\)|\.get\("([a-z-]+)"\)/g)) read.add((m[1] ?? m[2]) as string);
  for (const side of SIDES) if (source.includes("`border-${side}`")) read.add(`border-${side}`);
  assert.deepEqual([...read].sort(), Object.keys(READ_STYLES).sort());
});

test("the profiles table says what the profiles are", () => {
  const rows = new Map(table("Limits and profiles").map(([choice, ...cells]) => [choice as string, cells]));
  const profiles: ContentProfile[] = ["strict", "standard", "loose"];
  const number = (text: string): number => Number(text.replace(/,/g, "").replace(/\s.*$/, ""));
  profiles.forEach((name, i) => {
    const p = CONTENT_PROFILES[name];
    assert.equal(rows.get("linkSchemes")?.[i], p.linkSchemes.join(", "), `${name} linkSchemes`);
    assert.equal(rows.get("styles when loading")?.[i], p.styles, `${name} styles`);
    assert.equal(number(rows.get("maxDataImageLength (characters)")?.[i] as string), p.maxDataImageLength, `${name} maxDataImageLength`);
    assert.equal(number(rows.get("maxDepth (nested elements)")?.[i] as string), p.maxDepth, `${name} maxDepth`);
    assert.equal(number(rows.get("maxInputLength (characters)")?.[i] as string), p.maxInputLength, `${name} maxInputLength`);
  });
  assert.deepEqual(CONTENT_PROFILES.standard.linkSchemes, DEFAULT_LINK_SCHEMES);
});

test("a profile with single choices on top: the choice wins, the rest is the profile's", () => {
  const p = contentPolicy({ profile: "strict", maxDepth: 5, linkSchemes: undefined });
  assert.equal(p.maxDepth, 5);
  assert.deepEqual(p.linkSchemes, CONTENT_PROFILES.strict.linkSchemes);
  assert.equal(p.maxInputLength, CONTENT_PROFILES.strict.maxInputLength);
  assert.deepEqual(contentPolicy(), CONTENT_PROFILES.standard);
});

// ---- hostile markup, one test per rule -------------------------------------------------------------------------------

test("rule 1: dropped elements go with their content, every one of them", () => {
  const empty = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  for (const tag of DROPPED_ELEMENTS) {
    // A void element has no content to drop; the others take everything inside them along.
    const out = load(`<p>a</p><${tag} src="x">${empty.has(tag) ? "" : 'SECRET<img src="https://x/y.png"><p>INSIDE</p>'}${empty.has(tag) ? "" : `</${tag}>`}<p>b</p>`);
    assert.ok(!out.includes("SECRET") && !out.includes("INSIDE"), `${tag} kept its content: ${out}`);
    assert.ok(!out.includes("<" + tag), tag);
    assert.ok(out.includes("<p>a</p>") && out.includes("<p>b</p>"), `${tag} took its neighbors: ${out}`);
  }
});

test("rule 2: an attribute that is not listed changes nothing", () => {
  const hostile = '<p onclick="x()" onmouseover="x()" contenteditable="true" srcset="a b" data-x="1" accesskey="x" formaction="x" ping="x">hi</p><img src="https://x/y.png" onerror="x()" srcset="a" loading="eager"><a href="https://x" onclick="x()" rel="opener" download="f" ping="p">l</a>';
  assert.equal(load(hostile), load('<p>hi</p><img src="https://x/y.png"><a href="https://x">l</a>'));
  assert.equal(paste(hostile), paste('<p>hi</p><img src="https://x/y.png"><a href="https://x">l</a>'));
});

test("rule 3: a link keeps only an allowed scheme, however the scheme is written", () => {
  const forms = [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " \tjavascript:alert(1)", "java&#9;script:alert(1)", "java&#x0A;script:alert(1)", "jav\u0000ascript:x",
    "&#106;avascript:alert(1)", "vbscript:x", "data:text/html,<script>1</script>", "file:///etc/passwd", "blob:https://x/1", "\\\\host\\share",
  ];
  for (const href of forms) {
    const out = load(`<p><a href="${href}">text</a></p>`);
    assert.equal(out, "<p>text</p>", `${JSON.stringify(href)} -> ${out}`);
  }
  // A name the reader does not know stays as typed, so it cannot hide a scheme: whatever is kept, a browser resolves it to an allowed one.
  for (const href of ["javascript&colon;alert(1)", "java&Tab;script:alert(1)", "java&NewLine;script:alert(1)", "&#x6A;avascript&#58;alert(1)"]) {
    for (const block of importBlocks(`<p><a href="${href}">t</a></p>`)) {
      for (const node of block.type === "p" ? block.content : []) {
        const link = node.type === "text" ? node.marks.find((m) => m.type === "link") : undefined;
        if (link?.type === "link") assert.ok(["https:", "http:", "mailto:", "tel:"].includes(new URL(link.href, "https://base.test/").protocol), `${href} -> ${link.href}`);
      }
    }
  }
  for (const href of ["https://x/", "http://x/", "mailto:a@b.c", "tel:+1", "/relative", "#frag", "page.html"]) assert.ok(load(`<p><a href="${href}">t</a></p>`).includes("<a "), href);
  // The schemes the host allows are the ones that work.
  assert.ok(!load('<p><a href="tel:+1">t</a></p>', { linkSchemes: ["https"] }).includes("<a "));
  assert.ok(load('<p><a href="ftp://x/f">t</a></p>', { linkSchemes: ["ftp"] }).includes("<a "));
  assert.ok(!load('<p><a href="ftp://x/f">t</a></p>').includes("<a "), "ftp is not in the standard profile");
});

test("rule 4: an image keeps only a remote address or real raster bytes", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const refused = [
    "javascript:alert(1)", "file:///etc/passwd", "blob:https://x/1", "ftp://x/a.png", "data:text/html;base64,PHNjcmlwdD4=",
    `data:image/png;base64,${"A".repeat(40)}`, "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+", "data:image/svg+xml,<svg onload=alert(1)>", "data:image/png,notbase64",
  ];
  for (const src of refused) assert.ok(!load(`<p>a<img src="${src}">b</p>`).includes("<img"), src);
  assert.equal(load(`<p>a<img src="${src_(png)}">b</p>`).includes("<img"), true, "a real PNG is kept");
  assert.equal(load(`<p>a<img src="data:image/jpeg;base64,${png}">b</p>`).includes("<img"), true, "the bytes are trusted, not the declared type");
  assert.equal(load(`<p>a<img src="${src_(png)}">b</p>`, { maxDataImageLength: 50 }).includes("<img"), false, "over the size limit");
  assert.equal(load(`<p>a<img src="${src_(png)}">b</p>`, { maxDataImageLength: 0 }).includes("<img"), false, "strict allows no data images");
  assert.equal(load('<p>a<img src="https://x/y.png">b</p>').includes("<img"), true);
  for (const src of ["/a.png", "a/b.png", "//x/a.png"]) assert.equal(load(`<p><img src="${src}"></p>`).includes("<img"), true, `${src} is kept as written`);
  assert.equal(load('<p>a<img src="https://x/y.png">b</p>').replace(/<img[^>]*>/, ""), "<p>ab</p>");
  assert.deepEqual(DATA_IMAGE_SIGNATURES.map(([type]) => type), ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
});
const src_ = (png: string): string => `data:image/png;base64,${png}`;

test("rule 5: hidden content is dropped", () => {
  assert.equal(load('<p>a</p><p hidden>SECRET</p><div style="display:none"><p>SECRET</p></div><p style="DISPLAY : NONE">SECRET</p><p>b</p>'), "<p>a</p><p>b</p>");
});

test("rule 6: a style value that is not a plain color or length gives nothing", () => {
  const colors = ["red url(http://x/y)", "expression(alert(1))", "var(--x)", "url(x)", "#12", "rgb(1,2,3", "rgb(a,b,c)", "javascript:x", "red\\0"];
  for (const value of colors) {
    const out = load(`<p><span style="color: ${value}">x</span></p>`);
    assert.ok(!/color|url|expression|var\(/i.test(out), `${value} -> ${out}`);
  }
  // A second declaration after a good one is read on its own merits.
  assert.ok(!/url|background/.test(load('<p><span style="color: red;background:url(http://x/y)">x</span></p>')));
  assert.ok(load('<p><span style="color: #ff0000">x</span></p>').includes("#ff0000"));
  assert.ok(load('<p><span style="color: rgb(1, 2, 3)">x</span></p>').includes("rgb(1, 2, 3)"));
  assert.ok(!/url|position|z-index|font-size|width/i.test(load('<p style="position:fixed;z-index:9;font-size:900px;width:9999px;background:url(x)"><span style="font-family:x;cursor:url(y)">x</span></p>')));
});

test("rule 7: numbers are bounded, and no table size makes the reader throw", () => {
  const cell = (attrs: string): string => importBlocks(`<table><tr><td ${attrs}>a</td></tr></table>`).map((b) => (b.type === "table" ? JSON.stringify(b.rows[0]?.[0]) : "")).join("");
  assert.match(cell('colspan="999999999"'), /"colspan":100/);
  assert.match(cell('rowspan="999999999"'), /"rowspan":100/);
  assert.match(cell('colspan="-5" rowspan="abc"'), /"colspan":1,"rowspan":1/);
  assert.doesNotThrow(() => load('<table><colgroup><col span="99999999"></colgroup><tr><td colspan="999999999">a</td></tr></table>'));
  assert.doesNotThrow(() => load(`<table>${"<tr><td>x</td></tr>".repeat(300_000)}</table>`));
  assert.doesNotThrow(() => load(`<table><tr>${"<td>x</td>".repeat(100_000)}</tr></table>`));
  assert.ok(!load('<ol start="99999999999"><li>a</li></ol>').includes("start"));
  assert.ok(!load('<ol start="-3"><li>a</li></ol>').includes("start"));
  assert.ok(load('<ol start="5"><li>a</li></ol>').includes('start="5"'));
  assert.ok(!load('<p><img src="https://x/y.png" width="9999999" height="-4"></p>').includes("width"));
  const indent = importBlocks('<p style="margin-left: 99999px">x</p>')[0];
  assert.ok(indent?.type === "p" && (indent.indent ?? 0) <= 8);
  assert.ok(!load(`<p><img src="https://x/y.png" data-caption="${"c".repeat(5000)}"></p>`).includes("c".repeat(1001)));
  assert.ok(!load('<p><sup data-note="a b<script>">1</sup></p>').includes("script"));
});

test("rule 8: nesting is bounded, and any depth reads without an error", () => {
  for (const open of ["<div>", "<span>", "<b>", "<blockquote>", "<ul><li>", "<table><tr><td>", "<a href=\"https://x\">", "<p>", "<h1>"]) {
    const out = load(`${open.repeat(200_000)}deep`);
    // Text straight inside a table, outside any cell, is not a cell's; it goes as it does in every browser.
    if (!open.startsWith("<table")) assert.ok(out.includes("deep"), `${open}: the text is kept`);
  }
  const cut = load(`${"<blockquote>".repeat(10)}x`, { maxDepth: 3 });
  assert.equal(cut, "<blockquote><blockquote><blockquote><p>x</p></blockquote></blockquote></blockquote>");
  assert.equal(load("<div>".repeat(5) + "x", { maxDepth: 2 }), "<p>x</p>");
  // The depth is the host's to set.
  const e = createEngine({ content: { profile: "strict" } });
  assert.equal(e.importOptions.maxDepth, CONTENT_PROFILES.strict.maxDepth);
});

test("rule 9: input over the limit is refused whole, and the host is told", () => {
  const told: unknown[] = [];
  const opts: ImportOptions = { maxInputLength: 100, onLimit: (info) => told.push(info) };
  assert.equal(load(`<p>${"a".repeat(200)}</p>`, opts), "<p></p>");
  assert.deepEqual(told, [{ limit: "maxInputLength", max: 100, length: 207 }]);
  assert.equal(load("<p>short</p>", opts), "<p>short</p>");
  assert.equal(told.length, 1);
  // Pasted HTML and pasted plain text.
  assert.deepEqual(defaultPaste({ html: `<p>${"a".repeat(200)}</p>` }, opts), []);
  assert.deepEqual(defaultPaste({ text: "b".repeat(200) }, opts), []);
  assert.equal(told.length, 3);
  assert.equal(exportHtml({ blocks: defaultPaste({ text: "b".repeat(50) }, opts) }), `<p>${"b".repeat(50)}</p>`);
  // The editor says so in its warning handler.
  const warnings: string[] = [];
  const e = createEngine({ content: { maxInputLength: 10 }, onWarning: (m) => warnings.push(m) });
  importHtml("<p>0123456789ABC</p>", e.importOptions);
  assert.match(warnings[0] as string, /limit is 10/);
  // Two hundred million characters are refused under the standard limit, and quickly.
  const t = Date.now();
  assert.equal(importBlocks("<p>" + "a".repeat(60_000_000)).length, 0);
  assert.ok(Date.now() - t < 2000);
});

test("rule 10: an unknown element is unwrapped; comments and the like are dropped", () => {
  assert.equal(load("<p>a <x-widget data-x='1'>b</x-widget> <label>c</label> <mark>d</mark></p>"), "<p>a b c d</p>");
  assert.equal(load("<table><caption>CAP</caption><tr><td>x</td></tr></table>").includes("CAP"), false);
  assert.equal(load("<!DOCTYPE html><!-- SECRET --><?php SECRET ?><![CDATA[SECRET]]><p>a</p><![if !x]>"), "<p>a</p>");
  assert.equal(load("<p>a</p><svg><script>SECRET</script><text>t</text></svg>").includes("SECRET"), false);
  assert.equal(load("<p>a</p><math><mi>x</mi></math>").includes("<math"), false);
});

test("rule 11: pasting reads meaning, not looks", () => {
  const styled = '<p style="text-align:center;margin-left:64px"><span style="color:red;background-color:yellow;font-weight:bold">x</span><img src="https://x/y.png" style="float:right"></p>';
  assert.match(load(styled), /color|center|float/);
  const pasted = paste(styled);
  assert.ok(!/color|center|float|margin|background/.test(pasted), pasted);
  assert.ok(pasted.includes("<strong>"), "meaning stays");
  // Even a loose profile pastes semantic.
  assert.ok(!/color/.test(paste(styled, { styles: "allowlist" })));
});

test("rule 12: the profiles differ where the page says, and a plain text paste or Markdown cannot sneak around them", () => {
  const strict = createEngine({ content: { profile: "strict" } }).importOptions;
  const loose = createEngine({ content: { profile: "loose" } }).importOptions;
  const std = createEngine().importOptions;
  const doc = '<p><a href="tel:1">t</a><a href="ftp://x">f</a><span style="color:red">c</span></p>';
  assert.equal((load(doc, strict).match(/<a /g) ?? []).length, 0);
  assert.equal((load(doc, std).match(/<a /g) ?? []).length, 1);
  assert.equal((load(doc, loose).match(/<a /g) ?? []).length, 2);
  assert.ok(!load(doc, strict).includes("color"));
  assert.ok(load(doc, std).includes("color"));
  // Markdown: links are checked, raw HTML is text.
  const md = parseMarkdown('[a](javascript:alert(1)) [b](https://x) <script>SECRET</script> <img src=x onerror=y> ![i](javascript:x)');
  const out = exportHtml({ blocks: md });
  assert.ok(!out.includes("javascript:") && out.includes('href="https://x"'));
  assert.ok(!out.includes("<script") && !out.includes("<img src=x"), out);
});
