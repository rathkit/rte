// Sets one version on every package, and the range the packages ask of each other:  node tools/set-version.mjs 0.1.0-alpha.1
// Packages are released together under one version (see docs/RELEASING.md). Then write the changelog section and run `pnpm check:release`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const version = process.argv[2];
const m = /^(\d+)\.(\d+)\.(\d+)-(alpha|beta|rc)\.(\d+)$/.exec(version ?? "");
if (!m) { console.error("usage: node tools/set-version.mjs <major.minor.patch-alpha.N>   (while in alpha, only alpha, beta and rc versions are allowed)"); process.exit(2); }
const root = resolve(import.meta.dirname, "..");
// What a package asks of its siblings: this release or a later one, below the next minor (the next major, once past 1.0). A prerelease
// range has to name the prerelease it starts from, or npm does not match prereleases at all.
const [, major, minor] = m;
const range = `>=${version} <${major === "0" ? `0.${Number(minor) + 1}.0` : `${Number(major) + 1}.0.0`}`;
for (const dir of readdirSync(join(root, "packages"))) {
  const file = join(root, "packages", dir, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = version;
  for (const name of Object.keys(pkg.peerDependencies ?? {})) if (name.startsWith("@rathkit/")) pkg.peerDependencies[name] = range;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
console.log(`set ${version} on every package; siblings are asked for "${range}"`);
