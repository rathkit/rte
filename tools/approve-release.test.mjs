import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSums, splitStaged, stagedEntries } from "./approve-release.mjs";

const hash = "a".repeat(64);

test("checksum lines become a map by file name", () => {
  const sums = parseSums(`${hash}  rathkit-rte-core-0.2.0-beta.0.tgz\n${"b".repeat(64)} *./x.tgz\nnot a line\n`);
  assert.equal(sums.get("rathkit-rte-core-0.2.0-beta.0.tgz"), hash);
  assert.equal(sums.get("x.tgz"), "b".repeat(64));
  assert.equal(sums.size, 2);
});

test("staged entries are read from a list or from an object holding one", () => {
  const one = { id: "s1", name: "@rathkit/rte-core", version: "1.0.0" };
  assert.deepEqual(stagedEntries([one]), [one]);
  assert.deepEqual(stagedEntries({ staged: [one] }), [one]);
  assert.deepEqual(stagedEntries({ error: "x" }), []);
  // the shape npm prints: packageName, and a status that must be "staged"
  const real = { id: "s1", packageName: "@rathkit/rte-vue", version: "0.2.0-beta.0", tag: "next", status: "staged" };
  assert.deepEqual(stagedEntries([real, { ...real, id: "s2", status: "rejected" }]), [one].map(() => ({ id: "s1", name: "@rathkit/rte-vue", version: "0.2.0-beta.0" })));
  assert.deepEqual(stagedEntries([{ name: "a", version: "1" }]), []);
});

test("a package that is not staged is left to the caller, and a doubled one is a problem", () => {
  const e = [{ id: "1", name: "a", version: "1" }, { id: "2", name: "b", version: "1" }, { id: "3", name: "b", version: "1" }];
  assert.deepEqual(splitStaged(e, ["a"], "1"), { staged: [{ name: "a", id: "1" }], missing: [], problems: [] });
  assert.deepEqual(splitStaged(e, ["c"], "1").missing, ["c"]);
  assert.match(splitStaged(e, ["b"], "1").problems[0], /staged 2 times/);
  assert.deepEqual(splitStaged(e, ["a"], "2").missing, ["a"]);
});
