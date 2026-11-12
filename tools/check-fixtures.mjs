// Fails if a committed paste fixture still carries something that identifies a person, a machine or a
// source document. Independent of scrub.mjs on purpose: it checks the result, not the method.
//   node tools/check-fixtures.mjs [dir]   (default fixtures/paste)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_FILE_BYTES = 400_000;
const META_KEYS = ["app", "browser", "os", "sample"];
const FAKE_GUID = /^00000000-0000-4000-8000-[0-9a-f]{12}$/;
const PROVENANCE_KINDS = ["capture", "reconstructed"];

/** Returns a list of problems found in one parsed fixture. Never includes the offending text itself. */
export function problemsIn(fixture) {
  const problems = [];
  const keys = Object.keys(fixture.source ?? {}).sort();
  if (keys.join() !== META_KEYS.join()) problems.push(`source has keys [${keys}], expected [${META_KEYS}]`);
  // A fixture that is not a scrubbed capture says so: `provenance.kind` is "reconstructed", with a note on what it approximates.
  if ("provenance" in fixture) {
    const { kind, note } = fixture.provenance ?? {};
    if (!PROVENANCE_KINDS.includes(kind)) problems.push(`provenance.kind is not one of [${PROVENANCE_KINDS}]`);
    if (typeof note !== "string" || note.trim() === "") problems.push("provenance has no note");
  }
  // What free paste must keep (`includes`) and must not (`excludes`), checked by the paste tests and the browser checks.
  if ("expect" in fixture) {
    const lists = [fixture.expect?.includes, fixture.expect?.excludes];
    if (!lists.every((list) => Array.isArray(list) && list.every((item) => typeof item === "string" && item !== ""))) {
      problems.push("expect needs includes and excludes, lists of non-empty strings");
    }
  }
  for (const [type, text] of Object.entries(fixture.payloads ?? {})) {
    if (typeof text !== "string") continue;
    const where = `payload ${type}`;
    const accounts = text.matchAll(/(?:\/Users\/|\\Users\\)([^\\/"'<>\s)]+)/gi);
    if ([...accounts].some((match) => match[1] !== "user")) problems.push(`${where}: account name in a file path`);
    if (/ccp_infra_(?!version)\w+="(?!0")/.test(text)) problems.push(`${where}: unscrubbed ccp_infra attribute`);
    if ((text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []).some((id) => !FAKE_GUID.test(id))) {
      problems.push(`${where}: real-looking GUID`);
    }
    if ([...text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].some((match) => !match[0].endsWith("@example.com"))) {
      problems.push(`${where}: email address`);
    }
    if (/Mozilla\/\d/.test(text)) problems.push(`${where}: user agent string`);
    if ([...text.matchAll(/data:[a-z0-9/+.-]+;base64,([A-Za-z0-9+/=\s]+)/gi)].some((match) => match[1].length > 8)) {
      problems.push(`${where}: embedded image data`);
    }
  }
  return problems;
}

function main(dir) {
  if (!existsSync(dir)) {
    console.log(`fixtures: no ${dir}, nothing to check`);
    return;
  }
  let failures = 0;
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  for (const name of files) {
    const path = join(dir, name);
    // Read once and judge what was read, so the size checked is the size parsed.
    const bytes = readFileSync(path);
    const found = bytes.length > MAX_FILE_BYTES ? [`larger than ${MAX_FILE_BYTES} bytes`] : [];
    try {
      found.push(...problemsIn(JSON.parse(bytes.toString("utf8"))));
    } catch {
      found.push("not valid JSON");
    }
    for (const problem of found) console.error(`fixtures: ${path}: ${problem}`);
    failures += found.length;
  }
  if (failures > 0) process.exit(1);
  console.log(`fixtures: ok (${files.length} file(s))`);
}

if (import.meta.main) main(process.argv[2] ?? "fixtures/paste");
