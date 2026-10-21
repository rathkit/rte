// Scans the shipped zone for words that must never appear in it (the private project plan).
// The word list is NOT stored in the repo. It comes from the RTE_DENYLIST environment variable
// (comma or newline separated), set from CI secrets. Names that are allowed inside migration
// packages (packages/compat-*) come from RTE_DENYLIST_COMPAT_ALLOW in the same format.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const split = (value) =>
  (value ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

const denied = split(process.env.RTE_DENYLIST);
const compatAllowed = new Set(split(process.env.RTE_DENYLIST_COMPAT_ALLOW));

if (denied.length === 0) {
  if (process.env.CI) {
    console.error("denylist: RTE_DENYLIST is not set; refusing to pass in CI");
    process.exit(1);
  }
  console.warn("denylist: RTE_DENYLIST is not set, skipping (CI will fail without it)");
  process.exit(0);
}

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  const inCompat = file.startsWith("packages/compat-");
  const words = inCompat ? denied.filter((word) => !compatAllowed.has(word)) : denied;
  // Integrity hashes are random base64, so short words match them by chance.
  const lower = [file.toLowerCase(), ...text.toLowerCase().split("\n").map((line) => line.replace(/sha\d+-[a-z0-9+/=]+/g, ""))];
  lower.forEach((line, index) => {
    if (words.some((word) => line.includes(word))) hits.push(index === 0 ? `${file} (path)` : `${file}:${index}`);
  });
}

if (hits.length > 0) {
  console.error(`denylist: ${hits.length} hit(s). Words are not printed; see locations:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("denylist: ok");
