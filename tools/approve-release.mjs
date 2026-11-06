// Checks the staged versions of a release against its signed checksums and, only when asked, approves them:
//   node tools/approve-release.mjs v0.2.0-beta.0            (check only; nothing is approved)
//   node tools/approve-release.mjs v0.2.0-beta.0 --approve  (check, ask once, then approve each; npm asks for the two-factor code)
// Needs `npm login` as the owner and `gh` for the release's SHA256SUMS. Approving publishes: it cannot be undone, and a version cannot be reused.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

/** `sha256  file` lines to a Map of file name to hash. */
export function parseSums(text) {
  const sums = new Map();
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m) sums.set(m[2].replace(/^.*\//, ""), m[1]);
  }
  return sums;
}

/** The staged entries npm listed, as { id, name, version }; accepts a list or an object holding one. */
export function stagedEntries(json) {
  const list = Array.isArray(json) ? json : Object.values(json ?? {}).find(Array.isArray) ?? [];
  return list
    .filter((e) => e.status === undefined || e.status === "staged")
    .map((e) => ({ id: e.id ?? e.stageId ?? e.stage_id, name: e.packageName ?? e.name ?? e.package, version: e.version }))
    .filter((e) => e.id && e.name && e.version);
}

/**
 * Splits the package names into those staged for `version` and the rest, and lists what is wrong (empty when fine):
 * a name staged more than once is a problem; a name not staged is left to the caller, which checks whether it is already published.
 */
export function splitStaged(entries, names, version) {
  const staged = [];
  const missing = [];
  const problems = [];
  for (const name of names) {
    const found = entries.filter((e) => e.name === name && e.version === version);
    if (found.length === 0) missing.push(name);
    else if (found.length > 1) problems.push(`${name}@${version} is staged ${found.length} times (${found.map((e) => e.id).join(", ")}); reject the extra ones by hand`);
    else staged.push({ name, id: found[0].id });
  }
  return { staged, missing, problems };
}

const tarballName = (name, version) => `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function main() {
  const [tag, ...flags] = process.argv.slice(2);
  if (!tag || !/^v\d+\.\d+\.\d+-(alpha|beta|rc)\.\d+$/.test(tag)) {
    console.error("usage: node tools/approve-release.mjs v<version> [--approve]");
    process.exit(2);
  }
  const approve = flags.includes("--approve");
  const version = tag.slice(1);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const names = readdirSync(join(root, "packages")).map((d) => JSON.parse(readFileSync(join(root, "packages", d, "package.json"), "utf8")).name);
  const work = mkdtempSync(join(tmpdir(), "approve-"));

  execFileSync("gh", ["release", "download", tag, "--repo", "rathkit/rte", "--pattern", "SHA256SUMS", "--dir", work], { stdio: "inherit" });
  const sums = parseSums(readFileSync(join(work, "SHA256SUMS"), "utf8"));

  const listed = spawnSync("npm", ["stage", "list", "--json"], { encoding: "utf8" });
  if (listed.status !== 0) { console.error(listed.stderr || listed.stdout); process.exit(1); }
  const entries = stagedEntries(JSON.parse(listed.stdout));
  const { staged, missing, problems } = splitStaged(entries, names, version);
  // A package that is not staged is fine only if that version is already on npm (a run that stopped half way).
  const published = [];
  for (const name of missing) {
    const live = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
    if (live.status === 0 && live.stdout.trim() === version) published.push(name);
    else problems.push(`${name}@${version} is neither staged nor published`);
  }
  if (problems.length) { for (const p of problems) console.error(`  ${p}`); process.exit(1); }
  for (const name of published) console.log(`already published ${name}@${version}`);
  const chosen = staged;
  if (chosen.length === 0) { console.log(`nothing is staged: all ${published.length} packages are already published.`); return; }

  const bad = [];
  for (const { name, id } of chosen) {
    const dir = mkdtempSync(join(work, "dl-"));
    const got = spawnSync("npm", ["stage", "download", id], { cwd: dir, encoding: "utf8" });
    const file = readdirSync(dir).find((f) => f.endsWith(".tgz"));
    const want = sums.get(tarballName(name, version));
    const have = got.status === 0 && file ? sha256(join(dir, file)) : undefined;
    const ok = want !== undefined && have === want;
    console.log(`${ok ? "match   " : "MISMATCH"} ${name}@${version}  ${id}`);
    if (!ok) bad.push(name);
  }
  if (bad.length) { console.error(`\nnot approving: ${bad.length} staged tarball(s) differ from SHA256SUMS or could not be checked: ${bad.join(", ")}`); process.exit(1); }
  console.log(`\nall ${chosen.length} staged tarballs match the release's SHA256SUMS.`);
  if (!approve) { console.log("nothing approved. Run again with --approve to publish them."); return; }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Approve ${chosen.length} packages at ${version}? This publishes them and cannot be undone. Type "yes": `);
  rl.close();
  if (answer.trim() !== "yes") { console.log("nothing approved."); return; }
  for (const { name, id } of chosen) {
    console.log(`\napproving ${name}@${version}`);
    const r = spawnSync("npm", ["stage", "approve", id], { stdio: "inherit" });
    if (r.status !== 0) { console.error(`stopped: approving ${name} failed; the ones before it are live, the rest are still staged. Run it again: it skips the ones already published.`); process.exit(1); }
  }
  console.log("\ndone. Check: npm view @rathkit/rte-core dist-tags");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
