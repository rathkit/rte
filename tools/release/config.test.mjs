import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../..");
const release = JSON.parse(readFileSync(join(root, "nx.json"), "utf8")).release;

test("every kind of commit bumps at least a patch, a feature bumps a minor, and a breaking change a major", () => {
  const { types } = release.conventionalCommits;
  assert.equal(types.feat.semverBump, "minor");
  for (const [type, rule] of Object.entries(types)) if (type !== "feat") assert.equal(rule.semverBump, "patch", `${type} should bump a patch`);
  for (const type of ["feat", "fix", "perf", "refactor", "docs", "test", "build", "ci", "chore", "style", "revert"]) assert.ok(types[type], `${type} is missing`);
  // Breaking changes are major in Nx itself; in 0.x it must not shift them down to a minor.
  assert.equal(release.version.adjustSemverBumpsForZeroMajorVersion, false);
});

test("no kind of commit is left out of the changelog, and the commit's scope does not decide which packages a commit counts for", () => {
  for (const [type, rule] of Object.entries(release.conventionalCommits.types)) assert.ok(rule.changelog && rule.changelog !== false, `${type} is hidden from the changelog`);
  assert.equal(release.conventionalCommits.useCommitScope, false);
});

test("all packages are released together, as v<version> tags, from the tag, with the version actions that are in the repository", () => {
  assert.equal(release.projectsRelationship, "fixed");
  assert.deepEqual(release.projects, ["packages/*"]);
  assert.equal(release.releaseTag.pattern, "v{version}");
  assert.equal(release.version.specifierSource, "conventional-commits");
  assert.equal(release.version.currentVersionResolver, "git-tag");
  assert.ok(existsSync(join(root, release.version.versionActions)));
  assert.equal(release.changelog.workspaceChangelog.createRelease, false, "the release page is made by the release workflow, with its files");
});
