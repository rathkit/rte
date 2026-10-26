# Verifying a release

Every release lists what it is made of and can be checked three ways, with tools that are not ours. None of this needs the repository.

## The packages on npm: provenance

Packages published from the release workflow carry a signed statement of where and how they were built (npm provenance, made with Sigstore). To check the packages in a project:

```sh
npm audit signatures
```

It verifies the registry signatures and the provenance of everything in `node_modules`, and says which packages have none. (The first versions of each package are published by hand and have no provenance, and the release notes say so.)

## The release files: checksums and signature

Each GitHub release has the eleven tarballs, `SHA256SUMS`, `SHA256SUMS.sigstore.json` and a bill of materials for each package. Download them into one folder.

Check the files against the list:

```sh
sha256sum --check --strict SHA256SUMS
```

Check that the list was signed by this project's release workflow, using [cosign](https://github.com/sigstore/cosign) (keyless: the signature is tied to the workflow's identity, not to a key we keep):

```sh
cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp '^https://github.com/rathkit/rte/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  SHA256SUMS
```

A passing check means the list came from the `release` workflow of `rathkit/rte` on a version tag. Comparing a tarball you installed with the one in the release: `npm pack @rathkit/rte-core@next` and then `sha256sum rathkit-rte-core-*.tgz`.

## What is inside: the bill of materials

Each `*.cdx.json` is a CycloneDX 1.5 document. Every package ships with no runtime dependencies, so each has itself as its only component and an empty `components` list:

```sh
jq '.components | length' rathkit-rte-core-0.1.0-alpha.0.cdx.json   # 0
jq -r '.metadata.component.hashes[0].content' rathkit-rte-core-0.1.0-alpha.0.cdx.json   # the sha-512 of the tarball
```

Optional peer dependencies (React, Vue and so on, for the wrapper packages) are the framework the wrapper is used with; they are not installed with the package and are not listed.

You can also see it in a project that installs the packages:

```sh
npm ls --omit=dev --all     # only @rathkit/* packages, nothing else
```

and, for nothing running at install time, each package's `package.json` has no `preinstall`, `install`, `postinstall` or `prepare` script (`npm install --ignore-scripts` changes nothing for these packages).
