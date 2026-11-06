// The rule for describing performance (CONTRIBUTING.md, "How we describe performance"): only measured numbers, with their method; no comparison with
// another product; no claim about a device the benchmarks did not run on. This scans the README files and the documents for the words that break it.
// Whether a plain word such as small or fast has a number behind it is reviewed in the pull request, because the same words are used for other things.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const files = [
  "README.md",
  ...readdirSync(join(root, "packages")).map((p) => join("packages", p, "README.md")),
  ...readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md") && f !== "ROADMAP.md").map((f) => join("docs", f)),
].filter((f) => { try { readFileSync(join(root, f)); return true; } catch { return false; } });

// Never allowed: they claim without measuring.
const never = /\b(fastest|lightweight|blazing|tiny|snappy|speedy|lightning|instant|instantly)\b/i;
// A throttled or heap-capped run is a stand-in; a speed claim about a device the benchmarks did not run on is not allowed.
const device = /\b(fast|faster|quick|smooth|responsive|speedy)\b[^.]*\bon (a |an )?(phone|phones|mobile|tablet|tablets|low-end|mid-range)\b/i;
const comparison = /\b(than|versus|vs\.?|compared (to|with)|faster than|smaller than)\b.*\b(other|another|any|most|popular|leading|incumbent) (editor|editors|product|products|tool|tools|library|libraries)\b/i;

test("the documents hold enough files to make the scan mean something", () => {
  assert.ok(files.length > 15, `${files.length} files`);
});

test("no document makes an unmeasured performance claim, a claim about a device, or a comparison", () => {
  const found = [];
  for (const f of files) {
    readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
      const where = `${f}:${i + 1}: ${line.trim().slice(0, 100)}`;
      if (never.test(line)) found.push(`${where}  (a word that claims without a number)`);
      if (device.test(line)) found.push(`${where}  (a throttled run is a stand-in, not a device)`);
      if (comparison.test(line)) found.push(`${where}  (a comparison with another product)`);
    });
  }
  assert.deepEqual(found, [], `see "How we describe performance" in CONTRIBUTING.md:\n  ${found.join("\n  ")}`);
});

test("the scan catches what it should", () => {
  assert.match("the fastest editor", never);
  assert.match("a lightweight core", never);
  assert.match("it is fast on a phone", device);
  assert.doesNotMatch("Tap the number on a phone and move the caret", device);
  assert.match("faster than any other editor", comparison);
  assert.doesNotMatch("typing takes 0.9 ms", never);
});
