// Checks that a release tag, the packages and the changelog agree, before anything is built for release:
//   node tools/check-release.mjs v0.1.0-alpha.0
// Nx Release writes the versions, the changelog entry and the tag; this checks what it made (and the hand-made first release). A tag names one
// version for every package, there is a changelog section for it, and while the project is in alpha the tag must be an alpha
// (so every package goes to the `next` dist-tag and none can take `latest`). Also prints release notes with --notes.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** The changelog section for a version, without its heading, or undefined. */
export function changelogSection(text, version) {
  const heading = new RegExp(`^## \\[?${version.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}\\]?(?: |$).*$`, "m").exec(text);
  if (!heading) return undefined;
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** What is wrong with releasing `tag`, as a list of sentences (empty when it is fine). */
export function problemsWith(tag, { versions, changelog }) {
  const problems = [];
  const m = /^v(\d+\.\d+\.\d+)-(alpha|beta|rc)\.(\d+)$/.exec(tag);
  if (!m) {
    problems.push(`the tag "${tag}" is not an alpha, beta or rc version like v0.1.0-alpha.0: while the project is in alpha nothing is released to latest`);
    return problems;
  }
  const version = tag.slice(1);
  for (const [name, v] of Object.entries(versions)) if (v !== version) problems.push(`${name} is at ${v}, not ${version}`);
  if (!changelogSection(changelog, version)) problems.push(`CHANGELOG.md has no section for ${version}`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tag = process.argv[2];
  if (!tag) { console.error("usage: node tools/check-release.mjs <tag> [--notes]"); process.exit(2); }
  const versions = {};
  for (const dir of readdirSync(join(root, "packages"))) {
    const file = join(root, "packages", dir, "package.json");
    if (existsSync(file)) { const pkg = JSON.parse(readFileSync(file, "utf8")); versions[pkg.name] = pkg.version; }
  }
  const changelog = existsSync(join(root, "CHANGELOG.md")) ? readFileSync(join(root, "CHANGELOG.md"), "utf8") : "";
  const problems = problemsWith(tag, { versions, changelog });
  if (problems.length > 0) { console.error(`release: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`); process.exit(1); }
  if (process.argv.includes("--notes")) console.log(changelogSection(changelog, tag.slice(1)));
  else console.log(`release: ${tag} is consistent across ${Object.keys(versions).length} packages and the changelog`);
}
