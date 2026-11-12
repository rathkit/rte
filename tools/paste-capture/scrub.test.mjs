import assert from "node:assert/strict";
import { test } from "node:test";
import { problemsIn } from "../check-fixtures.mjs";
import { fixtureName, scrubCapture, scrubText } from "./scrub.mjs";

const dirty = [
  '<img src="file:///C:/Users/jdoe/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png">',
  '<img src="file:///C:/Users/jdoe/AppData/Local/Temp/lu1234abcd.tmp/lu1234abce_tmp_1.png">',
  '<b id="docs-internal-guid-1098fb39-7fff-96e2-aff2-44fc146832ad">a</b>',
  '<b id="docs-internal-guid-254db395-7fff-0cd3-044a-a606dc17164f">b</b>',
  '<b id="docs-internal-guid-1098fb39-7fff-96e2-aff2-44fc146832ad">c</b>',
  '<div ccp_infra_version="3" ccp_infra_user_hash="1234" ccp_infra_copy_id="abc-def">',
  '<p paraid="7A1B2C3D" paraeid="{1098FB39-7FFF-96E2-AFF2-44FC146832AD}">',
  '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ">',
  "<a href='mailto:jane@corp.example'>x</a>",
  "C:\\Users\\jdoe\\Documents\\a.docx",
].join("\n");

test("scrubText removes identifying details and keeps structure", () => {
  const clean = scrubText(dirty);
  assert.ok(!/jdoe|jane@corp|1234abc|iVBOR|7A1B2C3D|1098fb39/i.test(clean));
  assert.match(clean, /C:\/Users\/user\/AppData\/Local\/Temp\/msohtmlclip1\/01\/clip_image001\.png/);
  assert.match(clean, /data:image\/png;base64,AAAA/);
  assert.match(clean, /ccp_infra_version="3"/);
  assert.match(clean, /ccp_infra_user_hash="0"/);
  assert.match(clean, /\\Users\\user\\Documents/);
});

test("equal ids stay equal and different ids stay different", () => {
  const clean = scrubText(dirty);
  const ids = [...clean.matchAll(/docs-internal-guid-([0-9a-f-]+)/g)].map((match) => match[1]);
  assert.equal(ids[0], ids[2]);
  assert.notEqual(ids[0], ids[1]);
});

test("scrubbing is deterministic and idempotent", () => {
  assert.equal(scrubText(dirty), scrubText(dirty));
  assert.equal(scrubText(scrubText(dirty)), scrubText(dirty));
});

test("scrubCapture drops machine details and unrequested formats", () => {
  const fixture = scrubCapture({
    meta: { app: "Word Desktop", sample: "S1 formatting", browser: "chromium", os: "windows", userAgent: "Mozilla/5.0 (X11)", capturedAt: "2026-01-01" },
    types: ["text/html", "text/rtf"],
    payloads: { "text/html": dirty, "text/rtf": "{\\rtf1 big}" },
    files: [{ dataUrl: "data:image/png;base64,AAAA" }],
    browserInserted: "<p>x</p>",
  });
  assert.deepEqual(Object.keys(fixture), ["version", "source", "types", "payloads"]);
  assert.deepEqual(Object.keys(fixture.payloads), ["text/html"]);
  assert.equal(fixtureName(fixture), "word-desktop_chromium_windows_s1-formatting.json");
  assert.deepEqual(problemsIn(fixture), []);
});

test("the fixture check catches what the scrubber exists to remove", () => {
  const raw = { source: { app: "a", browser: "b", os: "c", sample: "d" }, payloads: { "text/html": dirty } };
  const problems = problemsIn(raw).join("\n");
  for (const expected of ["account name", "ccp_infra", "GUID", "email", "embedded image data"]) {
    assert.match(problems, new RegExp(expected));
  }
  assert.deepEqual(problemsIn({ ...raw, payloads: { "text/html": scrubText(dirty) } }), []);
});

test("the fixture check reads a fixture's provenance and expectations when it has them", () => {
  const base = { source: { app: "a", browser: "b", os: "c", sample: "d" }, payloads: { "text/html": "<p>x</p>" } };
  const good = { ...base, provenance: { kind: "reconstructed", note: "approximation" }, expect: { includes: ["x"], excludes: [] } };
  assert.deepEqual(problemsIn(good), []);
  assert.match(problemsIn({ ...good, provenance: { kind: "real", note: "n" } }).join(), /provenance\.kind/);
  assert.match(problemsIn({ ...good, provenance: { kind: "capture" } }).join(), /no note/);
  assert.match(problemsIn({ ...good, expect: { includes: ["x"] } }).join(), /expect needs/);
  assert.match(problemsIn({ ...good, expect: { includes: [""], excludes: [] } }).join(), /expect needs/);
});

test("scrubCapture refuses a capture it cannot name", () => {
  assert.equal(scrubCapture({ meta: {}, payloads: {} }), null);
});
