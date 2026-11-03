# Rathkit RTE: Distribution, Licensing, Telemetry and Compliance

Status: design sketch, not a plan or a promise. Written 2026-10-19, before the first release, and not kept in step since. Only the open-source half is built: `@rathkit/*` on npm, published by the release workflow with provenance from `0.1.0-alpha.3` on, and signed GitHub releases (`RELEASING.md`, `VERIFY.md`). Nothing premium exists. The premium scope, tiers, license tokens, registry delivery, telemetry package and compliance sections describe ideas that may change or never ship, and they set no price or date. Package names below that are not in the package table in `README.md` do not exist. Not legal advice. Items marked VERIFY rest on vendor claims or facts that were not confirmed when this was written, and several still have not been.

## 0. Recommended defaults at a glance

| Area | Default | Why |
|---|---|---|
| Open-source scope | `@rathkit/*` on npm | Primary home; trusted publishing and provenance |
| Premium scope | `@rathkit-pro/*` on a private registry | One scope maps to one registry, so premium cannot share `@rathkit` |
| Open-source license | Apache-2.0 (decided) | Patent grant, familiar to enterprise legal teams |
| Premium license | Commercial EULA, drafted by counsel | Not an OSS license |
| License check | Offline, signed token, verified locally | No phone-home; auditable verifier |
| Signature algorithm | ECDSA P-256 / SHA-256 (Ed25519 optional) | Works in every WebCrypto runtime and in FIPS-mode platforms |
| Sharing detection | Registry-side observation plus contract, not client callbacks | Detects misuse without the editor ever calling home |
| Telemetry | Off by default; separate opt-in package | Keeps core silent and zero-dependency |
| Premium delivery | Managed private registry with per-customer tokens | Customers never need accounts on your systems |
| Compliance | SOC 2 for the company's services; SSDF/SBOM/provenance for the software | The library has no data flows to attest |

## 1. Package scheme

### 1.1 Scopes
- `@rathkit/*` is open source. Published to npm.
- `@rathkit-pro/*` is premium. Published only to the private registry.
- Why two scopes: an `.npmrc` entry maps a whole scope to exactly one registry (`@rathkit:registry=...`). If premium lived under `@rathkit` on a different registry, customers could not install free and paid packages from the same scope.
- Claim `rathkit-pro` as an npm organization even though the packages are not hosted there. This blocks anyone else from publishing look-alike packages (see dependency confusion in section 3.3).

### 1.2 Names
These are the packages that exist today (the package table in `README.md` is the authority). The free plugins are entry points of `rte-core` (`/lists`, `/tables`, `/find`, `/word`, `/svg`, `/images`, `/autoformat`, `/markdown`, `/footnotes`, `/standard`), not packages of their own.

| Package | Scope | Notes |
|---|---|---|
| `rte-core`, `rte-headless`, `rte-element`, `rte-ui`, `rte-themes`, `rte-icons`, `rte-react`, `rte-vue`, `rte-svelte`, `rte-angular`, `rte-jquery` | `@rathkit/` | Built and on npm |

Ideas only, none of which exists:

| Package | Scope | Notes |
|---|---|---|
| `rte-server` | `@rathkit/` | A reference server package. Planned; the reference one would stay free |
| `rte-license` | `@rathkit/` | Open-source license verifier and public keys. Open so customers can audit exactly what the check does |
| `rte-telemetry` | `@rathkit/` | Optional, opt-in, never imported by any other package (section 5) |
| `rte-cli` | `@rathkit/` | A command-line tool |
| `rte-plugin-<name>` | `@rathkit-pro/` | Paid plugins |
| `rte-server-<feature>` | `@rathkit-pro/` | Paid server features |
| `rte-pro` | `@rathkit-pro/` | Optional meta-package that registers every paid plugin in one call |

### 1.3 Rules
1. No free package imports a premium package, ever.
2. Premium plugins use only the public plugin API. No private hooks. This keeps the free API honest and lets third parties write equivalent plugins.
3. Correctness, accessibility and security fixes ship to everyone. Paid tiers add capability and support, never safety.
4. Premium packages obey the same hard gates as free ones: zero runtime dependencies, no install scripts, provenance, size budgets.
5. Plugins receive the host API at registration time, so they do not import `rte-core` at runtime. Types: either bundle the needed declarations into each plugin's `.d.ts`, or use a types-only optional peer (optional peers are not auto-installed, so `npm ls --omit=dev` stays empty). Decide in an ADR.
6. Each premium package declares the plugin API range it supports, checked at registration so mismatches fail loudly.

### 1.4 Tiers (names and shape only)
- **Community.** All `@rathkit/*` packages. Apache-2.0. Community support.
- **Pro.** Adds `@rathkit-pro/*` plugins. Per-developer or per-product, to be decided.
- **Enterprise.** Pro plus: registry access via SSO or dedicated tokens, signed offline bundles for air-gapped networks, private mirror support, security questionnaire and evidence package, support SLA.

### 1.5 Licenses
- Free: Apache-2.0 (decided; the repository's LICENSE). MIT would be simpler but has no patent grant.
- Avoid source-available licenses with usage restrictions. They reduce contributors and adoption.
- Premium: a commercial EULA written or reviewed by counsel, covering permitted use, redistribution, term, version entitlement (section 4.1), audit rights, and liability.
- Trademark: protect "Rathkit" and the logo (forks may reuse code, not the name). "RTE" is generic and not worth registering.

## 2. Open-source distribution

| Channel | Role | Notes |
|---|---|---|
| npm (npmjs.com) | **Primary** | Publish from GitHub Actions with trusted publishing (OIDC, no stored token) and provenance |
| GitHub Releases | **Always** | Per release: tarballs, `SHA256SUMS`, SBOM, signed with Sigstore keyless. Enables vendoring and air-gapped installs |
| JSR (jsr.io) | Optional mirror | TypeScript-native registry. Needs a `@rathkit` JSR scope. VERIFY current publishing and provenance behavior |
| GitHub Packages (npm) | Optional mirror | Installing requires a personal access token even for public packages, so it adds friction. Useful mainly for GitHub-centric enterprises |
| CDN | Automatic and later own | Public npm CDNs serve npm packages automatically. Later, an own `cdn.rathkit.com` with versioned ESM URLs and published SRI hashes |
| Customer mirrors | Documented | Verdaccio, Artifactory, Nexus, Cloudsmith or CodeArtifact can proxy npm. Document the `.npmrc` and integrity-check steps |

Release integrity checklist (gates in CI):
- Trusted publishing only. No long-lived npm tokens anywhere. 2FA on all maintainer accounts. (From `0.1.0-alpha.3` on: `0.1.0-alpha.0` was published by hand, without provenance, because npm cannot set a trusted publisher before a package exists.)
- Release workflow runs in a protected environment with required reviewers. GitHub Actions pinned by commit SHA. (Real: the `npm` environment, and an approval step before a staged publish goes live.)
- `npm ls --omit=dev` is empty, no install scripts, size budgets hold.
- SBOM (CycloneDX or SPDX) listing zero runtime components.
- Provenance attestation on every package, from `0.1.0-alpha.3` on. Target SLSA build provenance; claim a specific level only after verifying it.
- Signed `SHA256SUMS` published with each GitHub Release.
- Reproducible builds as a goal: a third party can rebuild a tarball and compare hashes.

Recommendation: npm plus GitHub Releases at launch. Add JSR later if TypeScript users ask. Publish a mirror guide for enterprises.

## 3. Premium delivery

### 3.1 Options
| Option | Fit | Trade-offs |
|---|---|---|
| Managed multi-tenant registry (for example Cloudsmith) | **Best fit for selling to external customers.** Per-customer entitlement tokens, per-token download visibility, SSO/SCIM for enterprise accounts | Vendor cost. VERIFY the vendor's current SOC 2 report and any FedRAMP status; the vendor's docs describe entitlement tokens for private repositories, but compliance claims were not confirmed |
| npm private packages (npmjs.com org) | Simple if customers already use npm accounts | Access is per npm user or team. Awkward for external customers. Token model is tied to your org's users |
| GitHub Packages (npm) | Fits customers who already use GitHub | Requires classic personal access tokens with `read:packages`. Customers need GitHub accounts and access grants. Awkward at scale |
| JFrog Artifactory (SaaS or self-hosted) | Enterprise and government customers who already run it; supports edge replication and self-hosted GovCloud deployments | Heavier and costlier. VERIFY any FedRAMP status; self-hosting in a government cloud is documented, authorization is a separate question |
| AWS CodeArtifact | Customers living inside AWS | Access is AWS IAM, so it only suits customers who give you an AWS principal or pull from their own account. VERIFY FedRAMP scope |
| Self-hosted Verdaccio or Nexus | Maximum control, cheapest at low volume | You own uptime, patching and the SOC 2 scope for it |
| Custom registry service (npm protocol over your auth, tarballs in encrypted object storage with short-lived signed URLs) | Lets you personalize a tarball per customer (embed license ID) | You build and operate it. Largest compliance surface |
| Signed offline bundles | Air-gapped customers | Manual delivery. Checksums and signatures verify integrity |

Recommended path:
1. **Launch:** a managed registry with per-customer entitlement tokens. It inherits the vendor's controls and keeps your own SOC 2 scope small.
2. **Enterprise:** add signed offline bundles and a documented mirror procedure (customer proxies your registry inside their network).
3. **Government or very large accounts:** offer delivery into the customer's own Artifactory or CodeArtifact, or a self-hosted instance in their boundary.

### 3.2 Token hygiene
- One read-only token per customer, never shared across customers. Scope each to the `@rathkit-pro` repositories only.
- Expiry and rotation. Revoke on contract end.
- Customers pass the token through an environment variable in `.npmrc` (`//registry.example/:_authToken=${RATHKIT_TOKEN}`), never committed.
- Observe per-token usage on the registry: install counts, CI versus developer machines, sudden fan-out. This is how sharing is detected (section 4.5).

### 3.3 Dependency confusion
Because premium names are private, an attacker could publish a same-named package on public npm and hope a misconfigured build picks it up.
- Own the `@rathkit-pro` scope on npmjs.com and publish placeholder packages.
- Document the scope mapping (`@rathkit-pro:registry=...`) in a copy-paste `.npmrc`, and tell customers to enable their package manager's scope-pinning.
- Shipped lockfiles and installation docs recommend integrity checks.

## 4. Licensing design (offline)

### 4.1 Model
Subscription with **version entitlement**: a license is valid for any premium build released on or before its `entitled_until` date. When a subscription lapses, software already deployed keeps working; only newer releases stop being covered. This avoids production outages from an expired key and is easy to check offline (compare the package's build date with `entitled_until`, not just the wall clock).

### 4.2 Token
Compact signed token (JWS-style: header, payload, signature). Payload fields:
- `v` format version, `kid` signing key ID
- `lid` license ID (opaque, used for leak tracing and revocation lists)
- `cid` customer ID (opaque, no personal data)
- `tier`, `features` (list)
- `scope` (for example allowed origins or hostnames, `*` for internal tools)
- `iat`, `nbf`, `entitled_until`
- optional `seats` or `projects`, informational only

No personal data in the token. Customer details live in your billing and CRM systems, not in the artifact.

### 4.3 Signature and keys
- Algorithm: ECDSA P-256 with SHA-256, verified through WebCrypto in browsers and Node. Platform crypto only, so no cryptography library is shipped and FIPS-mode platforms use their own validated module.
- Ed25519 is an optional second algorithm. Current evergreen browsers and Node support it in WebCrypto, but P-256 is the safer universal default. VERIFY at implementation time.
- Verifier and public keys ship in `@rathkit/rte-license` (open source). Several keys are embedded, each with a `kid`, to allow rotation.
- Signing key: kept in a cloud KMS or HSM, signing performed by a small issuing service. An offline root key signs the list of valid issuing keys. Rotation procedure documented and rehearsed.
- Revocation offline: each release embeds a small denylist of revoked `lid` values. Revocation therefore takes effect when a customer upgrades. State this plainly in the EULA.

### 4.4 Verification behavior
- Runs once, in memory, when a premium plugin registers. No network, no storage, no cookies.
- Checks: signature, `kid` known, `nbf`, `entitled_until` versus the package build date, tier and feature match, `scope` versus `location.hostname` (always allow `localhost`, loopback and common dev hosts).
- On failure: the plugin does not activate, a clear console message says why, and the editor shows a small non-blocking notice. **Editing never destroys user content, and the free editor keeps working.**
- Supplying the token: build-time injection (bundle constant) for apps, or runtime option for server rendering and tests.

### 4.5 Detecting sharing without phoning home
An offline check cannot know how many places a token is used. Options, combinable:

| Option | How it works | Phone-home? |
|---|---|---|
| Contract and audit rights | EULA terms plus a right to request a usage statement | No |
| Registry-side observation | The registry sees which token downloads what, from where, how often. Unusual fan-out triggers a conversation | No (happens at install, not in the app) |
| Tracing | Per-customer `lid` in the token lets a leaked token be traced to its customer | No |
| Signed local usage report | The library can produce a report locally (counts only, no content) that the customer sends for annual true-up | No (customer sends it) |
| Optional online attestation | Customers who want seat or usage-based billing enable periodic reporting to an endpoint, ideally one they host or relay | Yes, opt-in only |
| Self-hosted license server | Air-gapped or regulated customers run a validator in their own network | Inside their boundary |

Recommended: contract plus registry observation plus tracing by default. Offer the signed local report and the optional attestation to customers who need them.

### 4.6 Honest limits
Offline checks stop casual copying and make misuse traceable; they cannot stop a determined person from patching a copy of open-source verifier code. The real controls are registry access (you decide who can download), contract, and the value of staying on supported, patched builds.

## 5. Telemetry

### 5.1 Principles
1. Core never makes a network request, never persists anything, and has no telemetry code path.
2. No install-time telemetry of any kind, and no install scripts.
3. All telemetry is opt-in, explicit, documented, inspectable, and removable.
4. No content, no personal data, no stable user identifiers.

### 5.2 Why not optional dependencies
`optionalDependencies` are installed by default and only skipped when they fail to install, so they do not make telemetry opt-in and they break the "empty `npm ls`" promise. Optional peers are not auto-installed, but a package that is merely present is still not consent. Use an **explicit opt-in**:

```js
import { createEditor } from "@rathkit/rte-core";
import { telemetry } from "@rathkit/rte-telemetry";   // installed on purpose

createEditor({ plugins: [telemetry({ endpoint: "https://telemetry.example.com" })] });
```

### 5.3 What `rte-telemetry` would send (if enabled)
Batched, aggregate, versioned schema, for example:

```json
{ "schema": 1, "rte": "1.4.2", "env": {"browser": "chromium", "framework": "react"},
  "plugins": ["table", "image"], "counters": {"sessions": 12, "errors": {"paste_parse": 1}} }
```

- Never: document content, selection content, URLs, user IDs, IP addresses (dropped at the edge, not stored).
- Controls: `dryRun` that prints payloads instead of sending, honors Do Not Track and Global Privacy Control, a global kill switch, configurable endpoint (self-hosted collector or the customer's own relay), and a strict CSP-friendly single endpoint.
- Enterprise: simply do not install the package. Optionally build-time exclusion in the Pro bundle.

### 5.4 Where metrics come from without client telemetry
| Signal | Source |
|---|---|
| Public adoption | npm download counts, GitHub stars, release downloads |
| Premium usage | Registry logs per customer token: installs, versions, timing |
| Support-driven | Opt-in diagnostic report the customer attaches to a ticket |
| Docs reach | Privacy-friendly docs analytics, kept separate from the library |

## 6. Security and compliance

### 6.1 What SOC 2 actually covers
SOC 2 is an attestation report about **your organization's systems and controls**, not a certificate on a library. For Rathkit the in-scope systems would be the license issuing service, the customer portal and billing, the registry arrangement (an outsourced registry becomes a subservice organization; its report supports yours), source control and CI, and support tooling.

The library itself has no data flows by default: it stores and transmits nothing. Say that in the security package. It makes customer security reviews short.

Approach:
- Keep scope small. Outsource what you can to vendors with their own SOC 2 reports.
- Type I first, then Type II after a multi-month observation window. Use a compliance-automation platform to collect evidence.
- Evidence the software supply chain: provenance, signed releases, SBOM, vulnerability disclosure policy, security advisories, independent penetration test summary, secure-development practices.

### 6.2 FedRAMP reality
FedRAMP authorizes **cloud service offerings** that handle federal data. A client-side library distributed as software is generally not itself authorized. Federal customers instead ask for:
- Secure software development attestation (the common federal self-attestation form based on the NIST SSDF)
- SBOM, vulnerability management and disclosure practice
- FIPS-validated cryptography where cryptography is used. This design ships no crypto of its own and uses platform crypto, which is what lets customers satisfy this in their own environment.

A FedRAMP path would apply only to a service you operate for federal users, for example a hosted collaboration or license service. Self-hosting `rte-server` inside the customer's boundary avoids that. Treat FedRAMP as a future decision driven by a real customer, not a launch goal. Do not claim "FedRAMP approved" until an authorization exists.

### 6.3 Encryption statement, made verifiable
"No unencrypted data in motion or at rest" is a strong absolute. Memory is plaintext while data is processed. State testable claims instead:

**Library**
- Persists nothing by default (no localStorage, cookies, IndexedDB).
- Transmits nothing by default. Any network feature is a plugin the customer adds, using their own endpoints over HTTPS.
- Editor content is never sent to Rathkit.

**Services we operate** (license issuer, portal, registry arrangement, optional collector)
- TLS 1.2 or higher on every connection, TLS 1.3 preferred. HSTS.
- AES-256 at rest with keys in a managed KMS. Encrypted backups. Customer-managed keys for enterprise where the vendor supports them.
- Secrets in a vault, never in code or logs. Log scrubbing. Short retention.
- Least-privilege access with MFA, access reviews, and audit logs.
- Data minimization: license records hold opaque IDs and billing metadata only.

### 6.4 Claims we will not make
- "SOC 2 certified product". The correct phrasing is "we have a SOC 2 Type II report for [systems]".
- "FedRAMP approved" without an authorization.
- "Zero risk". Zero runtime dependencies reduces supply-chain exposure; build tooling, CI and accounts remain attack surface and are covered by the release gates in section 2.

## 7. Open decisions

1. Free license: settled, Apache-2.0.
2. Premium unit: per developer, per product, or per deployment.
3. Types without runtime imports: bundled declarations or optional types-only peer.
4. Registry vendor for launch, after verifying compliance reports.
5. Whether to build the optional online attestation at all, or ship only the signed local report.
6. Grace behavior when a license is invalid: silent disable, notice, or watermark.
7. Whether `@rathkit-pro` placeholders go on npm now.

VERIFY before relying on this document:
- Registry vendor SOC 2 and FedRAMP status (not confirmed at time of writing).
- Artifactory and CodeArtifact FedRAMP scope (not confirmed).
- JSR scope claiming, provenance and publishing behavior.
- Ed25519 WebCrypto support in the specific runtime matrix you commit to.
- Counsel review of the EULA, the Apache-2.0 notices and the trademark plan.

## 8. Mapping to build phases
Done and not done, as of the first alpha:
- Phase 0: **done.** Trusted publishing, provenance, signed releases, SBOM, size and dependency gates are built and in use. The `@rathkit-pro` scope is claimed on npm.
- Phase 2 (public alpha): **done for the free packages**: published to npm and GitHub Releases (`0.1.0-alpha.3`). The `rte-license` verifier was not built.
- Phase 3 to 4: first premium plugins on the private registry. Issuer service, token format, key rotation drill. Not started.
- Phase 5: enterprise package: offline bundles, mirror guide, security evidence pack, optional telemetry package. Not started.
- Phase 6: penetration test, SOC 2 Type I, then Type II observation window. Not started.
