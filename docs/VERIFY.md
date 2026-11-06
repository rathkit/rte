# Verifying a release

## Which versions

Use `0.1.0-alpha.3` or later: it is the first version the release workflow published, with provenance. `0.1.0-alpha.0` was published by hand and has no provenance. `0.1.0-alpha.1` and `0.1.0-alpha.2` are GitHub pre-releases only and are not on npm (`docs/RELEASING.md` says why). The examples below use `0.2.0-beta.0`; set `version` to the one you are checking.

```sh
version=0.2.0-beta.0
```

Every release lists what it is made of and can be checked three ways, with tools that are not ours. None of this needs the repository.

## The packages on npm: provenance

Packages published from the release workflow carry a signed statement of where and how they were built (npm provenance, made with Sigstore). To check the packages in a project:

```sh
npm audit signatures
```

It verifies the registry signatures and the provenance of everything in `node_modules`, and says which packages have none. (`0.1.0-alpha.0` was published by hand and has no provenance, and the release notes say so.)

## The release files: checksums and signature

Each GitHub release has the eleven tarballs, a bill of materials (`*.cdx.json`) for each, `SHA256SUMS` and `SHA256SUMS.sigstore.json`: 24 files. Download them into one folder.

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

A passing check means the list came from the `release` workflow of `rathkit/rte` on a version tag.

To compare what npm serves with the release, pin the version (a tag such as `next` moves) and look for the tarball's line in the list:

```sh
npm pack @rathkit/rte-core@$version
sha256sum rathkit-rte-core-$version.tgz
grep rathkit-rte-core-$version.tgz SHA256SUMS      # the same hash
```

`sha256sum --check --ignore-missing SHA256SUMS` does the same for every tarball in the folder.

## What is inside: the bill of materials

Each `*.cdx.json` is a CycloneDX 1.5 document. Every package ships with no runtime dependencies, so each has itself as its only component and an empty `components` list:

```sh
jq '.components | length' rathkit-rte-core-$version.cdx.json   # 0
jq -r '.metadata.component.hashes[0].content' rathkit-rte-core-$version.cdx.json   # the sha-512 of the tarball
```

Optional peer dependencies (React, Vue and so on, for the wrapper packages) are the framework the wrapper is used with; they are not installed with the package and are not listed.

You can also see it in a project that installs the packages:

```sh
npm ls --omit=dev --all     # only @rathkit/* packages, nothing else
```

and, for nothing running at install time, each package's `package.json` has no `preinstall`, `install`, `postinstall` or `prepare` script (`npm install --ignore-scripts` changes nothing for these packages).
