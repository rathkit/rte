// Builds the check apps. The wrappers are copied (not linked) next to the frameworks so that each finds its peer dependency the way an
// app's install would. Bundling uses rathkit-pack:  RTE_PACK=<binary> node tools/framework-checks/build.mjs
import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildReadmeExamples } from "./readme.mjs";
import { join } from "node:path";

const here = import.meta.dirname;
const packages = join(here, "../../packages");
const pack = process.env.RTE_PACK;
if (!pack) throw new Error("set RTE_PACK to a rathkit-pack binary");

rmSync(join(here, "node_modules/@rathkit"), { recursive: true, force: true });
for (const name of ["core", "headless", "element", "react", "vue", "svelte", "angular", "jquery", "ui", "themes", "icons"]) {
  const to = join(here, "node_modules/@rathkit", `rte-${name}`);
  mkdirSync(to, { recursive: true });
  copyFileSync(join(packages, `rte-${name}`, "package.json"), join(to, "package.json"));
  cpSync(join(packages, `rte-${name}`, "dist"), join(to, "dist"), { recursive: true });
}
rmSync(join(here, "dist"), { recursive: true, force: true });
mkdirSync(join(here, "dist"), { recursive: true });
for (const app of ["react", "vue", "svelte", "angular", "angular-forms", "jquery"]) {
  const result = spawnSync(pack, ["bundle", join(here, `apps/${app}.js`), "--outfile", join(here, `dist/${app}.js`), "--format", "iife", "--define", 'process.env.NODE_ENV="development"', "--define", "__VUE_OPTIONS_API__=true", "--define", "__VUE_PROD_DEVTOOLS__=false", "--define", "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`bundle ${app} failed:\n${result.stderr || result.stdout}`);
    process.exit(1);
  }
  copyFileSync(join(here, `apps/${app}.html`), join(here, `dist/${app}.html`));
  console.log(`built ${app}`);
}
console.log(`built the README examples: ${buildReadmeExamples(pack).join(", ")}`);
