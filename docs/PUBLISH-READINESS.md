# Publish readiness: RTE and Pack

From the branding and site session to the build session. Written 2026-10-23.
Nothing here names other products, so it is safe to move into a repo. Each item says who
owns it: **build** (you), **site** (the site session) or **owner** (the user).

Every claim the public site already makes is a release gate. If an item cannot be made true,
the site is edited before launch, not after.

## A. Blockers

1. **Repos public first (owner, build).** npm provenance needs a public source repository, so
   flipping `rte` and `pack` to public comes before the first publish. Before flipping: run the
   denylist scan on the full history, re-read every file for references to other products, and
   confirm no secret is in any commit.
2. **Package metadata (build).** All 10 packages are `"private": true` with no `repository`,
   `bugs` or `engines` fields. Per package: remove `private`,
   add `repository` (with `directory`), `bugs`, `homepage` (https://rathkit.com), `keywords`,
   `engines`, `publishConfig` (`access: public`, `provenance: true`), a README and a LICENSE
   inside the package. Check `exports`, `types` and `sideEffects`.
3. **Release workflow (build).** Publish from GitHub Actions with npm trusted publishing (OIDC),
   `id-token: write`, provenance, no stored npm token. Pin every action by SHA, as `ci.yml` does.
   VERIFY: whether a trusted publisher can be configured before a package's first publish. If not,
   the first release of each package is a manual step to plan.
4. **Release artifacts (build).** Per release on GitHub Releases: tarballs, `SHA256SUMS`, an SBOM
   listing zero runtime components, and Sigstore keyless signatures (as `DISTRIBUTION.md` says). The
   SBOM generator must be in-house or a pinned build-time tool outside the shipped packages.
5. **The Security page's promises (build, site).** Each needs a CI check or recorded evidence:
   empty `npm ls --omit=dev`; no install scripts (`preinstall`, `install`, `postinstall`, `prepare`);
   no `localStorage`, cookies or IndexedDB and no network requests by default (a browser test that
   fails on any); SBOM with zero runtime components; provenance and checksums on every release.
   `check:zero-deps` covers part of this today.
6. **Version and tag plan (build).** First release `0.1.0-alpha.0` on a `next` or `alpha`
   dist-tag, never `latest`. Document the semver policy for 0.x. Decide what "alpha" promises.
7. **Pack (build, owner).** Decide how Pack is distributed (GitHub Releases binaries, an npm wrapper,
   `cargo install`, or more than one). For binaries: checksums and signatures, and whether to sign
   or notarize for macOS and Windows. Before the "works with Rollup, Vite, webpack and Parcel
   plugins" claim is public, back it with your own tests and say exactly what is covered.

## B. Before or at launch

8. **GitHub (owner).** After repos are public: enable private vulnerability reporting (the toggle
   was not visible while private; `SECURITY.md` in `rathkit/.github` is the fallback), branch
   protection or rulesets on `main`, secret scanning and push protection, org-wide required 2FA,
   issue and PR templates, CODEOWNERS.
9. **npm (owner).** Org requires 2FA. No long-lived tokens. Packages public under `@rathkit`.
   `@rathkit-pro` stays reserved; no premium package ships in the first alpha.
10. **Repo hygiene (build).** Delete the untracked `*:Zone.Identifier` files in `docs/` and add the
    pattern to `.gitignore`. Check `fixtures/` contains only scrubbed captures (the scrub test).
11. **Browser and accessibility statement (build).** State exactly which browsers and versions are
    tested (Chromium, Firefox, WebKit) and which accessibility checks run. Claim no more.
12. **Numbers (build).** Size and speed figures only if measured, with the method published. No
    comparisons with other products.
13. **Per-package README (build).** What it is, its peer dependencies, a minimal example, and the
    word "alpha". The site links to these.
14. **Changelog and release notes (build).** One file per repo, and release notes on each GitHub Release.
15. **Consumer verification (site, build).** A docs page showing how to check a release:
    `npm audit signatures`, comparing `SHA256SUMS`, and reading the SBOM.

## C. Owner decisions

16. **Copyright holder.** The LICENSE files are the standard Apache text with no named owner. Name the
    holder in a `NOTICE` or the READMEs (the LLC once formed, or the owner personally until the assignment).
17. **Contribution terms.** DCO sign-off or a CLA, decided before the first outside pull request. A CLA
    keeps relicensing options; a DCO is lighter.
18. **LLC timing.** Not needed to publish free packages. Needed before taking money.
19. **What counts as ready.** Minimum docs and demo, and the announcement plan (X, Bluesky, Discord).

## D. Site side (the site session)

- Real package table: done in the docs overview (10 packages, none published).
- Quick start: drafted, hidden (`draft: true`) until the first alpha can be checked against it.
- Still to do from the released packages: per-framework guides, API reference, paste guide, an Angular
  note, Pack docs, a changelog page, a status or roadmap page, a licensing explainer, the live demo on
  the home page, the install snippet, updated status wording, and the consumer-verification page.
- Stays off until a paid package exists: the pricing page and its nav link.
- At launch the site session re-reads the Security page against the evidence for item 5.
