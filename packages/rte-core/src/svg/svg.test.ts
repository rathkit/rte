import assert from "node:assert/strict";
import { test } from "node:test";
import { exportHtml } from "../export.ts";
import { importBlocks } from "../import.ts";
import { decodeBase64, encodeBase64 } from "../base64.ts";
import { sanitizeSvg, sanitizeSvgDataUrl } from "./svg.ts";

const wrap = (inner: string, attrs = ""): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

test("an ordinary picture keeps its shapes, its case-sensitive names and its internal references", () => {
  const source = `<?xml version="1.0"?><!-- made by a drawing program --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
    <rect x="1" y="1" width="8" height="8" fill="url(#g)" stroke="black" style="stroke-width:0.5; fill-opacity: 0.9"/>
    <text x="2" y="9" font-family="Arial">Hi &amp; bye</text><use href="#g"/></svg>`;
  const clean = sanitizeSvg(source) as string;
  assert.ok(clean.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"'), clean);
  assert.ok(clean.includes("<linearGradient"));
  assert.ok(clean.includes('fill="url(#g)"'));
  assert.ok(clean.includes('style="stroke-width:0.5;fill-opacity:0.9"'));
  assert.ok(clean.includes("Hi &amp; bye"));
  assert.ok(clean.includes('<use href="#g"/>'));
  assert.ok(!clean.includes("made by"));
});

test("everything that can run script or load a file is removed", () => {
  const attacks: Record<string, string> = {
    script: wrap("<script>alert(1)</script><rect/>"),
    "upper-case script": wrap("<SCRIPT>alert(1)</SCRIPT><rect/>"),
    "prefixed script": wrap("<svg:script>alert(1)</svg:script><rect/>"),
    "event handler": wrap('<rect onload="alert(1)" onclick="alert(1)"/>', 'onload="alert(1)"'),
    foreignObject: wrap('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></div></foreignObject>'),
    link: wrap('<a xlink:href="javascript:alert(1)"><rect/></a>'),
    "external use": wrap('<use href="https://evil.test/x.svg#a"/><use xlink:href="data:image/svg+xml;base64,PHN2Zz4="/>'),
    image: wrap('<image href="https://evil.test/track.png"/>'),
    animation: wrap('<a><animate attributeName="href" values="javascript:alert(1)"/></a><set attributeName="onload" to="alert(1)"/>'),
    "style element": wrap("<style>@import url(https://evil.test/a.css); rect{fill:red}</style><rect/>"),
    "style attribute": wrap('<rect style="fill:url(https://evil.test/a.svg#x); background:url(x); behavior:url(x); stroke:red"/>'),
    "css expression": wrap('<rect style="width:expression(alert(1)); stroke:red"/>'),
    "external paint": wrap('<rect fill="url(https://evil.test/x#a)" stroke="url(data:image/svg+xml;base64,AAAA)"/>'),
    "encoded scheme": wrap('<rect fill="java&#115;cript:alert(1)" stroke="&#106;avascript:alert(1)"/>'),
  };
  for (const [name, source] of Object.entries(attacks)) {
    const clean = sanitizeSvg(source);
    // Refusing the whole picture is also safe; what matters is that nothing dangerous comes out.
    if (clean === undefined) continue;
    for (const bad of [/script/i, /onload|onclick|onerror/i, /foreignObject/i, /javascript|vbscript/i, /evil\.test/, /<a[ >]/, /<image/i, /<animate|<set/i, /<style/i, /expression/i, /@import/i, /data:/i]) {
      assert.ok(!bad.test(clean as string), `${name}: ${String(bad)} survived in ${clean}`);
    }
  }
});

test("the usual attacks are cleaned, not merely refused", () => {
  for (const source of [wrap("<script>alert(1)</script><rect/>"), wrap('<rect onclick="alert(1)"/>'), wrap('<use href="https://evil.test/x.svg#a"/><rect/>')]) {
    assert.notEqual(sanitizeSvg(source), undefined);
  }
});

test("input it cannot read safely is refused, not repaired", () => {
  assert.equal(sanitizeSvg("<html><body>not svg</body></html>"), undefined);
  assert.equal(sanitizeSvg("<svg><rect></svg>"), undefined, "mismatched tags");
  assert.equal(sanitizeSvg("<svg/><svg/>"), undefined, "two roots");
  assert.equal(sanitizeSvg('<svg a="1" a="2"/>'), undefined, "duplicate attribute");
  assert.equal(sanitizeSvg("<svg>< rect/></svg>"), undefined, "stray angle bracket");
  assert.equal(sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><svg>&b;</svg>'), undefined, "entity declarations");
  assert.equal(sanitizeSvg("<svg><![CDATA[x]]></svg>"), undefined, "cdata");
  assert.equal(sanitizeSvg("text before<svg/>"), undefined);
  assert.equal(sanitizeSvg(""), undefined);
});

test("size, element count and depth are limited", () => {
  assert.equal(sanitizeSvg(wrap("<g>".repeat(40) + "</g>".repeat(40))), undefined, "too deep");
  assert.equal(sanitizeSvg(wrap("<rect/>".repeat(5000))), undefined, "too many elements");
  assert.equal(sanitizeSvg(wrap(`<text>${"a".repeat(300_000)}</text>`)), undefined, "too long");
  assert.ok(sanitizeSvg(wrap("<g>".repeat(20) + "</g>".repeat(20))) !== undefined);
});

test("text only survives inside text elements and is escaped on the way out", () => {
  const clean = sanitizeSvg(wrap("loose text<text>a &lt;b&gt; &amp; c</text>")) as string;
  assert.ok(!clean.includes("loose"));
  assert.ok(clean.includes("a &lt;b&gt; &amp; c"));
});

test("a data address is decoded, cleaned and written back as base64", () => {
  const svg = wrap('<script>1</script><rect width="4" height="4"/>');
  const b64 = `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}`;
  const pct = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  for (const url of [b64, pct]) {
    const out = sanitizeSvgDataUrl(url) as string;
    assert.ok(out.startsWith("data:image/svg+xml;base64,"));
    const text = new TextDecoder().decode(decodeBase64(out.split(",")[1] as string) as Uint8Array);
    assert.ok(text.includes("<rect") && !text.includes("script"), text);
  }
  assert.equal(sanitizeSvgDataUrl("data:image/svg+xml;base64,!!!notbase64"), undefined);
  assert.equal(sanitizeSvgDataUrl("data:image/png;base64,AAAA"), undefined);
});

test("base64 round-trips", () => {
  for (const text of ["", "a", "ab", "abc", "abcd", "héllo wörld ✓"]) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(new TextDecoder().decode(decodeBase64(encodeBase64(bytes)) as Uint8Array), text);
  }
});

test("pasted svg images are cleaned by the importer; a remote svg address is kept as an address", () => {
  const svg = wrap('<script>1</script><rect width="4" height="4"/>');
  const src = `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}`;
  const html = exportHtml({ blocks: importBlocks(`<img src="${src}">`, { sanitizeSvg: sanitizeSvgDataUrl }) });
  const decoded = new TextDecoder().decode(decodeBase64(/base64,([^"]+)"/.exec(html)?.[1] as string) as Uint8Array);
  assert.ok(decoded.includes("<rect") && !decoded.includes("script"));
  assert.equal(exportHtml({ blocks: importBlocks('<img src="https://x.test/logo.svg">', { sanitizeSvg: sanitizeSvgDataUrl }) }), '<p><img src="https://x.test/logo.svg"></p>');
  assert.equal(exportHtml({ blocks: importBlocks('<img src="data:image/svg+xml;base64,PHNjcmlwdD4=">', { sanitizeSvg: sanitizeSvgDataUrl }) }), "");
});

test("copies of copies that grow without limit are refused", () => {
  const chain = Array.from({ length: 30 }, (_, i) => `<g id="n${i}"><use href="#n${i + 1}"/><use href="#n${i + 1}"/></g>`).join("");
  assert.equal(sanitizeSvg(wrap(`<defs>${chain}<rect id="n30" width="1" height="1"/></defs><use href="#n0"/>`)), undefined);
  assert.ok(sanitizeSvg(wrap('<defs><rect id="r" width="1" height="1"/></defs><use href="#r"/><use href="#r" x="2"/>')) !== undefined);
  assert.equal(sanitizeSvg(wrap('<rect id="r"/>' + '<use href="#r"/>'.repeat(65))), undefined);
});

test("random damage never lets a dangerous token through", () => {
  const base = wrap('<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect width="4" height="4" fill="url(#g)" style="stroke:red"/><text>t</text><use href="#g"/>');
  const snippets = ['<script>alert(1)</script>', ' onload="x()"', '<a href="javascript:x"/>', ' fill="url(http://e.test/x)"', '<foreignObject/>', ' style="behavior:url(x)"', "<image href=\"http://e.test/a\"/>", "<animate/>", "&#106;avascript:", "<!ENTITY x 'y'>"];
  let seed = 12345;
  const rand = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 2000; i++) {
    const at = rand(base.length);
    const out = sanitizeSvg(base.slice(0, at) + snippets[rand(snippets.length)] + base.slice(at));
    // Text a picture displays is harmless, so only the markup between the text is checked.
    if (out !== undefined) assert.ok(!/script|javascript|onload|e\.test|foreignObject|<image|<animate|behavior|<a[ >]|<!ENTITY/i.test(out.replace(/>[^<]*</g, "><")), out);
  }
});

test("without the sanitizer, svg images are refused", () => {
  const src = `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(wrap("<rect/>")))}`;
  assert.equal(exportHtml({ blocks: importBlocks(`<img src="${src}">`) }), "");
});

test("a comment inside a comment is refused, not left half-removed", () => {
  assert.equal(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><!<!---->--><script>x</script><rect width="1" height="1"/></svg>'), undefined);
  assert.notEqual(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><!-- note --><rect width="1" height="1"/></svg>'), undefined);
});

test("base64 with many trailing equals signs or spaces decodes (or fails) quickly", () => {
  const started = Date.now();
  assert.equal(decodeBase64(`${"=".repeat(200_000)}x`), undefined);
  assert.deepEqual([...(decodeBase64("aGk=") as Uint8Array)], [104, 105]);
  assert.ok(Date.now() - started < 2000);
});
