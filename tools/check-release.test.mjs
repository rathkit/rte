import assert from "node:assert/strict";
import { test } from "node:test";
import { changelogSection, problemsWith } from "./check-release.mjs";

const changelog = "# Changelog\n\n## [0.1.0-alpha.1] - 2026-11-01\n\nSecond.\n\n## [0.1.0-alpha.0] - 2026-10-30\n\nFirst\n- one\n";
const same = { "@a/x": "0.1.0-alpha.0", "@a/y": "0.1.0-alpha.0" };

test("a section is cut at the next heading", () => {
  assert.equal(changelogSection(changelog, "0.1.0-alpha.0"), "First\n- one");
  assert.equal(changelogSection(changelog, "0.1.0-alpha.1"), "Second.");
  assert.equal(changelogSection(changelog, "0.1.0-alpha.2"), undefined);
});

test("a consistent alpha release has no problems", () => {
  assert.deepEqual(problemsWith("v0.1.0-alpha.0", { versions: same, changelog }), []);
});

test("a stable tag is refused while in alpha, and so is a tag that is not a version", () => {
  assert.match(problemsWith("v0.1.0", { versions: { "@a/x": "0.1.0" }, changelog })[0], /nothing is released to latest/);
  assert.match(problemsWith("latest", { versions: same, changelog })[0], /not an alpha/);
});

test("every package must be at the tagged version, and the changelog must have the section", () => {
  const problems = problemsWith("v0.1.0-alpha.0", { versions: { ...same, "@a/z": "0.0.0" }, changelog });
  assert.deepEqual(problems, ["@a/z is at 0.0.0, not 0.1.0-alpha.0"]);
  assert.deepEqual(problemsWith("v0.1.0-alpha.2", { versions: { "@a/x": "0.1.0-alpha.2" }, changelog }), ["CHANGELOG.md has no section for 0.1.0-alpha.2"]);
});

test("an unsigned tag is a problem, because a pushed release cannot be re-tagged", () => {
  const problems = problemsWith("v0.1.0-alpha.0", { versions: same, changelog, signed: false });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not signed/);
});
