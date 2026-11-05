import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { baselineProblems, recorded } from "./size-baseline.mjs";

const baseline = { margin: { percent: 1, bytes: 128 }, sizes: { "a big": 50_000, "a small": 1_000 }, history: [] };

test("growth inside the margin passes, growth beyond it fails with the numbers and the way out", () => {
  assert.deepEqual(baselineProblems(baseline, { "a big": 50_500, "a small": 1_128 }), []);
  const over = baselineProblems(baseline, { "a big": 50_501, "a small": 1_000 });
  assert.equal(over.length, 1);
  assert.match(over[0], /^a big grew from 50000 to 50501 bytes \(\+501\), over the margin of 500 bytes\..*--record/);
  assert.equal(baselineProblems(baseline, { "a big": 50_000, "a small": 1_129 }).length, 1);
});

test("a smaller entry always passes; a new or a vanished entry must be recorded", () => {
  assert.deepEqual(baselineProblems(baseline, { "a big": 10, "a small": 1 }), []);
  assert.match(baselineProblems(baseline, { "a big": 50_000, "a small": 1_000, "new": 5 })[0], /^new has no recorded size/);
  assert.match(baselineProblems(baseline, { "a big": 50_000 })[0], /^a small is recorded but no longer measured/);
});

test("recording sets every size and writes the reason, the date and both sizes into the history", () => {
  const next = recorded(baseline, { "a big": 51_000, "a small": 1_000, added: 7 }, "markdown tables", "2026-11-05");
  assert.deepEqual(next.sizes, { added: 7, "a big": 51_000, "a small": 1_000 });
  assert.deepEqual(next.history, [
    { date: "2026-11-05", entry: "a big", from: 50_000, to: 51_000, reason: "markdown tables" },
    { date: "2026-11-05", entry: "added", from: null, to: 7, reason: "markdown tables" },
  ]);
  assert.equal(baseline.history.length, 0, "the old baseline is not changed");
});

test("the checked-in baseline has every entry the packages budget, and passes against itself", () => {
  const file = JSON.parse(readFileSync(new URL("./size-baseline.json", import.meta.url), "utf8"));
  assert.ok(Object.keys(file.sizes).length >= 20);
  assert.deepEqual(baselineProblems(file, file.sizes), []);
});
