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

test("workflows use only actions the repository allows: GitHub's own, or ones from verified creators already in use", () => {
  const allowed = /^(actions|github)\/|^pnpm\/action-setup@/;
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
  const publishes = release.split("\n").filter((l) => /npm publish/.test(l));
  assert.ok(publishes.length > 0);
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
