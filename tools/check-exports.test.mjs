import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { exportsOf } from "./check-exports.mjs";

test("reads declarations, re-exports and star exports from type files", () => {
  const dir = mkdtempSync(join(tmpdir(), "rte-exports-"));
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "a.d.ts"), [
    "/** Documented. */",
    "export declare function one(): void;",
    "export declare const two: number;",
    "export interface Shape { x: number }",
    "export type Alias = string;",
    "",
  ].join("\n"));
  writeFileSync(join(dir, "sub", "index.d.ts"), 'export { one as renamed, type Shape } from "../a.ts";\n');
  writeFileSync(join(dir, "index.d.ts"), 'export * from "./a.ts";\nexport * from "./sub/index.ts";\nexport type { Alias as Other } from "./a.ts";\n');

  const found = exportsOf(join(dir, "index.d.ts"));
  assert.deepEqual([...found.keys()].sort(), ["Alias", "Other", "Shape", "one", "renamed", "two"]);
  assert.equal(found.get("one")?.kind, "value");
  assert.equal(found.get("one")?.doc, true);
  assert.equal(found.get("two")?.doc, false);
  assert.equal(found.get("Shape")?.kind, "type");
  assert.equal(found.get("Other")?.kind, "type");
  assert.equal(found.get("renamed")?.doc, true);
});
