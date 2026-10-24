// How Nx Release versions these packages. Nx's own version actions for npm packages come from the @nx/js plugin, which pulls in a large
// dependency tree and does not work with the TypeScript 7 this repository uses (the project graph fails). The packages here are plain
// npm packages, so this is all that is needed: read and write `version` in package.json, and keep the range each package asks of its
// siblings (a peer dependency) at "this release or a later one, below the next minor", which is also what `pnpm check:packages` checks.
// Development dependencies on siblings use `workspace:*` and are left alone.
const { VersionActions } = require("nx/release");
const path = require("node:path");

/** The next version that may break things: the next minor while in 0.x, the next major after. */
const nextBoundary = (version) => {
  const [major, minor] = version.split("-")[0].split(".").map(Number);
  return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
};

class NpmPackageVersionActions extends VersionActions {
  validManifestFilenames = ["package.json"];

  get manifest() {
    return path.join(this.projectGraphNode.data.root, "package.json");
  }
  read(tree) {
    return JSON.parse(tree.read(this.manifest, "utf8"));
  }
  write(tree, json) {
    tree.write(this.manifest, `${JSON.stringify(json, null, 2)}\n`);
  }

  async readCurrentVersionFromSourceManifest(tree) {
    return { currentVersion: this.read(tree).version, manifestPath: this.manifest };
  }
  // Packages are versioned from the files in the repository (and the tags), never from a registry.
  async readCurrentVersionFromRegistry() {
    return null;
  }
  async readCurrentVersionOfDependency(tree, graph, dependencyProjectName) {
    const json = this.read(tree);
    const name = graph.nodes[dependencyProjectName]?.name ?? dependencyProjectName;
    for (const collection of ["peerDependencies", "dependencies", "optionalDependencies", "devDependencies"]) {
      if (json[collection]?.[name]) return { currentVersion: json[collection][name], dependencyCollection: collection };
    }
    return { currentVersion: null, dependencyCollection: null };
  }
  async updateProjectVersion(tree, newVersion) {
    const json = this.read(tree);
    json.version = newVersion;
    this.write(tree, json);
    return [`Set version ${newVersion} in ${this.manifest}`];
  }
  async updateProjectDependencies(tree, graph, dependenciesToUpdate) {
    const json = this.read(tree);
    const logs = [];
    for (const [project, version] of Object.entries(dependenciesToUpdate)) {
      const name = graph.nodes[project]?.name ?? project;
      if (!json.peerDependencies?.[name]) continue;
      json.peerDependencies[name] = `>=${version} <${nextBoundary(version)}`;
      logs.push(`peer ${name} -> ${json.peerDependencies[name]}`);
    }
    this.write(tree, json);
    return logs;
  }
}

module.exports = NpmPackageVersionActions;
module.exports.default = NpmPackageVersionActions;
