// Turns raw paste captures into committable fixtures.
//   node tools/paste-capture/scrub.mjs <captures-dir>... [--out fixtures/paste] [--keep text/rtf]
// Keeps only the clipboard formats a test needs (HTML and plain text by default), drops machine
// details from the metadata, and rewrites anything that identifies a person, a machine or a document.
// Every rewrite is deterministic, and scrubbing twice gives the same result as scrubbing once.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const FAKE_GUID = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Hands out sequential stand-ins, so equal inputs stay equal and different inputs stay different. */
const numbering = (make) => {
  const seen = new Map();
  return (value) => {
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, make(seen.size + 1));
    return seen.get(key);
  };
};

export function scrubText(text) {
  const guid = numbering(FAKE_GUID);
  const paragraph = numbering((n) => n.toString(16).padStart(8, "0"));
  const tempName = numbering((n) => `lu${n.toString().padStart(6, "0")}`);
  return (
    text
      // Account names inside file paths, with either kind of slash.
      .replace(/(\/Users\/|\\Users\\)[^\\/"'<>\s)]+/gi, "$1user")
      .replace(GUID, (match) => guid(match))
      // Identifiers the Office web apps add to copied markup. Only the version is kept.
      .replace(/(ccp_infra_(?!version)\w+=")[^"]*(")/g, "$10$2")
      .replace(/\b(para(?:e)?id=")([^"]*)(")/g, (_, open, value, close) => `${open}${paragraph(value)}${close}`)
      // Embedded image bytes. The type stays so the markup still looks like the original.
      .replace(/(data:[a-z0-9/+.-]+;base64,)[A-Za-z0-9+/=\s]+/gi, "$1AAAA")
      // Random temporary names that LibreOffice writes into file URLs.
      .replace(/\blu(?=[a-z]*\d)[0-9a-z]{6,}/gi, (match) => (/^lu\d{6}$/.test(match) ? match : tempName(match)))
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (match) => (match.endsWith("@example.com") ? match : "user@example.com"))
  );
}

const slug = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "x";

/** Returns the fixture for one raw capture, or null when it has no metadata to name it by. */
export function scrubCapture(capture, keep = ["text/html", "text/plain"]) {
  const meta = capture?.meta;
  if (!meta?.app || !meta.sample) return null;
  const payloads = {};
  for (const type of keep) {
    if (typeof capture.payloads?.[type] === "string") payloads[type] = scrubText(capture.payloads[type]);
  }
  return {
    version: 1,
    source: { app: meta.app, sample: meta.sample, browser: meta.browser ?? "", os: meta.os ?? "" },
    types: Array.isArray(capture.types) ? [...capture.types] : [],
    payloads,
  };
}

export const fixtureName = (fixture) =>
  `${[fixture.source.app, fixture.source.browser, fixture.source.os, fixture.source.sample].map(slug).join("_")}.json`;

function main(argv) {
  const dirs = [];
  let out = "fixtures/paste";
  const keep = ["text/html", "text/plain"];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i] ?? out;
    else if (argv[i] === "--keep") keep.push(argv[++i] ?? "");
    else dirs.push(argv[i]);
  }
  if (dirs.length === 0) {
    console.error("usage: scrub.mjs <captures-dir>... [--out fixtures/paste] [--keep text/rtf]");
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const written = new Map();
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
      const fixture = scrubCapture(JSON.parse(readFileSync(join(dir, file), "utf8")), keep);
      if (!fixture) {
        console.warn(`skipped ${file}: no source app or sample name`);
        continue;
      }
      const name = fixtureName(fixture);
      if (written.has(name)) {
        console.error(`${file} and ${written.get(name)} both map to ${name}; move the mistake out of the captures folder`);
        process.exit(1);
      }
      written.set(name, `${basename(resolve(dir))}/${file}`);
      writeFileSync(join(out, name), `${JSON.stringify(fixture, null, 2)}\n`);
    }
  }
  console.log(`scrub: wrote ${written.size} fixture(s) to ${out}`);
}

if (import.meta.main) main(process.argv.slice(2));
