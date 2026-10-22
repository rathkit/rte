// Fails if a package's built JavaScript is over its gzip budget.
// A package opts in with  "rathkit": { "budgetGzipKB": 60 }  in its package.json. The budget covers every
// .js file under dist/, gzipped one by one and summed, which is an upper bound for a single minified bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const packagesDir = "packages";
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
  });

let failed = false;
for (const name of readdirSync(packagesDir)) {
  const meta = JSON.parse(readFileSync(join(packagesDir, name, "package.json"), "utf8"));
  const budget = meta.rathkit?.budgetGzipKB;
  if (budget === undefined) continue;
  let files;
  try {
    files = walk(join(packagesDir, name, "dist"));
  } catch {
    console.error(`size: ${meta.name} has no dist/; run the build first`);
    failed = true;
    continue;
  }
  const bytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
  const kb = bytes / 1024;
  const over = kb > budget;
  console.log(`size: ${meta.name} ${kb.toFixed(1)} KB gzipped of ${budget} KB (${files.length} files)${over ? " OVER BUDGET" : ""}`);
  if (over) failed = true;
}
process.exit(failed ? 1 : 0);
