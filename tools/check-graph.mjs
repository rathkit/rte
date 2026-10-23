// Enforces the layering inside each package that has plugin folders: the core of the package must not import a plugin, so
// "core without plugins" is true. A package opts in with  "rathkit": { "plugins": ["lists", "svg"], "standard": ["standard"] }
// in its package.json. Files in those folders may import the core and themselves; files in the "standard" folders may import
// any of them. Tests are not checked.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const IMPORT = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.ts$/.test(name) && !/\.(test|sample)\.ts$/.test(name) ? [path] : [];
});

let failed = false;
for (const pkg of readdirSync("packages")) {
  const meta = JSON.parse(readFileSync(join("packages", pkg, "package.json"), "utf8"));
  const plugins = meta.rathkit?.plugins;
  if (!plugins) continue;
  const standard = meta.rathkit?.standard ?? [];
  const src = resolve("packages", pkg, "src");
  const area = (file) => {
    const top = relative(src, file).split(sep)[0];
    if (standard.includes(top)) return "standard";
    return plugins.includes(top) ? top : "core";
  };
  const files = walk(src);
  let edges = 0;
  for (const file of files) {
    const from = area(file);
    if (from === "standard") continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec.startsWith(".")) continue;
      const target = resolve(dirname(file), spec.replace(/\.js$/, ".ts"));
      const to = area(target);
      edges++;
      if (to === "core" || to === from) continue;
      failed = true;
      console.error(`graph: ${relative(".", file)} (${from}) imports ${relative(".", target)} (${to}); ${from === "core" ? "the core must not import a plugin" : "a plugin may only import the core"}`);
    }
  }
  console.log(`graph: ${meta.name}: ${files.length} files, ${edges} imports checked`);
}
process.exit(failed ? 1 : 0);
