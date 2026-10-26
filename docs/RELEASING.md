# Releasing

How a release is made, what an alpha promises, and the steps only the owner can do. Nothing here publishes by itself: the release workflow builds, checks, lists and signs on every version tag, and publishes to npm only when the repository variable `NPM_PUBLISH` is `true`.

## Versions and tags

- All eleven packages are released together under one version, and a release is a git tag `v<version>`.
- The first release is `0.1.0-alpha.0`. Later alphas count up (`0.1.0-alpha.1`), then betas and release candidates if there are any, then `0.1.0`.
- **Every release while the project is in alpha goes to the `next` dist-tag. None goes to `latest`.** `publishConfig.tag` is `next` in every package, `tools/check-release.mjs` refuses any tag that is not an alpha, beta or rc, and `pnpm check:packages` fails on a package that is not an alpha version or does not name `next`. Installing `@rathkit/rte-core` with no tag therefore gets nothing until a stable release exists; to try the alpha, ask for it: `npm install @rathkit/rte-core@next`.
- Packages ask each other for the release they were built with or a later one below the next minor (`>=0.1.0-alpha.0 <0.2.0`): a prerelease range has to name its starting point, or npm will not match prereleases.

### Semantic versioning in 0.x

- Before 1.0, a **minor** version (0.1 to 0.2) may break anything. A **patch** version (0.1.0 to 0.1.1) does not break documented behavior. Each prerelease number (`alpha.1`) may break anything.
- Every breaking change, and every change in what is checked, is written in `CHANGELOG.md` under that release.
- At 1.0 the usual rules apply: breaking changes only in a major version, and the plugin API version (`PLUGIN_API_VERSION`) moves with them.

### What "alpha" promises

It promises that the packages install with nothing else (no runtime dependencies, nothing that runs on install, nothing stored, no requests), that what is checked in `docs/SUPPORT.md` is checked on every change, and that the release can be verified (`docs/VERIFY.md`). It does not promise stable APIs, stable HTML output for every edge case, support for any browser beyond those listed, or that anyone should build on it yet. The word "alpha" is in every package's README and version.

## Making a release

Versions, the changelog, the release commit and the tag are made by [Nx Release](https://nx.dev/features/manage-releases), configured under `release` in `nx.json`: all eleven packages in one fixed group, tags like `v0.1.0-alpha.1`, a version and a changelog worked out from the Conventional Commits since the last tag. Nx's own version code for npm packages comes from the `@nx/js` plugin, which brings a large dependency tree and does not work with the TypeScript 7 this repository uses, so `tools/release/version-actions.cjs` (about 60 lines, tested) does the same for plain npm packages: it writes `version`, and keeps the range each package asks of its siblings at "this release or later, below the next minor". Nx is a development tool and does not touch the shipped packages.

**Every release after the first:**

1. `pnpm release:dry` shows what would change: the new version in each package, the peer ranges, the changelog entry. Nothing is written.
2. `pnpm release` (that is, `nx release --skip-publish`) works out the version from the Conventional Commits since the last tag, bumps every package to it, adds the entry to `CHANGELOG.md`, and makes one commit (`chore(release): <version>`) and the tag `v<version>`. It never publishes (`--skip-publish`): publishing is the workflow's.
3. Read the entry and the diff; edit `CHANGELOG.md` and amend the release commit if the notes need words that commit subjects do not give.
4. `pnpm check:release v<version>` (tag, packages and changelog agree; refuses a tag that is not an alpha, beta or rc), then push the commit and the tag: `git push --follow-tags`.
5. The `release` workflow runs on the tag: the full set of checks (including the check of what would be published, with the oldest supported Node), then it packs the eleven tarballs, writes `SHA256SUMS` and a software bill of materials for each package (CycloneDX, zero runtime components, made by `tools/make-sbom.mjs`), signs `SHA256SUMS` with Sigstore (keyless), and creates a GitHub pre-release with all of it and the notes (the changelog entry for the version).
6. The `publish` job (only when `NPM_PUBLISH` is `true`) checks the downloaded files against `SHA256SUMS` and publishes exactly those tarballs with provenance, access public and the `next` tag, through npm trusted publishing: no npm token is stored anywhere, and the job asks for `id-token: write` only.

### How the version is chosen

From the commits since the last tag that touched files in any package, the highest of:

- **major**: a breaking change (`type!:` or a `BREAKING CHANGE:` footer). Nothing else is ever major, and in 0.x it is still a major (0.4.2 to 1.0.0), not shifted down.
- **minor**: a `feat` commit.
- **patch**: every other kind of commit (`fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`).

The commit's scope (`feat(tables):`) does not matter: a commit counts for the release whatever its scope. A commit that touches no package file (a change only to CI, the repository's documents or the tools) changes nothing that is published, so it does not bump the version by itself; it is still listed in the changelog. A commit message that is not a Conventional Commit counts for nothing.

**While the current version is a prerelease** (`0.1.0-alpha.1`), Nx always makes the next one the next prerelease (`0.1.0-alpha.2`) whatever the commits say: leaving a prerelease is a decision, not a calculation. To start a new prerelease line from a stable version, add `--preid` (`nx release --preid alpha --skip-publish` turns a feature after `0.1.0` into `0.2.0-alpha.0`); to leave one, give the version: `nx release 0.1.0 --skip-publish`. The rules above then apply from the new stable version. (`tools/check-release.mjs` and the release workflow refuse a stable tag while the project is in alpha; lifting that is a deliberate change to that file, made when the first stable release is decided.)

Signed commits and tags: Nx runs plain `git commit` and `git tag`, so signing follows your git configuration (`commit.gpgSign` and `tag.gpgSign` set to true).

**The very first release (`0.1.0-alpha.0`)** has no earlier tag and a written changelog entry, so Nx is not used for it: the versions are already `0.1.0-alpha.0`, `CHANGELOG.md` already has the entry. Run `pnpm check:release v0.1.0-alpha.0`, then `git tag -s v0.1.0-alpha.0` and push the tag. Nx Release takes over from that tag: the next release is `0.1.0-alpha.1`.

The changelog lists every commit since the last tag, grouped by type: features, fixes, speed, internal changes, documentation, tests, build, continuous integration, chores, style and reverts. No type is hidden. A breaking change (`!` or a `BREAKING CHANGE:` footer) also gets its own heading.

A dry run needs no tag: run the `release` workflow by hand with a tag name as input. It builds and checks everything and uploads the files as a workflow artifact, and creates and publishes nothing.

## Actions policy

The repository allows only GitHub's own actions, verified creators, and one more: `pnpm/setup` at one named commit, which sets up pnpm (the version in `packageManager`), the Node in `.node-version`, the pnpm cache and the install from the lockfile in one step. Workflows use those and nothing else, and install `cosign` from its GitHub release at a pinned version and checksum. `tools/check-workflows.test.mjs` fails on any other action, or on `pnpm/setup` at another commit. To move to a newer `pnpm/setup`, change the commit in the workflows and in the allowed-actions setting together. Only the oldest-Node import check (Node 22.14.0, set up with `actions/setup-node`) and the npm publishing job (Node only) set Node up separately.

## The first release is partly manual (owner)

A trusted publisher is configured on a package that already exists on npm, and npm has no way to set one up before a package's first publish (checked against the npm documentation and several guides on 2026-10-24; **verify again before the first release**, since this is the kind of thing npm may add). So, once:

1. Make the repository public (see below) and create the `@rathkit` organization on npm with required two-factor authentication.
2. Run the `release` workflow for the tag. Download the files from the GitHub pre-release and check them as `docs/VERIFY.md` describes.
3. Publish the eleven tarballs by hand from the owner's machine, with two-factor authentication: `npm publish <file>.tgz --access public --tag next`. These first versions have no provenance, because provenance needs the workflow to publish; say so in the release notes.
4. For each package on npmjs.com (Settings, Trusted Publisher): organization `rathkit`, repository `rte`, workflow `release.yml`, environment `npm`. Create the `npm` environment in the repository settings (add yourself as a required reviewer).
5. Set the repository variable `NPM_PUBLISH` to `true`. From the next release (`0.1.0-alpha.1`) the workflow publishes, with provenance.

Requirements of trusted publishing, from npm's documentation: npm CLI 11.5.1 or later and Node 22.14.0 or later in the publish job (the workflow uses Node 26, which brings npm 12), `id-token: write`, and a publisher entry per package.

## Before the repositories are made public (owner, with this repository's tools)

1. Run the word check over the whole history, not only the files: `RTE_DENYLIST=... node tools/check-denylist.mjs --history` (and read the files once more for references to other products).
2. Run `node tools/scan-secrets.mjs --history`: it looks through every commit for private keys and the common token formats. Confirm by hand that nothing it reports is real, and rotate anything that is.
3. Confirm `fixtures/` holds only scrubbed captures (`pnpm check:fixtures`).
4. Then flip the repository to public, turn on private vulnerability reporting, secret scanning and push protection, and branch protection or a ruleset on `main` (the settings in `publish-readiness.md`, items 8 and 9).

## Decisions that are not made here

The copyright holder named in a `NOTICE`, the contribution terms (a DCO or a CLA), the timing of the company, how `rathkit-pack` is distributed, and the announcement are the owner's (`publish-readiness.md`, items 7 and 16 to 19).
