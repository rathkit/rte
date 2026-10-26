// Builds the app in apps/aot the way an Angular app is built: the Angular compiler compiles it ahead of time (templates checked against
// the wrapper's declarations), the bundle has no template compiler, and the partial declarations in the libraries (the wrapper and
// Angular's own packages) are linked by Angular's linker. Used by build.mjs.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const here = import.meta.dirname;
const require = createRequire(join(here, "package.json"));

export async function buildAot(pack) {
  const ngc = spawnSync(process.execPath, [join(here, "node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js"), "-p", join(here, "apps/aot/tsconfig.json")], { encoding: "utf8", cwd: here });
  if (ngc.status !== 0) throw new Error(`ngc failed:\n${ngc.stdout}${ngc.stderr}`);
  const out = join(here, "dist/angular-aot.js");
  const bundled = spawnSync(pack, ["bundle", join(here, "node_modules/.aot/out/main.js"), "--outfile", out, "--format", "iife", "--define", 'process.env.NODE_ENV="development"', "--condition", "browser"], { encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(`bundling the AOT app failed:\n${bundled.stderr || bundled.stdout}`);
  const { transformSync } = await import("@babel/core");
  const { createEs2015LinkerPlugin } = await import("@angular/compiler-cli/linker/babel");
  const { NodeJSFileSystem, ConsoleLogger, LogLevel } = await import("@angular/compiler-cli");
  const code = readFileSync(out, "utf8");
  const linked = transformSync(code, { filename: out, compact: false, sourceMaps: false, configFile: false, babelrc: false, plugins: [createEs2015LinkerPlugin({ fileSystem: new NodeJSFileSystem(), logger: new ConsoleLogger(LogLevel.warn), linkerJitMode: false, sourceMapping: false })] });
  writeFileSync(out, linked.code);
  copyFileSync(join(here, "apps/angular-aot.html"), join(here, "dist/angular-aot.html"));
  // Angular's own bundle defines the declare functions, so only a call (not a definition) is a declaration left unlinked.
  const left = linked.code.match(/(?<!function )ɵɵngDeclare\w+\(/g) ?? [];
  if (left.length > 0) throw new Error(`${left.length} partial declarations were left unlinked`);
  if (/R3TargetBinder|compileComponentFromMetadata/.test(linked.code)) throw new Error("the AOT bundle contains the template compiler");
  return "linked, no template compiler";
}
