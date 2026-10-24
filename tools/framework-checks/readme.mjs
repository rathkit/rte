// Turns the example in each package's README into a page that runs it, so that an example in a README is one that works.
// For every package the first code block under "## Example" is taken as written, bundled against the built packages and the real
// frameworks, and put in a page. Only what the example itself says it needs is added: a mount point for the framework ones.
// Used by build.mjs; run.mjs drives the pages.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const here = import.meta.dirname;
const require = createRequire(join(here, "package.json"));
const readmes = join(here, "../../packages");

/** The example in a package's README: its code and the language of the block. */
export function exampleOf(pkg) {
  const text = readFileSync(join(readmes, pkg, "README.md"), "utf8");
  const m = /## Example\n\n```(\w*)\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new Error(`${pkg}: no example in the README`);
  return { lang: m[1], code: m[2] };
}

const DEFINES = ["--define", 'process.env.NODE_ENV="development"', "--define", "__VUE_OPTIONS_API__=true", "--define", "__VUE_PROD_DEVTOOLS__=false", "--define", "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false"];

function bundle(pack, entry, outfile, extra = []) {
  const result = spawnSync(pack, ["bundle", entry, "--outfile", outfile, "--format", "iife", ...DEFINES, "--condition", "browser", ...extra], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`bundling ${entry} failed:\n${result.stderr || result.stdout}`);
}

/** CSS the example imports is linked in the page instead, from the files the check server serves. */
function takeCss(code) {
  const links = [];
  const stripped = code.replace(/^import\s+"@rathkit\/(rte-ui|rte-themes)\/([\w-]+\.css)";\n?/gm, (_, pkg, file) => {
    links.push(`/${pkg === "rte-ui" ? "ui" : "themes"}/css/${file}`);
    return "";
  });
  return { code: stripped, links };
}

const page = (title, head, body) => `<!doctype html>\n<meta charset="utf-8">\n<title>${title}</title>\n${head}\n<body>\n${body}\n</body>\n`;

/** Builds a page for every README example into `dist/`. Returns the names of the pages. */
export function buildReadmeExamples(pack) {
  const dist = join(here, "dist");
  const work = join(here, "node_modules/.readme");
  mkdirSync(work, { recursive: true });
  mkdirSync(dist, { recursive: true });
  const names = [];
  const packages = readdirSync(readmes).sort();
  for (const pkg of packages) {
    const { lang, code } = exampleOf(pkg);
    const name = pkg;
    const out = join(dist, `readme-${name}.js`);
    let head = "";
    let body = "";
    if (lang === "html") {
      // The element example: the module script defines the element, the rest of the page is used as written.
      const module = /<script type="module">([\s\S]*?)<\/script>/.exec(code);
      if (!module) throw new Error(`${pkg}: the html example has no module script`);
      writeFileSync(join(work, `${name}.js`), module[1]);
      bundle(pack, join(work, `${name}.js`), out);
      body = `<script src="./readme-${name}.js"></script>\n${code.replace(module[0], "")}`;
    } else if (lang === "jsx") {
      const component = /export function (\w+)/.exec(code)?.[1];
      if (!component) throw new Error(`${pkg}: no exported component`);
      writeFileSync(join(work, `${name}.jsx`), `${code}\nimport { createRoot as __createRoot } from "react-dom/client";\n__createRoot(document.getElementById("app")).render(<${component} />);\n`);
      bundle(pack, join(work, `${name}.jsx`), out, ["--jsx", "automatic"]);
      body = `<div id="app"></div>\n<script src="./readme-${name}.js"></script>`;
    } else if (lang === "vue") {
      const sfc = require("vue/compiler-sfc");
      const { descriptor, errors } = sfc.parse(code, { filename: `${name}.vue` });
      if (errors.length > 0) throw new Error(`${pkg}: ${errors[0].message}`);
      const script = sfc.compileScript(descriptor, { id: name, inlineTemplate: true });
      writeFileSync(join(work, `${name}-component.js`), script.content);
      writeFileSync(join(work, `${name}.js`), `import Component from "./${name}-component.js";\nimport { createApp } from "vue";\ncreateApp(Component).mount("#app");\n`);
      bundle(pack, join(work, `${name}.js`), out);
      body = `<div id="app"></div>\n<script src="./readme-${name}.js"></script>`;
    } else if (lang === "svelte") {
      const compiled = require("svelte/compiler").compile(code, { filename: `${name}.svelte`, generate: "client" });
      writeFileSync(join(work, `${name}-component.js`), compiled.js.code);
      writeFileSync(join(work, `${name}.js`), `import Component from "./${name}-component.js";\nimport { mount } from "svelte";\nmount(Component, { target: document.getElementById("app") });\n`);
      bundle(pack, join(work, `${name}.js`), out);
      body = `<div id="app"></div>\n<script src="./readme-${name}.js"></script>`;
    } else {
      const { code: js, links } = takeCss(code);
      writeFileSync(join(work, `${name}.js`), js);
      bundle(pack, join(work, `${name}.js`), out);
      head = links.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n");
      // The jQuery example says it needs a mount point; the rest make their own elements.
      body = `${/<div id="editor"><\/div>/.test(code) ? '<div id="editor"></div>\n' : ""}<script src="./readme-${name}.js"></script>`;
    }
    writeFileSync(join(dist, `readme-${name}.html`), page(`${pkg} README example`, head, body));
    names.push(name);
  }
  return names;
}
