// The committed compatibility matrix may not drift: its versions are the repository's pins, its section of docs/SUPPORT.md is exactly what the
// matrix renders to, and every result in it is either "not run" or names the run it came from. (The results themselves are checked against each
// CI run by `compat-matrix.mjs --check`.)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { END, JOBS, MATRIX, START, build, mismatches, pins, provenance, render, withSection } from "./compat-matrix.mjs";

const root = join(import.meta.dirname, "..");
const matrix = JSON.parse(readFileSync(join(root, MATRIX), "utf8"));
const support = readFileSync(join(root, "docs/SUPPORT.md"), "utf8");

test("the section of docs/SUPPORT.md is exactly what the committed matrix renders to (fix: node tools/compat-matrix.mjs --render)", () => {
  assert.equal(support.split(START).length, 2, "one start marker");
  assert.equal(support.split(END).length, 2, "one end marker");
  assert.equal(withSection(support, matrix), support);
});

test("the matrix's versions are the repository's pins (fix: record a run with the new pins, node tools/compat-matrix.mjs --record <results>)", () => {
  const p = pins();
  assert.equal(matrix.schemaVersion, 1);
  for (const { job } of JOBS) {
    const rows = matrix.browsers.filter((b) => b.job === job);
    assert.deepEqual(rows.map((b) => b.engine), ["chromium", "firefox", "webkit"], job);
    for (const b of rows) assert.equal(b.playwright, p.playwright[job], `${job} ${b.engine}`);
  }
  assert.deepEqual(matrix.node.map((n) => n.version), p.node.map((n) => n.version));
  assert.ok(p.node.every((n) => n.version), "the Node versions are found in ci.yml and .node-version");
  assert.deepEqual(matrix.frameworks.map(({ result: _, ...f }) => f), p.frameworks);
});

test("every result is not run, or names its status, counts where there are any, date, source and commit", () => {
  const all = [...matrix.browsers, ...matrix.devices, ...matrix.node, ...matrix.frameworks].map((row) => row.result);
  for (const r of all) {
    if (r.status === "not run") { assert.deepEqual(Object.keys(r), ["status"]); continue; }
    assert.ok(["passed", "failed"].includes(r.status), r.status);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(["ci", "local"].includes(r.source), r.source);
    assert.ok(r.commit === null || /^[0-9a-f]{40}$/.test(r.commit), String(r.commit));
    if (r.source === "ci") assert.match(String(r.run), /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/);
  }
  for (const b of matrix.browsers) if (b.result.status !== "not run") assert.match(String(b.version), /^\d+(\.\d+)+$/, `${b.job} ${b.engine}`);
});

test("a run fills only its own cells, an empty matrix says not run everywhere, and a version that is not recorded is found", () => {
  const p = pins();
  const empty = build([]);
  for (const row of [...empty.browsers, ...empty.devices, ...empty.node, ...empty.frameworks]) assert.deepEqual(row.result, { status: "not run" });
  assert.ok(render(empty).includes("| not run |"));
  const when = { date: "2026-11-11", commit: "a".repeat(40), source: "ci", run: "https://github.com/o/r/actions/runs/1" };
  const run = { kind: "browser-checks", playwright: p.playwright.browsers, engines: { chromium: { version: "1.2.3", passed: 5, failed: 0 }, firefox: { version: "4.5", passed: 4, failed: 1 } }, ...when };
  const m = build([run]);
  const row = (job, engine) => m.browsers.find((b) => b.job === job && b.engine === engine);
  assert.deepEqual(row("browsers", "chromium").result, { status: "passed", passed: 5, failed: 0, ...when });
  assert.equal(row("browsers", "firefox").result.status, "failed");
  assert.deepEqual(row("browsers", "webkit").result, { status: "not run" });
  assert.deepEqual(row("browsers-oldest", "chromium").result, { status: "not run" });
  // A later run of the other job keeps this one.
  const kept = build([{ ...run, playwright: p.playwright["browsers-oldest"], engines: { webkit: { version: "9", passed: 1, failed: 0 } } }], m);
  assert.equal(kept.browsers.find((b) => b.job === "browsers" && b.engine === "chromium").version, "1.2.3");
  assert.deepEqual(mismatches(m, [run]), []);
  assert.equal(mismatches(m, [{ ...run, engines: { chromium: { version: "1.2.4", passed: 1, failed: 0 } } }]).length, 1);
  assert.equal(mismatches(m, [{ ...run, playwright: "0.0.1" }]).length, 1);
  assert.throws(() => build([{ ...run, playwright: "0.0.1" }]), /neither driver pins/);
  assert.deepEqual(mismatches(m, [{ kind: "node", versions: p.node.map((n) => `v${n.version}`) }]), []);
  assert.equal(mismatches(m, [{ kind: "node", versions: ["v1.0.0"] }]).length, 1);
});

test("a run says where it happened: CI with its run, or a local run", () => {
  const ci = provenance({ GITHUB_ACTIONS: "true", GITHUB_SHA: "b".repeat(40), GITHUB_SERVER_URL: "https://github.com", GITHUB_REPOSITORY: "o/r", GITHUB_RUN_ID: "7" });
  assert.equal(ci.source, "ci");
  assert.equal(ci.run, "https://github.com/o/r/actions/runs/7");
  const local = provenance({ RTE_COMMIT: "c".repeat(40) });
  assert.deepEqual([local.source, local.run, local.commit], ["local", null, "c".repeat(40)]);
});
