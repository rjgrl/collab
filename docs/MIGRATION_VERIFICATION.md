# Express, REST and Mongoose verification

Earlier rewrite snapshot. [Current feature-completion evidence](COMPLETION_VERIFICATION.md) supersedes its onboarding/MFA/UI limits and records the later backed-up local index update. Historical results below remain unchanged.

Recorded locally on 2026-10-23 using Windows, Node 26.10.0, pnpm 12.5.1 and the managed loopback MongoDB replica set. No production migration, deployment, live provider messages or working application database writes were performed.

## Baseline

Before implementation, 146 tests passed with zero skips. Type checking, lint and production builds passed. The original dependency lock contained Vite+ advisories; they were discovered by the final audit rather than attributed to the rewrite.

## Final checks

| Check                               | Result                                                           |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm test`                         | 195 tests passed, zero failed or skipped                         |
| `pnpm check-types`                  | All workspace and operational-script checks passed               |
| `pnpm test:browser-types`           | Passed                                                           |
| `pnpm exec vp lint --deny-warnings` | Passed without lint warnings                                     |
| `pnpm test:browser`                 | 44 desktop/mobile Chromium tests passed                          |
| `pnpm build`                        | Web, API and database production builds passed                   |
| `pnpm check:production-build`       | No known development runtime/tooling chunks in web artifacts     |
| `pnpm check:server-build`           | Entry exists; obsolete Prisma clients/native engines absent      |
| `pnpm check:secrets`                | No high-confidence credential patterns in eligible working files |
| `pnpm audit --audit-level=moderate` | No known vulnerabilities reported                                |
| `git diff --check`                  | Passed                                                           |

Vite+ and its matching core alias are pinned to 1.3.0 to resolve the audit findings, following the [official release](https://github.com/voidzero-dev/vite-plus/releases/tag/v1.3.0). Runtime validation and documentation now match its Node engine ranges. pnpm still reports Vite peer-version mismatches because the official alias identifies itself as 1.3.0 while embedding Vite 8.3.4; the installed combination passed types, builds and browser checks. No audit advisory was suppressed.

## Regression coverage

- Trusted `User.alumniId` ownership, unlinked-account handling, direct directory/ID denials, related-file ownership, management-only writes and strict self-service allowlists.
- Explicit administrator linking, duplicate links and the unique partial ownership index.
- Structured Unicode/compound names, empty middle names, optional/custom suffixes, unsplit legacy names and transactional account/profile synchronization, including disabled linked accounts.
- Staff/Alumni access without MFA despite saved enrollment, Administrator/mixed-role gates, contact verification and active-account checks.
- Session digest migration/rotation/revocation, Google proof and registration protection, password reset, encrypted MFA/recovery/replay and shared throttles.
- Invalid ObjectIds, conflicting body/route identifiers, date ordering, duplicate records, archived references, file signatures/limits and sanitized HTTP errors.
- Complete signup/profile browser flows, keyboard/viewport behavior, account switching without the previous identity's cached profile, and existing Settings/security flows.

New regressions were reproduced before their fixes: blank optional Facebook URLs, complete-profile Administrator MFA, passwordless legacy accounts, disabled linked-account name consistency and the throttled-error request ID. Desktop and mobile profile screenshots were inspected.

## Real database and HTTP acceptance

Each runner creates a randomly named synthetic loopback namespace. Application data is not reset, dropped or reseeded. Small synthetic namespaces and logs remain available for inspection; cleanup was not performed.

- `pnpm test:mongoose-db`: read-only startup/dry-run, exact 22 collections and 37 declared indexes, development bootstrap, ObjectId serialization, absent/null soft deletion, repeated additive application, unique partial links and nested-scope transaction rollback.
- `pnpm test:security-db`: shared counters across independent clients, MFA encryption/enrollment/recovery, session rotation, password change/reset/revocation, Google password creation and rollback. The harness reloads the rotated session before the next protected service call, matching HTTP authentication.
- `pnpm test:forms-db`: 25 acceptance groups covering disabled/invalid requests, transactional effects, identical/conflicting retries, concurrent duplicate delivery, archived references, fault injection and rollback. Forms remains disabled at the end.
- `pnpm test:pentest-local`: REST permission/security matrix and 120 bounded list requests at concurrency four with zero request errors.
- `pnpm test:staging-local`: synthetic proxy-header/cookie policy, Administrator MFA, export boundary at 10,000 rows, bounded concurrent reads and readiness returning 503 after disconnect.

Detailed logs are under `graphify-out/migration-*.log`. Synthetic probes are evidence of local behavior, not production capacity or failover certification.

## Limits and operational handoff

- Real provider OAuth, mail receipt, Drive, Sheets and Forms sender behavior require staging credentials and owner acceptance. SMS delivery remains unimplemented, so newly registered accounts cannot complete required phone verification yet.
- Production migration/index application and deployment were deliberately not performed. Follow [the migration runbook](migrations/MONGOOSE_REST.md), including backup, conflict review and rollback restrictions.
- Hosted CI on Linux/Windows, an independent physical device, production TLS/proxy, backup restoration and failover are unverified for this rewrite.
- Browser development logs include React script-tag warnings from the existing head/dev tooling and fetch failures around test navigation/teardown; the suite passes, but console-clean browser execution is not claimed.
- Mongoose warns about the legacy `ImportJob.errors` field name. It is retained for stored-data compatibility; the warning is not hidden.
- External file storage and a MongoDB transaction cannot commit atomically together. A storage success followed by a database failure can leave an orphan; operational reconciliation is still needed.
- Malware scanning, retention/purge policy, deep-offset capacity and multi-instance shared storage remain operational work.

The original faculty page was already a retired redirect. Its behavior remains unchanged, while faculty persistence and permission-protected REST management are available. Historical audit documents describe their original release, not this verification run.
