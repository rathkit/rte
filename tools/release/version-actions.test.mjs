import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const Actions = require("./version-actions.cjs");

/** A tree that holds files in memory, as much of Nx's as the version actions use. */
const treeOf = (files) => ({ read: (path) => files[path], write: (path, text) => { files[path] = text; } });
const actionsFor = (root) => new Actions({}, { data: { root } }, {});
const graph = { nodes: { core: { name: "@rathkit/rte-core" }, headless: { name: "@rathkit/rte-headless" } } };
const manifest = (extra = {}) => JSON.stringify({ name: "@rathkit/rte-ui", version: "0.1.0-alpha.0", peerDependencies: { "@rathkit/rte-core": ">=0.1.0-alpha.0 <0.2.0", react: ">=18" }, devDependencies: { "@rathkit/rte-core": "workspace:*" }, ...extra }, null, 2);

test("it reads the version from the package's own package.json and never from a registry", async () => {
  const tree = treeOf({ "packages/ui/package.json": manifest() });
  const actions = actionsFor("packages/ui");
  assert.deepEqual(await actions.readCurrentVersionFromSourceManifest(tree), { currentVersion: "0.1.0-alpha.0", manifestPath: "packages/ui/package.json" });
  assert.equal(await actions.readCurrentVersionFromRegistry(), null);
});

test("it writes the new version and keeps the rest of the file as it was", async () => {
  const files = { "packages/ui/package.json": manifest() };
  await actionsFor("packages/ui").updateProjectVersion(treeOf(files), "0.1.0-alpha.1");
  const after = JSON.parse(files["packages/ui/package.json"]);
  assert.equal(after.version, "0.1.0-alpha.1");
  assert.equal(after.devDependencies["@rathkit/rte-core"], "workspace:*");
  assert.ok(files["packages/ui/package.json"].endsWith("}\n"));
});

test("peer ranges on siblings start at the new release and stop below the next minor; other peers and dev dependencies are left alone", async () => {
  const files = { "packages/ui/package.json": manifest() };
  const logs = await actionsFor("packages/ui").updateProjectDependencies(treeOf(files), graph, { core: "0.1.0-alpha.3", headless: "0.1.0-alpha.3" });
  const after = JSON.parse(files["packages/ui/package.json"]);
  assert.equal(after.peerDependencies["@rathkit/rte-core"], ">=0.1.0-alpha.3 <0.2.0");
  assert.equal(after.peerDependencies.react, ">=18");
  assert.equal(after.peerDependencies["@rathkit/rte-headless"], undefined, "a package that is not a peer is not made one");
  assert.equal(after.devDependencies["@rathkit/rte-core"], "workspace:*");
  assert.equal(logs.length, 1);
});

test("after 1.0 the range stops below the next major", async () => {
  const files = { "packages/ui/package.json": manifest() };
  await actionsFor("packages/ui").updateProjectDependencies(treeOf(files), graph, { core: "1.2.0" });
  assert.equal(JSON.parse(files["packages/ui/package.json"]).peerDependencies["@rathkit/rte-core"], ">=1.2.0 <2.0.0");
});
