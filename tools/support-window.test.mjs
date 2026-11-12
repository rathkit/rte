// The support window (docs/SUPPORT.md, "Support window") is enforced by a CI job that runs the browser checks with the older browser driver, and by
// the feature check in packages/rte-core/src/dom/support.ts. This keeps the job, the two pins and the page in step.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (f) => readFileSync(join(root, f), "utf8");
const pin = (dir) => JSON.parse(read(`${dir}/package.json`)).devDependencies.playwright;
const support = read("docs/SUPPORT.md");
const section = support.slice(support.indexOf("\n## Support window\n"), support.indexOf("\n## ", support.indexOf("\n## Support window\n") + 1));
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

test("both browser drivers are pinned to an exact version, in package.json and in the lockfile, and the oldest one is older", () => {
  for (const dir of ["tools/browser-checks", "tools/browser-checks/oldest"]) {
    assert.match(pin(dir), /^\d+\.\d+\.\d+$/, `${dir}: an exact version`);
    assert.ok(read(`${dir}/pnpm-lock.yaml`).includes(`playwright@${pin(dir)}:`), `${dir}: the lockfile has playwright ${pin(dir)}`);
    assert.match(read(`${dir}/pnpm-workspace.yaml`), /^packages: \[\]$/m, `${dir} is a project of its own`);
  }
  assert.ok(newer(pin("tools/browser-checks"), pin("tools/browser-checks/oldest")));
});

test("CI runs the browser checks with the oldest driver, caching its browsers by its own lockfile", () => {
  const ci = read(".github/workflows/ci.yml");
  const start = ci.indexOf("\n  browsers-oldest:\n");
  assert.notEqual(start, -1, "ci.yml has a browsers-oldest job");
  const next = ci.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  const job = next === -1 ? ci.slice(start) : ci.slice(start, start + 1 + next);
  assert.match(job, /runs-on: ubuntu-24\.04/);
  assert.match(job, /working-directory: tools\/browser-checks\/oldest/);
  assert.match(job, /pnpm install --frozen-lockfile --ignore-scripts/);
  assert.match(job, /hashFiles\('tools\/browser-checks\/oldest\/pnpm-lock\.yaml'\)/);
  assert.match(job, /run: tools\/browser-checks\/run\.sh\n\s+env:\n\s+RTE_PLAYWRIGHT: \$\{\{ github\.workspace \}\}\/tools\/browser-checks\/oldest\/node_modules/);
});

test("docs/SUPPORT.md states the window, names both drivers and every feature the editor checks", () => {
  assert.ok(section.length > 100, "a Support window section");
  assert.match(section, /current and the previous major version/);
  for (const dir of ["tools/browser-checks", "tools/browser-checks/oldest"]) assert.ok(section.includes(`Playwright ${pin(dir)}`), `names Playwright ${pin(dir)}`);
  const source = read("packages/rte-core/src/dom/support.ts");
  const features = [...source.matchAll(/^ {2}\["([^"]+)", \(s\) =>/gm)].map((m) => m[1].replace(/ \(.*\)$/, ""));
  assert.ok(features.length >= 5, `${features.length} features found in support.ts`);
  for (const feature of features) assert.ok(section.includes(`\`${feature}\``), `SUPPORT.md names ${feature}`);
  assert.match(section, /unsupported-browser/);
});
