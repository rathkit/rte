# Publish readiness: where each item stands

Against `PUBLISH-READINESS.md`, as of 2026-10-24. "Done" means it is in the repository and checked by a test or a CI step named here; nothing has been published. Items for the owner and the site session are listed as waiting.

## A. Blockers

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Repos public first | **Tools ready; the flip is the owner's.** Word check and secret scan over the whole history | `node tools/scan-secrets.mjs --history` found nothing in any commit; `history-scan` workflow runs the word check (needs the secret list) and the secret scan; steps in `RELEASING.md` |
| 2 | Package metadata | Done | Every package: not private, `repository` with `directory`, `bugs`, `homepage`, `keywords`, `engines` (Node 22.14.0 or later, tested), `publishConfig` (public, provenance, tag `next`), README, LICENSE, version `0.1.0-alpha.0`, optional peers with ranges that match prereleases. `pnpm check:packages` fails on any of it |
| 3 | Release workflow | Done, switched off | `.github/workflows/release.yml`: OIDC trusted publishing, `id-token: write` only in the jobs that need it, provenance, no token, every action pinned by SHA and only GitHub's own actions plus `pnpm/setup` at the one commit the repository allows (`tools/check-workflows.test.mjs`); cosign is installed from its release at a pinned version and checksum. Publishing needs the repository variable `NPM_PUBLISH=true`. **VERIFY answered:** a trusted publisher cannot be configured before a package's first publish, so the first release of each package is a manual step, planned in `RELEASING.md` |
| 4 | Release artifacts | Done in the workflow, not yet run on a tag | Tarballs, `SHA256SUMS`, CycloneDX bill of materials per package from `tools/make-sbom.mjs` (in-house, zero runtime components, tested), Sigstore keyless signature on `SHA256SUMS`. A dry run (started by hand on 2026-10-24, run 40068963341) built and checked everything, produced the eleven tarballs, `SHA256SUMS` (all verify) and ten bills with zero components, and skipped the release and publish jobs as designed. The signing step has not run yet: it runs on the first tag |
| 5 | The Security page's promises | Done, each with a check | Empty `npm ls --omit=dev` and no install scripts: `pnpm check:packages`. No storage, cookies, database or network by default: browser checks "privacy" (three engines, four pages, with a second check that the watch sees such use). Zero-component bills: `tools/make-sbom.test.mjs`. Provenance and checksums on every release: the workflow (first time on the first tagged release) |
| 6 | Version and tag plan | Done | Versions, changelog, release commit and tag are made by Nx Release (`nx.json`, `tools/release/version-actions.cjs`). `RELEASING.md`: `0.1.0-alpha.0` to `next`, never `latest` (`tools/check-release.mjs` refuses a non-alpha tag), the 0.x semver rules, what alpha promises and does not |
| 7 | Pack | **Owner** | Distribution channel and signing are decided in the pack repository. The rte repository makes no claim about bundler plugins |

## B. Before or at launch

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 8 | GitHub settings | **Owner** | After the repository is public (`RELEASING.md`) |
| 9 | npm settings | **Owner** | No premium package is in the first alpha; the release workflow stores no token |
| 10 | Repo hygiene | Done | No `Zone.Identifier` files exist in the repository and the pattern is in `.gitignore`; `pnpm check:fixtures` (scrubbed captures only) runs in CI |
| 11 | Browser and accessibility statement | Done | `SUPPORT.md`: exact versions, what runs, what is not tested |
| 12 | Numbers | Done | `MEASUREMENTS.md`: sizes, speed and memory, each with its method, one run, no comparisons |
| 13 | Per-package README | Done | Each package's README: what it is, install, peers, a minimal example, "alpha" (`pnpm check:packages` fails without "alpha") |
| 14 | Changelog and release notes | Done | `CHANGELOG.md`; the workflow cuts the release notes from its section for the version |
| 15 | Consumer verification | Done here, page is the site's | `VERIFY.md` has the content: `npm audit signatures`, `SHA256SUMS`, `cosign verify-blob`, the bill of materials |

## C. Owner decisions (not made here)

Copyright holder (`NOTICE`), contribution terms (DCO or CLA), the timing of the company, and what counts as ready and the announcement. The LICENSE files are the standard Apache text with no named holder, as before.
