import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));

test("every runtime budget names a stat, a maximum (zero means none allowed) and a unit", () => {
  const { budgets } = read("./budgets.json");
  assert.ok(Object.keys(budgets).length > 20);
  for (const [path, b] of Object.entries(budgets)) {
    assert.match(path, /^[A-Za-z0-9_@]+(\.[A-Za-z0-9_]+)+$/, path);
    assert.ok(["p95", "median", "value"].includes(b.stat), `${path}: stat ${b.stat}`);
    assert.ok(typeof b.max === "number" && b.max >= 0, `${path}: max`);
    assert.ok(typeof b.unit === "string" && b.unit.length > 0, `${path}: unit`);
  }
});

test("every approved increase has a ratio above one and a reason", () => {
  const { accepted } = read("./accepted.json");
  for (const [figure, a] of Object.entries(accepted)) {
    assert.ok(typeof a.ratio === "number" && a.ratio > 1, `${figure}: ratio`);
    assert.ok(typeof a.reason === "string" && a.reason.trim().length > 10, `${figure}: reason`);
  }
});
