// Builds the check apps. The wrappers are copied (not linked) next to the frameworks so that each finds its peer dependency the way an
// app's install would. Bundling uses rathkit-pack:  RTE_PACK=<binary> node tools/framework-checks/build.mjs
import { cpSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { compile } from "svelte/compiler";
import { spawnSync } from "node:child_process";
import { buildAot } from "./aot.mjs";
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
// Svelte ships a server build by default and a client build under the "browser" condition: the template app asks for the latter.
// Svelte templates are compiled by Svelte itself, then bundled like the rest.
mkdirSync(join(here, "dist/gen"), { recursive: true });
writeFileSync(join(here, "dist/gen/ui-svelte.js"), compile(readFileSync(join(here, "apps/ui-svelte.svelte"), "utf8"), { filename: "ui-svelte.svelte", generate: "client" }).js.code);
for (const app of ["react", "vue", "svelte", "angular", "angular-forms", "jquery", "ui-react", "ui-vue", "ui-angular", "ui-svelte"]) {
  const result = spawnSync(pack, ["bundle", join(here, `apps/${app}.js`), "--outfile", join(here, `dist/${app}.js`), "--format", "iife", ...(app === "ui-svelte" ? ["--condition", "browser"] : []), "--define", 'process.env.NODE_ENV="development"', "--define", "__VUE_OPTIONS_API__=true", "--define", "__VUE_PROD_DEVTOOLS__=false", "--define", "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`bundle ${app} failed:\n${result.stderr || result.stdout}`);
    process.exit(1);
  }
  copyFileSync(join(here, `apps/${app}.html`), join(here, `dist/${app}.html`));
  console.log(`built ${app}`);
}
console.log(`built the AOT Angular app: ${await buildAot(pack)}`);
console.log(`built the README examples: ${buildReadmeExamples(pack).join(", ")}`);
