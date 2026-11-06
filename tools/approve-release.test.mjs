import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSums, problemsWith, stagedEntries } from "./approve-release.mjs";

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
  assert.deepEqual(stagedEntries([{ name: "a", version: "1" }]), []);
});

test("a missing or doubled package is a problem", () => {
  const e = [{ id: "1", name: "a", version: "1" }, { id: "2", name: "b", version: "1" }, { id: "3", name: "b", version: "1" }];
  assert.deepEqual(problemsWith(e, ["a"], "1"), []);
  assert.match(problemsWith(e, ["c"], "1")[0], /c@1 is not staged/);
  assert.match(problemsWith(e, ["b"], "1")[0], /staged 2 times/);
  assert.deepEqual(problemsWith(e, ["a"], "2"), ["a@2 is not staged"]);
});
