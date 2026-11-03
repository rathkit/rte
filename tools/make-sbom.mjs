// Writes a software bill of materials for each package, in CycloneDX 1.5 JSON, from the package files themselves (no outside tool):
//   node tools/make-sbom.mjs <output folder> [tarball folder]
// Every package ships with no runtime dependencies, so each bill lists the package and zero components. With a tarball folder, the
// package's file hash (sha-512, as npm records it) is included, so the bill names the exact file it describes. The same function is used by
// the test and by the release workflow; it refuses to write a bill for a package that has runtime dependencies.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** The bill for one package.json (as an object). `tarball` is the packed file's bytes, if there is one. */
export function sbomFor(pkg, { tarball, timestamp = new Date().toISOString() } = {}) {
  const runtime = ["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies"].filter((k) => pkg[k] && Object.keys(pkg[k]).length > 0);
  if (runtime.length > 0) throw new Error(`${pkg.name} has runtime dependencies (${runtime.join(", ")}); a package must ship none`);
  const encoded = pkg.name.replaceAll("@", "%40");
  const component = {
    type: "library",
    "bom-ref": `pkg:npm/${encoded}@${pkg.version}`,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    purl: `pkg:npm/${encoded}@${pkg.version}`,
    licenses: [{ license: { id: pkg.license } }],
    externalReferences: [
      { type: "vcs", url: pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "") },
      { type: "website", url: pkg.homepage },
      { type: "issue-tracker", url: pkg.bugs.url },
    ],
    ...(tarball ? { hashes: [{ alg: "SHA-512", content: createHash("sha512").update(tarball).digest("hex") }] } : {}),
  };
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [{ type: "application", name: "rathkit-rte tools/make-sbom.mjs" }] },
      component,
      properties: [
        { name: "rathkit:runtime-components", value: "0" },
        { name: "rathkit:note", value: "Optional peer dependencies (a framework the wrapper is used with) are not part of the package and are not installed with it." },
      ],
    },
    // The runtime components of a package: none. (Development tools are not shipped and are not listed.)
    components: [],
    dependencies: [{ ref: component["bom-ref"], dependsOn: [] }],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.argv[2] ?? "sbom");
  const tarballs = process.argv[3] ? resolve(process.argv[3]) : undefined;
  mkdirSync(out, { recursive: true });
  const dirs = readdirSync(join(root, "packages")).filter((d) => existsSync(join(root, "packages", d, "package.json"))).sort();
  for (const dir of dirs) {
    const pkg = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8"));
    const file = tarballs ? join(tarballs, `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`) : undefined;
    const bill = sbomFor(pkg, file && existsSync(file) ? { tarball: readFileSync(file) } : {});
    writeFileSync(join(out, `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.cdx.json`), JSON.stringify(bill, null, 2) + "\n");
  }
  console.log(`sbom: ${dirs.length} bills written to ${out}, each with zero runtime components`);
}
