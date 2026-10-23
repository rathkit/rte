import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ops } from "./ops.ts";

// An outside plugin (a paid one, say) may not import the editor at run time, so everything the bundled plugins take from the core
// must be reachable through `host.ops`. This test keeps "an outside plugin can do everything these do" true.
test("every value the bundled plugins take from the core is in the toolkit plugins are handed", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const missing: string[] = [];
  for (const plugin of ["lists", "word", "svg", "images", "tables"]) {
    for (const file of readdirSync(join(dir, plugin)).filter((f) => f.endsWith(".ts") && !/\.test\.ts$/.test(f))) {
      const text = readFileSync(join(dir, plugin, file), "utf8");
      for (const m of text.matchAll(/import\s*(type\s+)?\{([^}]*)\}\s*from\s*"(\.\.\/[^"]+)"/g)) {
        if (m[1]) continue;
        for (const raw of (m[2] as string).split(",")) {
          const name = raw.trim().split(/\s+as\s+/)[0] as string;
          if (name === "" || name.startsWith("type ")) continue;
          if (!(name in ops)) missing.push(`${plugin}/${file}: ${name}`);
        }
      }
    }
  }
  assert.deepEqual(missing, []);
});
