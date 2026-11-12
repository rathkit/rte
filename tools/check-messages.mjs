// Checks message packs against the words the editor says: for each pack, the keys it lacks (they are said in English), the keys it has
// that nothing says (a typo, or a word that is gone), plural messages whose forms are not the language's plural categories, and values
// named in braces that the English words do not have. Fails when it finds any of these.
//   node tools/check-messages.mjs [--allow-missing] [pack.js ...]
// With no packs named it checks the test packs (packages/rte-ui/demo/test-packs), which are test fixtures, not shipped translations.
// A pack is an ES module whose default export is { locale, dir?, messages }. The catalog is made from the built packages: run `pnpm build` first.
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(import.meta.dirname, "..");
const TEST_PACKS = join(repo, "packages/rte-ui/demo/test-packs");

/** Every word the standard editor and the styled interface can say, in English, by stable id. */
export async function englishCatalog() {
  const load = (path) => import(pathToFileURL(join(repo, "packages", path)).href);
  const [core, standard, markdown, dom, ui] = await Promise.all([
    load("rte-core/dist/index.js"), load("rte-core/dist/standard/index.js"), load("rte-core/dist/markdown/index.js"),
    load("rte-core/dist/dom/index.js"), load("rte-ui/dist/index.js"),
  ]);
  const engine = core.createEngine({ doc: core.importHtml("<p></p>"), platform: "other", onWarning: () => undefined });
  for (const plugin of [...standard.standardPlugins(), markdown.markdown()]) engine.use(plugin);
  return { ...ui.messageCatalog(engine), ...dom.CONTENT_MESSAGES };
}

const names = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

/**
 * The problems with one pack, against a catalog: `missing` and `unused` keys (a plural form counts as `key:form`), and `wrong`, each a
 * sentence. A plural message needs exactly the plural categories of the pack's language.
 */
export function checkPack(pack, catalog) {
  const missing = [];
  const unused = [];
  const wrong = [];
  if (!pack || typeof pack !== "object" || typeof pack.messages !== "object" || pack.messages === null) return { missing, unused, wrong: ["the default export is not { locale, messages }"] };
  let categories = [];
  const known = (tag) => { try { return Intl.PluralRules.supportedLocalesOf([tag]).length > 0; } catch { return false; } };
  if (typeof pack.locale !== "string" || !known(pack.locale)) wrong.push(`locale ${JSON.stringify(pack.locale)} is not a language the platform knows`);
  else categories = new Intl.PluralRules(pack.locale).resolvedOptions().pluralCategories;
  if (pack.dir !== undefined && pack.dir !== "ltr" && pack.dir !== "rtl") wrong.push(`dir ${JSON.stringify(pack.dir)} is not ltr or rtl`);
  for (const key of Object.keys(catalog)) if (!(key in pack.messages)) missing.push(key);
  for (const [key, value] of Object.entries(pack.messages)) {
    const english = catalog[key];
    if (english === undefined) { unused.push(key); continue; }
    const allowed = new Set(typeof english === "string" ? names(english) : Object.values(english).flatMap((t) => [...names(t)]));
    const texts = [];
    if (typeof english === "string") {
      if (typeof value === "string") texts.push(value);
      else wrong.push(`${key} is words in English, not plural forms`);
    } else if (value === null || typeof value !== "object") {
      wrong.push(`${key} needs plural forms (${categories.join(", ")})`);
    } else {
      for (const form of categories) if (typeof value[form] !== "string") missing.push(`${key}:${form}`);
      for (const [form, text] of Object.entries(value)) {
        if (!categories.includes(form)) unused.push(`${key}:${form}`);
        else if (typeof text === "string") texts.push(text);
      }
    }
    for (const text of texts) for (const name of names(text)) if (!allowed.has(name)) wrong.push(`${key} has {${name}}, which the English does not`);
  }
  return { missing, unused, wrong };
}

async function main(args) {
  const allowMissing = args.includes("--allow-missing");
  const given = args.filter((a) => !a.startsWith("--"));
  const files = given.length > 0 ? given.map((f) => resolve(f)) : readdirSync(TEST_PACKS).filter((f) => f.endsWith(".js")).sort().map((f) => join(TEST_PACKS, f));
  if (files.length === 0) { console.log("No packs to check."); return 1; }
  const catalog = await englishCatalog();
  let failed = false;
  for (const file of files) {
    const pack = (await import(pathToFileURL(file).href)).default;
    const { missing, unused, wrong } = checkPack(pack, catalog);
    const name = relative(repo, file) || file;
    const bad = unused.length > 0 || wrong.length > 0 || (missing.length > 0 && !allowMissing);
    failed ||= bad;
    console.log(`${bad ? "FAIL" : "ok  "} ${name} (${pack?.locale}): ${Object.keys(catalog).length - missing.filter((k) => !k.includes(":")).length} of ${Object.keys(catalog).length} keys, ${missing.length} missing, ${unused.length} unused, ${wrong.length} wrong`);
    for (const key of missing) console.log(`  missing ${key}`);
    for (const key of unused) console.log(`  unused  ${key}`);
    for (const line of wrong) console.log(`  wrong   ${line}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
