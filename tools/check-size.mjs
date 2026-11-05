// Fails if a package's built JavaScript is over its gzip budget, entry point by entry point.
// A package opts in with  "rathkit": { "budgets": [{ "name", "entry", "gzipKB", "plugin": true }] }  in its package.json.
//  - A core entry is measured over every file reachable from it, so what it does not import costs nothing.
//  - A plugin entry is measured as what it adds to the core: its own files (and nothing else) unless a minifier is given.
// By default each file is gzipped on its own and summed, which is an upper bound (CI uses this). With RTE_PACK set to the
// path of a rathkit-pack binary, each entry is also bundled and minified, and the minified numbers are the ones checked,
// since they are what a person downloads. Those numbers are provisional while the minifier is still changing.
// Besides the budget (a ceiling with room under it), each entry is held to the size recorded in tools/size-baseline.json plus a stated margin,
// so growth that stays under the ceiling is still seen. An approved increase is recorded, with its reason, by
//   pnpm check:size --record "why the size grows"      (rewrites the baseline and appends what changed to its history)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { baselineProblems, recorded } from "./size-baseline.mjs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const pack = process.env.RTE_PACK;
const gz = (data) => gzipSync(data, { level: 9 }).length;
const IMPORT = /(?:import|export)\s[^;]*?from\s*["'](\.[^"']+)["']|import\s*["'](\.[^"']+)["']/g;

function reachable(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) visit(resolve(dirname(file), m[1] ?? m[2]));
  };
  visit(entry);
  return [...seen];
}

const BARE = /(?:import|export)\s[^;]*?from\s*["']([^."'/][^"']*)["']|import\s*["']([^."'/][^"']*)["']/g;

/** Packages a built entry imports by name (its peers). They are left out of its size: the app already has them. */
function externalsOf(entryFile) {
  const names = new Set();
  for (const file of reachable(entryFile)) for (const m of readFileSync(file, "utf8").matchAll(BARE)) names.add(m[1] ?? m[2]);
  return [...names].flatMap((n) => ["--external", n]);
}

function minified(entryFile) {
  const dir = mkdtempSync(join(tmpdir(), "rte-size-"));
  try {
    const out = join(dir, "out.mjs");
    execFileSync(pack, ["bundle", entryFile, "--outfile", out, "--minify", ...externalsOf(entryFile)], { stdio: ["ignore", "ignore", "pipe"] });
    return gz(readFileSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const baselineFile = new URL("./size-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
const recordIndex = process.argv.indexOf("--record");
const reason = recordIndex >= 0 ? process.argv[recordIndex + 1] : undefined;
if (recordIndex >= 0 && (!reason || reason.startsWith("--"))) { console.error('--record needs the reason: pnpm check:size --record "why the size grows"'); process.exit(2); }
const measuredBytes = {};
let failed = false;
for (const name of readdirSync("packages")) {
  const root = join("packages", name);
  const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const budgets = meta.rathkit?.budgets;
  if (!budgets) continue;
  const dist = resolve(root, "dist");
  const core = resolve(dist, "index.js");
  const coreFiles = new Set(reachable(core));
  for (const b of budgets) {
    const entry = resolve(root, b.entry);
    // Upper bound without a minifier: this entry's files, minus the core's when it is a plugin.
    const files = reachable(entry).filter((f) => !b.plugin || !coreFiles.has(f));
    const upper = files.reduce((sum, f) => sum + gz(readFileSync(f)), 0);
    let measured = upper;
    let how = "unminified, each file gzipped alone";
    if (pack) {
      const alone = minified(entry);
      if (b.plugin) {
        const tmp = mkdtempSync(join(tmpdir(), "rte-both-"));
        const both = join(tmp, "both.mjs");
        writeFileSync(both, `export * from ${JSON.stringify(core)};\nexport * from ${JSON.stringify(entry)};\n`);
        try { measured = minified(both) - minified(core); } finally { rmSync(tmp, { recursive: true, force: true }); }
      } else measured = alone;
      how = "minified by rathkit-pack (provisional)";
    }
    const kb = measured / 1024;
    const over = kb > b.gzipKB;
    if (!pack) measuredBytes[`${meta.name} ${b.name}`] = measured;
    console.log(`size: ${meta.name} ${b.name}: ${kb.toFixed(1)} KB gzipped of ${b.gzipKB} KB, ${how}${pack ? `; upper bound ${(upper / 1024).toFixed(1)} KB` : ""}${over ? " OVER BUDGET" : ""}`);
    if (over) failed = true;
  }
}
if (pack) console.log(`size: minifier ${pack}${process.env.RTE_PACK_COMMIT ? ` (pack commit ${process.env.RTE_PACK_COMMIT}, built from a working tree)` : ""}`);
if (!pack) {
  if (reason) {
    const next = recorded(baseline, measuredBytes, reason, new Date().toISOString().slice(0, 10));
    writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`size: baseline recorded (${next.history.length - baseline.history.length} change${next.history.length - baseline.history.length === 1 ? "" : "s"}): ${reason}`);
  } else {
    for (const problem of baselineProblems(baseline, measuredBytes)) { console.log(`size: ${problem}`); failed = true; }
  }
}
process.exit(failed ? 1 : 0);
