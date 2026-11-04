// Lists what every package exports and fails when the list differs from the one checked in (tools/exports.snapshot.txt).
// The list comes from the built type files (pnpm build first): for each entry point of each package, every exported name, whether it
// is a value or a type, and whether its declaration has a doc comment. A change to the public surface shows up in review as a change
// to the snapshot; `node tools/check-exports.mjs --update` rewrites it.
// Also fails when an exported declaration has no doc comment, except the ones listed in tools/exports.undocumented.txt (a shrinking
// list: remove a line when its declaration gets a comment).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const snapshotFile = join(root, "tools", "exports.snapshot.txt");
const undocumentedFile = join(root, "tools", "exports.undocumented.txt");

const cache = new Map();

/** The d.ts file a specifier in `from` points at. */
function resolveModule(from, specifier) {
  const base = resolve(dirname(from), specifier.replace(/\.(ts|js)$/, ""));
  for (const candidate of [`${base}.d.ts`, join(base, "index.d.ts")]) if (existsSync(candidate)) return candidate;
  return undefined;
}

const documented = (text, index) => /\*\/\s*$/.test(text.slice(Math.max(0, index - 400), index));

/** Map of exported name to { kind: "value" | "type", doc: boolean } for one type file. */
export function exportsOf(file) {
  if (cache.has(file)) return cache.get(file);
  const out = new Map();
  cache.set(file, out);
  const text = readFileSync(file, "utf8");
  const put = (name, kind, doc) => out.set(name, { kind, doc });

  for (const m of text.matchAll(/^export\s+declare\s+(?:abstract\s+)?(const|let|var|function|class|enum|namespace)\s+(\w+)/gm)) {
    put(m[2], "value", documented(text, m.index));
  }
  for (const m of text.matchAll(/^export\s+declare\s+(?:type|interface)\s+(\w+)/gm)) put(m[1], "type", documented(text, m.index));
  for (const m of text.matchAll(/^export\s+(?:type|interface)\s+(\w+)/gm)) put(m[1], "type", documented(text, m.index));
  for (const m of text.matchAll(/^export\s+(?:const\s+)?enum\s+(\w+)/gm)) put(m[1], "value", documented(text, m.index));

  for (const m of text.matchAll(/^export\s+\*\s+from\s+"([^"]+)";/gm)) {
    const target = resolveModule(file, m[1]);
    if (!target) continue;
    for (const [name, info] of exportsOf(target)) if (name !== "default" && !out.has(name)) out.set(name, info);
  }
  for (const m of text.matchAll(/^export\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)";/gm)) put(m[1], "value", true);

  for (const m of text.matchAll(/^export\s+(type\s+)?\{([^}]*)\}(?:\s+from\s+"([^"]+)")?;/gm)) {
    const target = m[3] ? resolveModule(file, m[3]) : undefined;
    const targetExports = target ? exportsOf(target) : undefined;
    for (const part of m[2].split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      const typeOnly = Boolean(m[1]) || /^type\s/.test(piece);
      const [from, as] = piece.replace(/^type\s+/, "").split(/\s+as\s+/);
      const info = targetExports?.get(from) ?? out.get(from);
      const name = as ?? from;
      put(name, typeOnly ? "type" : (info?.kind ?? "value"), info?.doc ?? true);
    }
  }
  return out;
}

/** Entry points of a package: [subpath, d.ts file], skipping the ones that are not code (stylesheets). */
function entries(dir, pkg) {
  const list = [];
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    const types = typeof target === "object" ? target.types : undefined;
    if (!types) continue;
    list.push([subpath, join(dir, types)]);
  }
  return list;
}

export function collect() {
  const lines = [];
  const missing = [];
  const packagesDir = join(root, "packages");
  for (const name of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, name);
    if (!existsSync(join(dir, "package.json"))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const [subpath, file] of entries(dir, pkg)) {
      if (!existsSync(file)) throw new Error(`${pkg.name}${subpath === "." ? "" : subpath.slice(1)}: ${file} is missing: run pnpm build first`);
      const specifier = subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`;
      lines.push(`# ${specifier}`);
      for (const [exported, info] of [...exportsOf(file)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        lines.push(`${info.kind} ${exported}`);
        if (!info.doc) missing.push(`${specifier} ${exported}`);
      }
    }
  }
  return { snapshot: `${lines.join("\n")}\n`, missing: [...new Set(missing)] };
}

if (import.meta.main) {
  const update = process.argv.includes("--update");
  const { snapshot, missing } = collect();
  const problems = [];
  if (update) {
    writeFileSync(snapshotFile, snapshot);
    writeFileSync(undocumentedFile, missing.length ? `${missing.join("\n")}\n` : "");
    console.log(`exports: snapshot written (${snapshot.split("\n").length - 1} lines, ${missing.length} without a doc comment)`);
  } else {
    const current = existsSync(snapshotFile) ? readFileSync(snapshotFile, "utf8") : "";
    if (current !== snapshot) {
      const before = new Set(current.split("\n"));
      const after = new Set(snapshot.split("\n"));
      const added = [...after].filter((l) => !before.has(l) && l);
      const removed = [...before].filter((l) => !after.has(l) && l);
      problems.push(
        `the public exports changed (tools/exports.snapshot.txt). Review the change, then run: node tools/check-exports.mjs --update\n` +
          [...added.map((l) => `  + ${l}`), ...removed.map((l) => `  - ${l}`)].join("\n"),
      );
    }
    const allowed = new Set((existsSync(undocumentedFile) ? readFileSync(undocumentedFile, "utf8") : "").split("\n").filter(Boolean));
    const fresh = missing.filter((m) => !allowed.has(m));
    if (fresh.length) problems.push(`exported without a doc comment:\n${fresh.map((m) => `  ${m}`).join("\n")}`);
    const stale = [...allowed].filter((m) => !missing.includes(m));
    if (stale.length) problems.push(`now documented: remove from tools/exports.undocumented.txt:\n${stale.map((m) => `  ${m}`).join("\n")}`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (!update) console.log("exports: ok");
}
