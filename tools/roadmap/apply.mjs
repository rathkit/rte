// Creates the roadmap on GitHub from roadmap.json, in the same shape as the Rathkit Pack roadmap: milestones named by the version they
// are planned for, issues titled "[section.number] title", labels (roadmap, track:*, P0 to P2, spike, maintainer), and an organization
// project with Track, Priority, Size and Metric fields.
//   node tools/roadmap/apply.mjs            show what would be created (changes nothing)
//   node tools/roadmap/apply.mjs --apply    create it; safe to run again (existing labels, milestones and issues, found by title, are skipped)
//   node tools/roadmap/apply.mjs --doc      print the milestone sections for docs/ROADMAP.md (with issue links when `gh` can list the issues)
// Needs the GitHub CLI signed in with the repo and project scopes (and admin:org to create an organization project).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "rathkit/rte";
const OWNER = "rathkit";
const data = JSON.parse(readFileSync(join(import.meta.dirname, "roadmap.json"), "utf8"));
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleOf = (i) => `[${i.id}] ${i.title}`;

function bodyOf(i) {
  const [what, done = ""] = i.body.split(/\n\nDone when: /);
  return `**Roadmap item ${i.id}** · milestone \`${i.milestone}\` · track \`${i.track}\` · priority ${i.priority}\n\n${what}\n\n## Done when\n\n- [ ] ${done.trim() || "The change is merged with a test that fails before it and passes after."}\n\n## How it is verified\n\nA test, a browser check, a benchmark or a recorded manual result that fails before and passes after; the pull request links it.\n\nThe plan: [docs/ROADMAP.md](../blob/main/docs/ROADMAP.md). A pull request that finishes this says \`Closes #N\`.\n`;
}

if (process.argv.includes("--doc")) {
  let numbers = new Map();
  try { numbers = new Map(JSON.parse(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "1000", "--json", "title,number")).map((i) => [i.title, i.number])); } catch { /* no links without GitHub */ }
  for (const m of data.milestones) {
    console.log(`### ${m.title}\n\n${m.description}\n`);
    for (const i of data.issues.filter((x) => x.milestone === m.title)) {
      const n = numbers.get(titleOf(i));
      const id = n ? `[${i.id}](https://github.com/${REPO}/issues/${n})` : i.id;
      console.log(`- [ ] ${id} ${i.title}${i.flags.includes("maintainer") ? " *(maintainer)*" : ""}${i.flags.includes("spike") ? " *(spike)*" : ""} \`${i.priority}\``);
    }
    console.log("");
  }
  process.exit(0);
}

const apply = process.argv.includes("--apply");
const labels = new Map([
  ["roadmap", ["0e8a16", "Tracks an item in docs/ROADMAP.md"]],
  ["P0", ["d93f0b", "Blocks its milestone"]], ["P1", ["e99695", "Needed for its milestone"]], ["P2", ["f9d0c4", "Nice to have"]],
  ["maintainer", ["000000", "Needs an action only the maintainer can take"]], ["spike", ["bfdadc", "A question to answer, not a feature"]],
]);
const trackColor = { behavior: "1d76db", features: "5319e7", interface: "c2e0c6", perf: "b60205", docs: "0e8a16", platform: "c2e0c6", release: "fbca04" };
for (const [t, d] of Object.entries(data.tracks)) labels.set(`track:${t}`, [trackColor[t] ?? "ededed", d]);
const labelsOf = (i) => ["roadmap", `track:${i.track}`, i.priority, ...i.flags];

console.log(`${data.milestones.length} milestones, ${labels.size} labels, ${data.issues.length} issues, 1 project "${data.project}" (public, fields Track, Priority, Size, Metric)`);
if (!apply) {
  for (const m of data.milestones) console.log(`  ${m.title}: ${data.issues.filter((i) => i.milestone === m.title).length} issues`);
  console.log("Dry run. Nothing was created. Run with --apply to create it.");
  process.exit(0);
}

const haveLabels = new Set(JSON.parse(gh("label", "list", "-R", REPO, "--limit", "200", "--json", "name")).map((l) => l.name));
for (const [name, [color, description]] of labels) if (!haveLabels.has(name)) gh("label", "create", name, "-R", REPO, "--color", color, "--description", description);

const haveMilestones = new Set(JSON.parse(gh("api", `repos/${REPO}/milestones?state=all&per_page=100`)).map((m) => m.title));
for (const m of data.milestones) if (!haveMilestones.has(m.title)) gh("api", `repos/${REPO}/milestones`, "-f", `title=${m.title}`, "-f", `description=${m.description}`);

// The project: public, like the Pack one, with the same fields.
let project = JSON.parse(gh("project", "list", "--owner", OWNER, "--format", "json", "--limit", "100")).projects.find((p) => p.title === data.project);
if (!project) {
  project = JSON.parse(gh("project", "create", "--owner", OWNER, "--title", data.project, "--format", "json"));
  gh("project", "edit", String(project.number), "--owner", OWNER, "--description", data.description, "--visibility", "PUBLIC");
  gh("project", "link", String(project.number), "--owner", OWNER, "--repo", REPO);
}
const fieldsNow = () => JSON.parse(gh("project", "field-list", String(project.number), "--owner", OWNER, "--format", "json")).fields;
const have = new Set(fieldsNow().map((f) => f.name));
const tracks = Object.keys(data.tracks);
if (!have.has("Track")) gh("project", "field-create", String(project.number), "--owner", OWNER, "--name", "Track", "--data-type", "SINGLE_SELECT", "--single-select-options", tracks.join(","));
if (!have.has("Priority")) gh("project", "field-create", String(project.number), "--owner", OWNER, "--name", "Priority", "--data-type", "SINGLE_SELECT", "--single-select-options", "P0,P1,P2");
if (!have.has("Size")) gh("project", "field-create", String(project.number), "--owner", OWNER, "--name", "Size", "--data-type", "SINGLE_SELECT", "--single-select-options", "XS,S,M,L,XL");
if (!have.has("Metric")) gh("project", "field-create", String(project.number), "--owner", OWNER, "--name", "Metric", "--data-type", "TEXT");
const fields = Object.fromEntries(fieldsNow().map((f) => [f.name, f]));
const option = (field, name) => fields[field].options.find((o) => o.name === name).id;
const projectId = JSON.parse(gh("project", "view", String(project.number), "--owner", OWNER, "--format", "json")).id;

const haveIssues = new Map(JSON.parse(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "1000", "--json", "title,url")).map((i) => [i.title, i.url]));
const inProject = new Set(JSON.parse(gh("project", "item-list", String(project.number), "--owner", OWNER, "--format", "json", "--limit", "500")).items.map((i) => i.title));
let made = 0;
for (const i of data.issues) {
  let url = haveIssues.get(titleOf(i));
  if (!url) {
    url = gh("issue", "create", "-R", REPO, "--title", titleOf(i), "--body", bodyOf(i), "--milestone", i.milestone, ...labelsOf(i).flatMap((l) => ["--label", l]));
    made++;
    await sleep(1500); // GitHub slows down bursts of created content
  }
  if (inProject.has(titleOf(i))) continue;
  try {
    const item = JSON.parse(gh("project", "item-add", String(project.number), "--owner", OWNER, "--url", url, "--format", "json"));
    for (const [field, value] of [["Track", i.track], ["Priority", i.priority], ["Size", i.size]]) {
      gh("project", "item-edit", "--id", item.id, "--project-id", projectId, "--field-id", fields[field].id, "--single-select-option-id", option(field, value));
    }
  } catch (e) { console.error(`could not add ${url} to the project: ${String(e.stderr || e).trim()}`); }
}
console.log(`created ${made} issues; project number ${project.number}`);
