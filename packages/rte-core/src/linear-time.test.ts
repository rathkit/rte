import assert from "node:assert/strict";
import { test } from "node:test";
import { addressShortcut } from "./autoformat/autoformat.ts";
import { decodeBase64 } from "./base64.ts";
import { importHtml } from "./import.ts";
import { caret } from "./path.ts";
import { exportMarkdown } from "./markdown/index.ts";
import { countText } from "./stats.ts";

// Long runs of one character in the middle of a text used to make some patterns take time that grows with
// the square of the length. At this size that was many seconds; reading it once takes a few milliseconds.
const N = 200_000;
const LIMIT_MS = 1500;
const within = (what: string, run: () => void): void => {
  const start = performance.now();
  run();
  const took = performance.now() - start;
  assert.ok(took < LIMIT_MS, `${what} took ${Math.round(took)} ms`);
};

test("counting words and characters stays fast on a long run of spaces inside a text", () => {
  within("countText", () => {
    const counts = countText(`a${" ".repeat(N)}b`);
    assert.equal(counts.words, 2);
    assert.equal(counts.characters, N + 2);
  });
});

test("base64 with a long run of = signs before the end is refused quickly", () => {
  within("decodeBase64", () => {
    assert.equal(decodeBase64(`QQ${"=".repeat(N)}Q`), undefined);
    assert.deepEqual([...(decodeBase64("QQ==") ?? [])], [65]);
  });
});

test("writing Markdown stays fast when a text has a long run of spaces inside it", () => {
  within("exportMarkdown", () => {
    const text = exportMarkdown(importHtml(`<p><strong>a${"&nbsp;".repeat(N)}b </strong></p>`));
    assert.ok(text.startsWith("**a"));
  });
});

test("a web address is found at the end of a long text quickly, and only when it ends the text", () => {
  const at = (html: string) => {
    const doc = importHtml(html);
    const block = doc.blocks[0];
    assert.equal(block?.type, "p");
    const length = block?.type === "p" ? block.content.map((n) => (n.type === "text" ? n.text.length : 1)).reduce((a, b) => a + b, 0) : 0;
    return addressShortcut(doc, caret({ path: [0], offset: length }), " ");
  };
  within("addressShortcut", () => {
    assert.equal(at(`<p>${"www.".repeat(N / 4)}&lt;</p>`), undefined, "a < ends the run, and nothing after it is an address");
    assert.equal(at(`<p>${"!".repeat(N)}</p>`), undefined);
  });
  assert.ok(at("<p>see www.example.test</p>"), "an address that ends the text becomes a link");
  assert.equal(at("<p>www.example.test and more</p>"), undefined, "words after it mean it does not end the text");
});
