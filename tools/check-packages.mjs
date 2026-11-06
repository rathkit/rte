// Checks what would be published, without publishing anything. Each package is packed the way `npm publish` would pack it, and the
// tarballs are checked and then installed into an empty project, where the entry points are imported and the types compiled:
//   - a tarball holds only package.json, README.md, LICENSE, NOTICE and built files (no sources, tests or source maps);
//   - every file `exports` points at is in it, and the license is the repository's;
//   - the packages install together with nothing from a registry, and the ones that run in Node import;
//   - the types resolve for someone who installed them.
//   - the publishing fields are all there (not private, repository, bugs, engines, provenance, the `next` tag), nothing runs on install,
//     and the install holds nothing but these packages (`npm ls --omit=dev` lists no one else);
//   - with RTE_SMOKE_NODES=<node binary>,<node binary> the entry points are also imported with those Node versions (CI uses the oldest
//     that `engines` allows).
// Needs a build first (pnpm build), and npm.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packagesDir = join(root, "packages");
const license = readFileSync(join(root, "LICENSE"), "utf8");
const notice = readFileSync(join(root, "NOTICE"), "utf8");
const work = mkdtempSync(join(tmpdir(), "rte-pack-"));
const problems = [];
const fail = (message) => problems.push(message);
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });

const packages = readdirSync(packagesDir).filter((d) => existsSync(join(packagesDir, d, "package.json"))).sort();
const tarballs = [];
const meta = new Map();

for (const dir of packages) {
  const pkgDir = join(packagesDir, dir);
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (!existsSync(join(pkgDir, "dist"))) { fail(`${pkg.name}: no dist folder: run pnpm build first`); continue; }
  // npm 11 and older print a list, newer ones an object keyed by package name.
  const raw = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work, "--ignore-scripts"], { cwd: pkgDir }));
  const packed = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
  const files = packed.files.map((f) => f.path);
  meta.set(pkg.name, { pkg, files, dir });
  tarballs.push(join(work, packed.filename));
  for (const f of files) {
    if (!/^(package\.json|README\.md|LICENSE|NOTICE|dist\/.+\.(js|d\.ts)|css\/.+\.css)$/.test(f)) fail(`${pkg.name}: unexpected file in the tarball: ${f}`);
    if (/\.test\.|\/test\//.test(f)) fail(`${pkg.name}: a test file is in the tarball: ${f}`);
  }
  for (const needed of ["package.json", "README.md", "LICENSE", "NOTICE"]) if (!files.includes(needed)) fail(`${pkg.name}: ${needed} is missing`);
  if (readFileSync(join(pkgDir, "LICENSE"), "utf8") !== license) fail(`${pkg.name}: LICENSE differs from the repository's`);
  if (readFileSync(join(pkgDir, "NOTICE"), "utf8") !== notice) fail(`${pkg.name}: NOTICE differs from the repository's`);
  if (pkg.license !== "Apache-2.0") fail(`${pkg.name}: license field is ${pkg.license}`);
  if (pkg.private) fail(`${pkg.name}: still private`);
  if (!/^\d+\.\d+\.\d+-(alpha|beta)\.\d+$/.test(pkg.version)) fail(`${pkg.name}: version ${pkg.version} is not an alpha or beta`);
  const publish = pkg.publishConfig ?? {};
  if (publish.access !== "public" || publish.provenance !== true) fail(`${pkg.name}: publishConfig needs access public and provenance true`);
  if (publish.tag !== "next") fail(`${pkg.name}: publishConfig.tag is ${publish.tag}; an alpha or beta must never take latest`);
  if (!pkg.engines?.node) fail(`${pkg.name}: no engines.node`);
  if (!pkg.bugs?.url || !pkg.repository?.directory || !Array.isArray(pkg.keywords) || pkg.keywords.length === 0) fail(`${pkg.name}: bugs, repository.directory or keywords is missing`);
  if (!pkg.repository?.url?.includes("github.com/rathkit/rte")) fail(`${pkg.name}: repository url is ${pkg.repository?.url}`);
  for (const script of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) {
    if (pkg.scripts && script in pkg.scripts) fail(`${pkg.name}: has a ${script} script; nothing may run on install`);
  }
  if (pkg.dependencies || pkg.optionalDependencies || pkg.bundledDependencies || pkg.bundleDependencies) fail(`${pkg.name}: has runtime dependencies`);
  for (const [dep, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (dep.startsWith("@rathkit/") && !range.startsWith(`>=${pkg.version} <`)) fail(`${pkg.name}: peer ${dep} is "${range}"; it must start at this release (>=${pkg.version}) or npm will not match a prerelease`);
  }
  if (!/alpha|beta/i.test(readFileSync(join(pkgDir, "README.md"), "utf8"))) fail(`${pkg.name}: the README does not say alpha or beta`);
  if (!pkg.repository || !pkg.homepage) fail(`${pkg.name}: repository or homepage is missing`);
  const targets = (value) => (typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(targets) : []);
  for (const target of targets(pkg.exports)) {
    const file = target.replace(/^\.\//, "");
    if (!files.includes(file)) fail(`${pkg.name}: exports points at ${target}, which is not in the tarball`);
  }
  // Source maps are not shipped, so nothing may point at one.
  for (const f of files.filter((x) => x.endsWith(".js"))) {
    if (/sourceMappingURL=/.test(readFileSync(join(pkgDir, f), "utf8"))) fail(`${pkg.name}: ${f} points at a source map that is not shipped`);
  }
}

if (problems.length === 0) {
  // An empty project that installs all of them from the tarballs, with no registry and no scripts.
  const project = join(work, "project");
  mkdirSync(project);
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "smoke", private: true, type: "module", dependencies: Object.fromEntries([...meta.keys()].map((name, i) => [name, `file:${tarballs[i]}`])) }, null, 2));
  try {
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", "--no-package-lock"], { cwd: project });
  } catch (error) {
    fail(`installing the tarballs together failed: ${String(error.stderr ?? error).split("\n").slice(0, 6).join(" | ")}`);
  }
  const installed = readdirSync(join(project, "node_modules", "@rathkit"), { withFileTypes: true }).map((d) => d.name);
  if (installed.length !== packages.length) fail(`expected ${packages.length} packages installed, found ${installed.length}`);
  if (existsSync(join(project, "node_modules", "react")) || existsSync(join(project, "node_modules", "vue"))) fail("a framework was installed: peer dependencies must be optional");

  // Nothing but these packages is in the install: the dependency tree of a user of any of them is only ours.
  try {
    const tree = JSON.parse(run("npm", ["ls", "--omit=dev", "--all", "--json"], { cwd: project }));
    const names = new Set();
    // An optional peer that is not installed is listed as missing; that is not a package in the tree.
    const walk = (deps) => { for (const [name, info] of Object.entries(deps ?? {})) { if (info.missing || !info.version) continue; names.add(name); walk(info.dependencies); } };
    walk(tree.dependencies);
    const strangers = [...names].filter((n) => !n.startsWith("@rathkit/"));
    if (strangers.length > 0) fail(`npm ls --omit=dev lists packages that are not ours: ${strangers.join(", ")}`);
  } catch (error) {
    fail(`npm ls --omit=dev failed: ${String(error.stdout ?? error.stderr ?? error).split("\n").slice(0, 4).join(" | ")}`);
  }

  // The ones that run in Node import, entry point by entry point.
  const nodeSafe = {
    "@rathkit/rte-core": ["", "/lists", "/tables", "/find", "/autoformat", "/markdown", "/footnotes", "/word", "/svg", "/images"],
    "@rathkit/rte-headless": [""],
    "@rathkit/rte-icons": [""],
    "@rathkit/rte-themes": [""],
  };
  const nodes = ["node", ...(process.env.RTE_SMOKE_NODES ?? "").split(",").filter(Boolean)];
  for (const [name, subs] of Object.entries(nodeSafe)) {
    for (const sub of subs) {
     for (const node of nodes) {
      try {
        const out = run(node, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(name + sub)}); console.log(Object.keys(m).length)`], { cwd: project });
        if (Number(out.trim()) === 0) fail(`${name}${sub} imports but exports nothing`);
      } catch (error) {
        fail(`${name}${sub} does not import with ${node}: ${String(error.stderr ?? error).split("\n").find((l) => /Error/.test(l)) ?? error}`);
      }
     }
    }
  }

  // The types, for someone using TypeScript: everything that does not need a framework's own types.
  const typed = ["@rathkit/rte-core", "@rathkit/rte-core/lists", "@rathkit/rte-core/tables", "@rathkit/rte-core/find", "@rathkit/rte-core/autoformat", "@rathkit/rte-core/markdown", "@rathkit/rte-core/footnotes", "@rathkit/rte-core/word", "@rathkit/rte-core/svg", "@rathkit/rte-core/images", "@rathkit/rte-core/dom", "@rathkit/rte-core/standard", "@rathkit/rte-headless", "@rathkit/rte-icons", "@rathkit/rte-themes", "@rathkit/rte-ui", "@rathkit/rte-ui/element", "@rathkit/rte-element", "@rathkit/rte-jquery", "@rathkit/rte-svelte"];
  writeFileSync(join(project, "check.ts"), typed.map((name, i) => `import * as m${i} from ${JSON.stringify(name)};\nvoid m${i};`).join("\n") + "\nexport {};\n");
  writeFileSync(join(project, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: false, lib: ["ES2023", "DOM"], types: [] }, files: ["check.ts"] }));
  try {
    run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(project, "tsconfig.json")], { cwd: project });
  } catch (error) {
    fail(`the types do not compile for a consumer: ${String(error.stdout ?? error).split("\n").slice(0, 8).join(" | ")}`);
  }
}

rmSync(work, { recursive: true, force: true });
if (problems.length > 0) {
  console.error(`packages: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`packages: ok (${packages.length} tarballs packed, installed together, imported and type-checked)`);
