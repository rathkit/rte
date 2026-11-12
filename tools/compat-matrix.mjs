// The compatibility matrix (docs/SUPPORT.md, "Compatibility matrix"; the data in docs/compat-matrix.json): which browsers, Node versions and frameworks,
// and the result of the last recorded run of each. The versions come from the repository's own pins, the results only from results files the checks
// leave behind (RTE_RESULTS), so a cell no run has filled says "not run".
//   node tools/compat-matrix.mjs --node <file> [<node binary>...]   record that the Node versions here (and the binaries named) passed the check job
//   node tools/compat-matrix.mjs --check <results file>...          fail if a run used a version the committed matrix does not say (CI, after each run)
//   node tools/compat-matrix.mjs --record <results file or folder>... rebuild docs/compat-matrix.json and the section of docs/SUPPORT.md from runs
//   node tools/compat-matrix.mjs --render                           rebuild the section of docs/SUPPORT.md from docs/compat-matrix.json only
// The results of a CI run are the run's compat-* artifacts (`gh run download <run id> --pattern 'compat-*' --dir <folder>`).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const read = (f) => readFileSync(join(root, f), "utf8");
export const MATRIX = "docs/compat-matrix.json";
export const START = "<!-- compat-matrix:start: made by tools/compat-matrix.mjs from docs/compat-matrix.json; do not edit by hand -->";
export const END = "<!-- compat-matrix:end -->";

// The two browser jobs in CI, each with its own pinned driver.
export const JOBS = [
  { job: "browsers", dir: "tools/browser-checks" },
  { job: "browsers-oldest", dir: "tools/browser-checks/oldest" },
];
const ENGINES = [
  ["chromium", "Chromium", "Chrome, Edge and other Chromium browsers"],
  ["firefox", "Firefox", "Firefox"],
  ["webkit", "WebKit", "Safari (the Linux build is not Safari)"],
];
const DEVICES = ["iOS and iPadOS", "Android"];
const FRAMEWORKS = [
  ["React", "react", "rte-react"],
  ["Vue", "vue", "rte-vue"],
  ["Svelte", "svelte", "rte-svelte"],
  ["Angular", "@angular/core", "rte-angular"],
  ["jQuery", "jquery", "rte-jquery"],
];
const NOT_RUN = { status: "not run" };

/** What the repository pins, read from its own files: the matrix's versions must equal these. */
export function pins() {
  const playwright = (dir) => JSON.parse(read(`${dir}/package.json`)).devDependencies.playwright;
  const ci = read(".github/workflows/ci.yml");
  const oldestNode = ci.match(/node-version: "(\d+\.\d+\.\d+)"/)?.[1];
  const frameworks = JSON.parse(read("tools/framework-checks/package.json")).devDependencies;
  return {
    playwright: Object.fromEntries(JOBS.map(({ job, dir }) => [job, playwright(dir)])),
    node: [
      { version: oldestNode, role: "the oldest Node that `engines` allows: every entry point is imported from the packed packages (check:packages)" },
      { version: read(".node-version").trim(), role: "builds, tests and checks everything in the check job, and imports the packed packages" },
    ],
    frameworks: FRAMEWORKS.map(([name, pkg, wrapper]) => ({
      name, package: pkg, wrapper: `@rathkit/${wrapper}`,
      supports: JSON.parse(read(`packages/${wrapper}/package.json`)).peerDependencies?.[pkg] ?? null,
      checked: frameworks[pkg],
    })),
  };
}

const runOf = (r) => ({ date: r.date, commit: r.commit, source: r.source, run: r.run ?? null });

/** Builds the matrix from the pins and the results of the runs given (files written by RTE_RESULTS and by --node). */
export function build(results, previous = undefined) {
  const p = pins();
  for (const r of results) {
    if (r.kind === "browser-checks" && !Object.values(p.playwright).includes(r.playwright)) throw new Error(`a browser run with Playwright ${r.playwright}, which neither driver pins`);
  }
  const browserRun = (job) => results.find((r) => r.kind === "browser-checks" && r.playwright === p.playwright[job]);
  const nodeRun = results.find((r) => r.kind === "node");
  const frameworkRun = results.find((r) => r.kind === "framework-checks");
  const browsers = [];
  for (const { job } of JOBS) {
    const run = browserRun(job);
    const old = (engine) => previous?.browsers?.find((b) => b.job === job && b.engine === engine && b.playwright === p.playwright[job]);
    for (const [engine, , standsFor] of ENGINES) {
      const got = run?.engines?.[engine];
      // With no new run for this job, the last recorded one stays, as long as it was for the same pinned driver.
      const kept = run ? undefined : old(engine);
      browsers.push({
        job, engine, standsFor, playwright: p.playwright[job],
        version: got?.version ?? kept?.version ?? null,
        result: got ? { status: got.failed === 0 ? "passed" : "failed", passed: got.passed, failed: got.failed, ...runOf(run) } : (kept?.result ?? NOT_RUN),
      });
    }
  }
  const node = p.node.map((n) => {
    const got = nodeRun?.versions?.find((v) => v.replace(/^v/, "") === n.version || v.replace(/^v/, "").split(".")[0] === n.version);
    const kept = nodeRun ? undefined : previous?.node?.find((o) => o.version === n.version);
    return { ...n, ran: got ? got.replace(/^v/, "") : (kept?.ran ?? null), result: got ? { status: "passed", ...runOf(nodeRun) } : (kept?.result ?? NOT_RUN) };
  });
  const frameworks = p.frameworks.map((f) => {
    const got = frameworkRun?.versions?.[f.package] === f.checked ? frameworkRun : undefined;
    const kept = frameworkRun ? undefined : previous?.frameworks?.find((o) => o.package === f.package && o.checked === f.checked);
    return { ...f, result: got ? { status: got.failed === 0 ? "passed" : "failed", passed: got.passed, failed: got.failed, ...runOf(got) } : (kept?.result ?? NOT_RUN) };
  });
  return {
    schemaVersion: 1,
    about: "Rathkit RTE compatibility matrix. Made by tools/compat-matrix.mjs; the schema is in docs/SUPPORT.md, \"Compatibility matrix\". A result is only ever copied from a run's results file; \"not run\" means no run was recorded.",
    browsers,
    devices: DEVICES.map((platform) => ({ platform, result: NOT_RUN })),
    node,
    frameworks,
  };
}

const cell = (r) => {
  if (r.status === "not run") return "not run";
  const counts = r.passed === undefined ? "" : `, ${r.passed} of ${r.passed + r.failed}`;
  const where = r.source === "ci" ? (r.run ? `[CI](${r.run})` : "CI") : "a local run";
  return `${r.status}${counts} (${where}, ${r.date}, ${r.commit ? `\`${r.commit.slice(0, 12)}\`` : "commit not recorded"})`;
};

/** The Markdown between the markers in docs/SUPPORT.md. It depends only on the matrix, so it can be compared exactly. */
export function render(m) {
  const rows = (head, list) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...list.map((r) => `| ${r.join(" | ")} |`)];
  const name = Object.fromEntries(ENGINES.map(([id, label]) => [id, label]));
  return [
    START,
    "",
    ...rows(["Engine", "Version", "Stands in for", "CI job (Playwright)", "Last recorded run"],
      m.browsers.map((b) => [name[b.engine], b.version ?? "not recorded", b.standsFor, `\`${b.job}\` (${b.playwright})`, cell(b.result)])),
    "",
    ...rows(["Device", "Last recorded run"], m.devices.map((d) => [d.platform, `${cell(d.result)} in CI`])),
    "",
    ...rows(["Node", "What runs", "Last recorded run"], m.node.map((n) => [n.ran && n.ran !== n.version ? `${n.version} (${n.ran})` : n.version, n.role, cell(n.result)])),
    "",
    ...rows(["Framework", "Wrapper", "Versions the wrapper accepts", "Version checked", "Last recorded run"],
      m.frameworks.map((f) => [f.name, `\`${f.wrapper}\``, f.supports ? `\`${f.supports}\`` : "not stated", f.checked, cell(f.result)])),
    "",
    END,
  ].join("\n");
}

/** docs/SUPPORT.md with the section replaced. */
export function withSection(page, m) {
  const a = page.indexOf(START);
  const b = page.indexOf(END);
  if (a === -1 || b === -1 || b < a) throw new Error("docs/SUPPORT.md has no compat-matrix markers");
  return page.slice(0, a) + render(m) + page.slice(b + END.length);
}

/** The problems with a run's results against the committed matrix: a version the matrix does not say means it has to be recorded again. */
export function mismatches(m, results) {
  const problems = [];
  for (const r of results) {
    if (r.kind === "browser-checks") {
      const rows = m.browsers.filter((b) => b.playwright === r.playwright);
      if (rows.length === 0) problems.push(`Playwright ${r.playwright} is not in ${MATRIX}`);
      for (const [engine, got] of Object.entries(r.engines ?? {})) {
        const row = rows.find((b) => b.engine === engine);
        if (row && row.version !== got.version) problems.push(`${engine} in Playwright ${r.playwright} is ${got.version}, ${MATRIX} says ${row.version}`);
      }
    }
    if (r.kind === "node") {
      for (const v of r.versions) {
        const bare = v.replace(/^v/, "");
        if (!m.node.some((n) => n.version === bare || n.version === bare.split(".")[0])) problems.push(`Node ${bare} ran, ${MATRIX} does not list it`);
      }
    }
  }
  return problems;
}

function resultsFrom(paths) {
  const files = paths.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p, { recursive: true }).map((f) => join(p, f)).filter((f) => f.endsWith(".json")) : [p]));
  return files.map((f) => JSON.parse(readFileSync(f, "utf8")));
}

/** Where a run happened, from the environment CI sets; a local run names its commit with RTE_COMMIT. */
export function provenance(env = process.env) {
  const ci = env.GITHUB_ACTIONS === "true";
  return {
    date: new Date().toISOString().slice(0, 10),
    commit: env.GITHUB_SHA || env.RTE_COMMIT || null,
    source: ci ? "ci" : "local",
    run: ci && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, ...args] = process.argv.slice(2);
  const committed = () => { try { return JSON.parse(read(MATRIX)); } catch (error) { if (mode === "--record") return undefined; throw error; } };
  const save = (m) => {
    writeFileSync(join(root, MATRIX), `${JSON.stringify(m, null, 2)}\n`);
    writeFileSync(join(root, "docs/SUPPORT.md"), withSection(read("docs/SUPPORT.md"), m));
  };
  if (mode === "--node") {
    const [out, ...binaries] = args;
    const versions = [process.version, ...binaries.flatMap((b) => b.split(",")).filter(Boolean).map((b) => execFileSync(b, ["--version"], { encoding: "utf8" }).trim())];
    writeFileSync(out, `${JSON.stringify({ kind: "node", versions: [...new Set(versions)], ...provenance() }, null, 2)}\n`);
    const problems = mismatches(committed(), resultsFrom([out]));
    if (problems.length) { console.error(`compat-matrix:\n  ${problems.join("\n  ")}`); process.exit(1); }
    console.log(`compat-matrix: Node ${versions.join(", ")} recorded in ${out}`);
  } else if (mode === "--check") {
    const problems = mismatches(committed(), resultsFrom(args));
    if (problems.length) {
      console.error(`compat-matrix: this run does not match ${MATRIX}. Record it: node tools/compat-matrix.mjs --record <its results>\n  ${problems.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`compat-matrix: the run matches ${MATRIX}`);
  } else if (mode === "--record") {
    const results = resultsFrom(args);
    if (results.length === 0) { console.error("compat-matrix: no results files given"); process.exit(2); }
    save(build(results, committed()));
    console.log(`compat-matrix: ${results.length} results files recorded in ${MATRIX} and docs/SUPPORT.md`);
  } else if (mode === "--render") {
    save(committed());
  } else {
    console.error("usage: node tools/compat-matrix.mjs --node <file> [<node>...] | --check <results>... | --record <results>... | --render");
    process.exit(2);
  }
}
