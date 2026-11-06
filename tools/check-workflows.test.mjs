import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(import.meta.dirname, "../.github/workflows");
const files = readdirSync(dir).filter((f) => f.endsWith(".yml"));
const text = (f) => readFileSync(join(dir, f), "utf8");

test("every action in every workflow is pinned to a commit", () => {
  assert.ok(files.length >= 3);
  for (const f of files) {
    for (const line of text(f).split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      assert.match(line, /@[0-9a-f]{40}\b/, `${f}: ${line.trim()}`);
    }
  }
});

test("pnpm and Node are set up by pnpm/setup at the commit the repository allows, and the install is from the lockfile", () => {
  const pin = "pnpm/setup@a0881977cd8ea73b1ed212236c99ca10dcc80cf4";
  for (const f of ["ci.yml", "release.yml"]) {
    assert.ok(text(f).includes(pin), `${f} does not use ${pin}`);
    assert.match(text(f), /require-lockfile: true/, `${f} must install from the lockfile only`);
    assert.doesNotMatch(text(f), /pnpm install --frozen-lockfile\n/, `${f} installs twice`);
  }
  assert.doesNotMatch(text("ci.yml") + text("release.yml"), /pnpm\/action-setup/);
});

test("workflows use only actions the repository allows: GitHub's own, or the one pnpm action the repository allows", () => {
  const allowed = /^(actions|github)\/|^pnpm\/setup@a0881977cd8ea73b1ed212236c99ca10dcc80cf4$/;
  for (const f of files) {
    for (const line of text(f).split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) {
      const action = line.replace(/^\s*-?\s*uses:\s*/, "").trim();
      assert.match(action, allowed, `${f}: ${action} is not an action this repository allows (see Settings, Actions)`);
    }
  }
});

test("no workflow can see or use a stored npm token", () => {
  for (const f of files) {
    assert.doesNotMatch(text(f), /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM/i, `${f} mentions an npm token`);
  }
});

test("the release workflow publishes only with provenance, only to next, only from the downloaded files, and asks for the OIDC permission in the jobs that need it", () => {
  const release = text("release.yml");
  const publishes = release.split("\n").filter((l) => /npm (stage )?publish/.test(l));
  assert.ok(publishes.length > 0);
  // Nothing goes live from CI: each version is staged, and the owner approves it with two-factor authentication.
  for (const line of publishes) assert.match(line, /npm stage publish/);
  for (const line of publishes) assert.match(line, /--provenance/);
  for (const line of publishes) assert.match(line, /--tag next/);
  assert.match(release, /sha256sum --check --strict SHA256SUMS/);
  assert.match(release, /vars\.NPM_PUBLISH == 'true'/, "publishing is off until the owner switches it on");
  assert.match(release, /--prerelease/);
  // The top-level permissions are read-only; `id-token: write` appears only inside jobs.
  const top = release.slice(0, release.indexOf("jobs:"));
  assert.doesNotMatch(top, /id-token: write|contents: write/);
});

test("the CI workflow never asks for more than read access", () => {
  assert.doesNotMatch(text("ci.yml"), /write/);
});

test("CI skips changes that only touch documentation, and keeps the browsers between runs", () => {
  const ci = text("ci.yml");
  assert.match(ci, /paths-ignore:/);
  // Branch protection requires the checks on a pull request, and a workflow that is skipped never reports them.
  assert.doesNotMatch(ci.slice(ci.indexOf("pull_request:"), ci.indexOf("permissions:")), /paths-ignore/);
  for (const path of ["*.md", "docs/**"]) assert.ok(ci.includes(`"${path}"`), path);
  // Nothing that changes how the editor builds or behaves may be ignored.
  assert.doesNotMatch(ci.slice(ci.indexOf("paths-ignore"), ci.indexOf("permissions:")), /packages|tools|\.github\/workflows|package\.json|\.ya?ml|\.mjs|\.ts/);
  assert.match(ci, /actions\/cache@[0-9a-f]{40}/);
  assert.match(ci, /hashFiles\('tools\/browser-checks\/pnpm-lock\.yaml'\)/);
});

test("the pull request checks a branch ruleset can require are named for what the ruleset lists", () => {
  // A required check matches a job's name, so the jobs are named dco and title, not by their keys.
  assert.match(text("dco.yml"), /commits:\n(?:.*\n)*?\s+name: dco\n/);
  assert.match(text("title.yml"), /title:\n\s+name: title\n/);
  const pattern = new RegExp(text("title.yml").match(/pattern='(.*)'/)?.[1]?.replace(/\[:upper:\]/g, "A-Z").replace(/\[:space:\]/g, "\\s") ?? "(?!)");
  for (const good of ["feat(tables): sort rows", "chore(release): 0.1.0", "docs!: break it", "fix: a. b"]) assert.match(good, pattern, good);
  for (const bad of ["Feat: x1", "feat: Upper", "feat: ends.", "feat(a b): x1", "update things", "feat:no space"]) assert.doesNotMatch(bad, pattern, bad);
});

test("every job runs on a runner image pinned to a version, never a -latest label", () => {
  for (const f of files) {
    const labels = text(f).split("\n").filter((l) => /^\s*runs-on:/.test(l));
    assert.ok(labels.length > 0, `${f} has no runs-on`);
    for (const line of labels) assert.match(line, /runs-on:\s*[a-z]+-\d+\.\d+\s*$/, `${f}: ${line.trim()}`);
  }
});

test("the benchmark gate runs the benchmark repository's container at the commit tools/bench.ref names, never a branch", () => {
  const ref = readFileSync(new URL("./bench.ref", import.meta.url), "utf8").trim();
  assert.match(ref, /^[0-9a-f]{40}$/, "tools/bench.ref must hold one full commit hash");
  const ci = text("ci.yml");
  assert.match(ci, /repository: rathkit\/rte-bench\n\s+ref: \$\{\{ steps\.ref\.outputs\.sha \}\}/);
  assert.match(ci, /tools\/bench\.ref/);
  assert.match(ci, /rte-bench\/container\/run\.sh gate --rte \. --base base --limits tools\/bench/);
});
