// Fails if any workspace package could pull code in at install time or runtime.
// Rules: no dependencies, optionalDependencies or bundled deps; no install scripts;
// peerDependencies only as optional peers (host framework in wrapper packages).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const packagesDir = join(root, "packages");
const bannedFields = ["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies"];
const bannedScripts = ["preinstall", "install", "postinstall", "prepare"];
const problems = [];

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(packagesDir, entry.name, "package.json");
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const where = `packages/${entry.name}`;

  for (const field of bannedFields) {
    if (pkg[field] && Object.keys(pkg[field]).length > 0) problems.push(`${where}: "${field}" must be empty`);
  }
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    if (!pkg.peerDependenciesMeta?.[name]?.optional) problems.push(`${where}: peer "${name}" must be optional`);
  }
  for (const script of bannedScripts) {
    if (pkg.scripts?.[script]) problems.push(`${where}: install-time script "${script}" is not allowed`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("zero-deps: ok");
