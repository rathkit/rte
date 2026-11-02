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

`CHANGELOG.md` has no title: Nx Release always writes the newest section at the very top of the file, so a title there would end up in the middle. It is written newest first, and every release says which dist-tag it went to.

Versions, the changelog, the release commit and the tag are made by [Nx Release](https://nx.dev/features/manage-releases), configured under `release` in `nx.json`: all eleven packages in one fixed group, tags like `v0.1.0-alpha.1`, a version and a changelog worked out from the Conventional Commits since the last tag. Nx's own version code for npm packages comes from the `@nx/js` plugin, which brings a large dependency tree and does not work with the TypeScript 7 this repository uses, so `tools/release/version-actions.cjs` (about 60 lines, tested) does the same for plain npm packages: it writes `version`, and keeps the range each package asks of its siblings at "this release or later, below the next minor". Nx is a development tool and does not touch the shipped packages.

**Every release after the first:**

1. `pnpm release:dry` shows what would change: the new version in each package, the peer ranges, the changelog entry. Nothing is written.
2. `pnpm release` (that is, `nx release --skip-publish`) works out the version from the Conventional Commits since the last tag, bumps every package to it, adds the entry to `CHANGELOG.md`, and makes one commit (`chore(release): <version>`) and the tag `v<version>`. It never publishes (`--skip-publish`): publishing is the workflow's.
3. Read the entry and the diff; edit `CHANGELOG.md` and amend the release commit if the notes need words that commit subjects do not give.
4. `pnpm check:release v<version>` (tag, packages and changelog agree; refuses a tag that is not an alpha, beta or rc), then push the commit and the tag: `git push --follow-tags`.
5. The `release` workflow runs on the tag: the full set of checks (including the check of what would be published, with the oldest supported Node), then it packs the eleven tarballs, writes `SHA256SUMS` and a software bill of materials for each package (CycloneDX, zero runtime components, made by `tools/make-sbom.mjs`), signs `SHA256SUMS` with Sigstore (keyless), and creates a GitHub pre-release with all of it and the notes (the changelog entry for the version).
6. The `publish` job (only when `NPM_PUBLISH` is `true`) checks the downloaded files against `SHA256SUMS` and stages exactly those tarballs with provenance, access public and the `next` tag (`npm stage publish`), through npm trusted publishing: no npm token is stored anywhere, and the job asks for `id-token: write` only. It cannot make a version live: the trusted publisher on each package does not allow a direct `npm publish`.
7. The owner approves the staged versions (below). Only then are they on npm.

### Approving a release

Each package version waits in npm's staging area until it is approved with two-factor authentication. Before approving, compare what is staged with the signed release:

```sh
npm stage list                    # the staged versions and their ids
npm stage download <stage-id>     # the exact tarball, to check against SHA256SUMS
npm stage approve <stage-id>      # publishes it (asks for the two-factor code)
npm stage reject <stage-id>       # removes it
```

Approve all eleven, then check the tags (`npm view @rathkit/rte-core dist-tags`: `next` is the new version and `latest` has not moved) and install the packages in an empty project.

### How the version is chosen

From the commits since the last tag that touched files in any package, the highest of:

- **major**: a breaking change (`type!:` or a `BREAKING CHANGE:` footer). Nothing else is ever major, and in 0.x it is still a major (0.4.2 to 1.0.0), not shifted down.
- **minor**: a `feat` commit.
- **patch**: every other kind of commit (`fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`).

The commit's scope (`feat(tables):`) does not matter: a commit counts for the release whatever its scope. A commit that touches no package file (a change only to CI, the repository's documents or the tools) changes nothing that is published, so it does not bump the version by itself; it is still listed in the changelog. A commit message that is not a Conventional Commit counts for nothing.

**While the current version is a prerelease** (`0.1.0-alpha.1`), Nx always makes the next one the next prerelease (`0.1.0-alpha.2`) whatever the commits say: leaving a prerelease is a decision, not a calculation. To start a new prerelease line from a stable version, add `--preid` (`nx release --preid alpha --skip-publish` turns a feature after `0.1.0` into `0.2.0-alpha.0`); to leave one, give the version: `nx release 0.1.0 --skip-publish`. The rules above then apply from the new stable version. (`tools/check-release.mjs` and the release workflow refuse a stable tag while the project is in alpha; lifting that is a deliberate change to that file, made when the first stable release is decided.)

Signed commits and tags: Nx runs `git commit` and `git tag --annotate`, and a tag made that way was not signed even with `tag.gpgSign` set, so `nx.json` asks for it outright (`tagArgs: ["--sign"]`). The release commit also gets the DCO sign-off (`commitArgs`). `pnpm check:release` fails on a tag without a signature; also run `git tag -v v<version>` before pushing, because a released tag is immutable and cannot be replaced.

**The very first release (`0.1.0-alpha.0`, done)** had no earlier tag and a written changelog entry, so Nx was not used for it: the versions were already `0.1.0-alpha.0`, `CHANGELOG.md` already had the entry; the tag was made with `git tag -s v0.1.0-alpha.0`. Nx Release takes over from that tag.

The changelog lists every commit since the last tag, grouped by type: features, fixes, speed, internal changes, documentation, tests, build, continuous integration, chores, style and reverts. No type is hidden. A breaking change (`!` or a `BREAKING CHANGE:` footer) also gets its own heading.

A dry run needs no tag: run the `release` workflow by hand with a tag name as input. It builds and checks everything and uploads the files as a workflow artifact, and creates and publishes nothing.

## Actions policy

The repository allows only GitHub's own actions, verified creators, and one more: `pnpm/setup` at one named commit, which sets up pnpm (the version in `packageManager`), the Node in `.node-version`, the pnpm cache and the install from the lockfile in one step. Workflows use those and nothing else, and install `cosign` from its GitHub release at a pinned version and checksum. `tools/check-workflows.test.mjs` fails on any other action, or on `pnpm/setup` at another commit. To move to a newer `pnpm/setup`, change the commit in the workflows and in the allowed-actions setting together. Only the oldest-Node import check (Node 22.14.0, set up with `actions/setup-node`) and the npm publishing job (Node only) set Node up separately.

## How the first release was made

A trusted publisher is configured on a package that already exists on npm, and npm has no way to set one up before a package's first publish, so the first release was partly manual. This is what was done, once:

1. The repositories were made public (recreated on 2026-10-30) and the `@rathkit` organization on npm was set up with required two-factor authentication.
2. The `release` workflow ran for the tag `v0.1.0-alpha.0`; the files were taken from the GitHub pre-release and checked as `docs/VERIFY.md` describes.
3. The eleven tarballs were published by hand from the owner's machine, with two-factor authentication: `npm publish <file>.tgz --access public --tag next`. These first versions have no provenance, because provenance needs the workflow to publish; the release notes say so.
4. On npmjs.com each package got a trusted publisher (Settings, Trusted Publisher): organization `rathkit`, repository `rte`, workflow `release.yml`, environment `npm`, with "Allow npm publish" and "Allow npm dist-tag" both left unchecked so that CI can only stage. The `npm` environment in the repository settings has the owner as a required reviewer, so a run waits for approval before it can stage.
5. The repository variable `NPM_PUBLISH` was set to `true`.

From then on the workflow stages the packages with provenance and the owner approves them (above). `0.1.0-alpha.3` was the first version published that way. The requirements of trusted publishing, from npm's documentation: npm CLI 11.5.1 or later and Node 22.14.0 or later in the publish job (the workflow uses Node 26, which brings npm 12), `id-token: write`, and a publisher entry per package. npm assigns `latest` to a package's first published version whatever tag is given, and `latest` cannot be removed, only moved: the packages therefore have `latest` on npm's `0.0.0-stage` placeholder, and an alpha is installed with `@next`.

A package added later has the same one-time steps: its first version is published by hand, then its trusted publisher is set.

## When a release goes wrong

A released tag is immutable: a tag, and the version it names, can never be reused. A release that fails after the tag is pushed therefore cannot be fixed in place; the fix is a new version number, and the failed one stays in the history. That is what happened to two versions, and the changelog says so under each:

- **`0.1.0-alpha.1`**: its tag was created without a signature, so the publish job was cancelled before anything was staged. A GitHub pre-release only.
- **`0.1.0-alpha.2`**: the publish step failed on a file path before anything was staged. A GitHub pre-release only.

`npm view @rathkit/rte-core versions` therefore lists only `0.0.0-stage` (npm's placeholder), `0.1.0-alpha.0` (by hand, no provenance) and `0.1.0-alpha.3` (the first the workflow published). Use `0.1.0-alpha.3` or later.

If one leg of a run fails for a reason that has nothing to do with the code (a flaky test on one platform, a runner that did not start), run only that leg again on the same tag, with no new version: `gh run rerun <run-id> --failed`. If the failure needs a change to the repository, make the change and release a new version.

## Before a repository is made public

All of this was done before the flip (2026-10-30) and is the list to repeat for any repository that is added later:

1. The word check over the whole history, not only the files: `RATHKIT_DENYLIST=... node tools/check-denylist.mjs --history` (and read the files once more for references to other products). The `history-scan` workflow runs it.
2. `node tools/scan-secrets.mjs --history`: it looks through every commit for private keys and the common token formats. Confirm by hand that nothing it reports is real, and rotate anything that is.
3. Confirm `fixtures/` holds only scrubbed captures (`pnpm check:fixtures`).
4. Then flip the repository to public, turn on private vulnerability reporting, secret scanning and push protection, and a ruleset on `main` (the settings in `PUBLISH-READINESS.md`, items 8 and 9). The ruleset names the required checks by job name (`browsers`, `check`, `dco`, `title`): if a job in `ci.yml` is renamed or split, change the ruleset in the same change, or the old name never reports and every pull request is blocked.

## Decisions that are not made here

Decided: how `rathkit-pack` is distributed (an npm launcher with platform packages, crates.io, and GitHub releases), the timing of the company (Rathkit LLC exists), and the contribution terms (a DCO sign-off on every commit). Still open, and the owner's: the copyright holder named in `NOTICE`, which stays "Steven Rathbauer" until the assignment of the project's intellectual property to Rathkit LLC is signed, and the announcement (`PUBLISH-READINESS.md`, items 16 and 19).
