import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// The headless layer works with any editor it is handed, so it must not need the editor at run time.
test("the headless layer imports the editor package for types only", () => {
  const dir = new URL(".", import.meta.url).pathname;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    for (const line of readFileSync(`${dir}${file}`, "utf8").split("\n")) {
      if (/from\s*["']@rathkit\//.test(line) || /^\s*import\s*["']@rathkit\//.test(line)) assert.match(line, /^import type /, `${file}: ${line}`);
    }
  }
});

test("the headless layer touches no style: it never sets a class, a color or a size", () => {
  const dir = new URL(".", import.meta.url).pathname;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const text = readFileSync(`${dir}${file}`, "utf8");
    assert.ok(!/classList|className|\.style\./.test(text.replace(/element\.style\.cssText/g, "")), `${file} sets a style`);
  }
});
