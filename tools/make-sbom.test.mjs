import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sbomFor } from "./make-sbom.mjs";

const packages = join(import.meta.dirname, "../packages");
const all = readdirSync(packages).map((d) => JSON.parse(readFileSync(join(packages, d, "package.json"), "utf8")));

test("every package gets a CycloneDX bill with itself and zero components", () => {
  assert.ok(all.length >= 10);
  for (const pkg of all) {
    const bill = sbomFor(pkg, { timestamp: "2026-01-01T00:00:00Z" });
    assert.equal(bill.bomFormat, "CycloneDX");
    assert.equal(bill.specVersion, "1.5");
    assert.equal(bill.metadata.component.name, pkg.name);
    assert.equal(bill.metadata.component.purl, `pkg:npm/${pkg.name.replaceAll("@", "%40")}@${pkg.version}`);
    assert.deepEqual(bill.components, []);
    assert.deepEqual(bill.dependencies, [{ ref: bill.metadata.component["bom-ref"], dependsOn: [] }]);
    assert.equal(bill.metadata.component.licenses[0].license.id, "Apache-2.0");
  }
});

test("the bill names the exact file it describes when given one", () => {
  const bill = sbomFor(all[0], { tarball: Buffer.from("abc"), timestamp: "2026-01-01T00:00:00Z" });
  assert.equal(bill.metadata.component.hashes[0].alg, "SHA-512");
  assert.equal(bill.metadata.component.hashes[0].content.length, 128);
});

test("a package with a runtime dependency gets no bill at all", () => {
  for (const field of ["dependencies", "optionalDependencies", "bundledDependencies"]) {
    assert.throws(() => sbomFor({ ...all[0], [field]: { left: "1.0.0" } }), /runtime dependencies/);
  }
  assert.doesNotThrow(() => sbomFor({ ...all[0], dependencies: {} }), "an empty field is none");
});
