# Alumni feature completion ? local evidence

This is the earlier completion snapshot. The [current local-testing follow-up](LOCAL_TESTING_FOLLOW_UP.md) supersedes its mandatory local Admin MFA, Faculty management and delegated Staff integration behavior; current traceability is in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

Recorded 2026-10-23 on Windows, Node 26.10.0, pnpm 12.5.1 and MongoDB 9.0.2 / rs0. This continues the earlier Express/REST/Mongoose rewrite in the existing working tree. No commit, remote publish, deployment, production migration or real provider message was performed.

## Result and traceability

[FEATURE_MATRIX.md](FEATURE_MATRIX.md) retains all 51 historical source rows and statuses: 45 corrected local behaviors Verified, 4 Partial for live external-provider acceptance, 2 Superseded with verified replacements (Alumni directory access and mandatory Staff MFA). Hidden screenshot subitems/titles were not invented. New requirements have their own evidence rows. Verified local behavior does not certify production hosting or live delivery.

Implemented atomic account/profile signup with academic details and reviewed legacy linking; separate structured names and registered-profile counts; managed-local contact exemptions with honest unverified states; required Admin MFA and Staff/Alumni exemption; owned employment/photo/private evidence workflows; complete management employment editing/removal, faculty assignment and alumni/evidence archival; auditable tracking; common report/filter populations and safe CSV/RAW Sheets export; and suppressed aggregate-only Alumni statistics.

Local setup fills missing signup/contact-testing flags while preserving nonempty choices. This checkout explicitly enables local public signup and both contact exemptions. After the development watch reload, the running local API returned this policy and readiness 200. Production rejects contact exemptions and retains disabled-by-default public signup. The retired Admin MFA flag has no effect. Existing grandfathered verificationRequired=false accounts and stored role grants are preserved for explicit institutional review; new Staff defaults omit integration-management permission.

## Observed gates

| Check | Result |
| --- | --- |
| pnpm test | 200 passed; zero skipped/failed |
| pnpm test:browser | 48 passed across desktop/mobile |
| pnpm test:completion-db | Passed real persisted signup/race/legacy review, Google completion/password proof, strict-policy return, employment concurrency/legacy flags, ownership/files, faculty, reports/filters/privacy |
| pnpm test:mongoose-db | Passed additive migration/idempotence, collections/indexes, unique links, legacy null/absent fields and transaction rollback |
| pnpm test:security-db | Passed real shared counters, MFA enrollment/rotation/recovery, encrypted factors, reset/revocation and rollback |
| pnpm test:forms-db | Passed persisted idempotency, concurrent/replayed submissions, rollback and authorization |
| pnpm test:pentest-local | Passed local HTTP authentication/session/CSRF/permission/IDOR/input/file checks |
| pnpm test:staging-local | Passed bounded local proxy/header/rate-limit, query/index and shutdown/readiness checks; no production capacity claim |
| pnpm accounts:local + dev:accounts + test:roles-local | Passed generated guarded accounts and normal UI login for all three roles, Admin MFA, normal REST academic/account/role CRUD, explicit legacy link, tracking actor/time/source, archive/account retention, integration delegation/revocation and disabled sessions |
| Production guards on all role tools | Rejected before private profile use; profile pointer unchanged |
| pnpm install --frozen-lockfile; env:generate | Passed |
| check-types; test:browser-types; warning-free vp lint | Passed |
| pnpm build; check:production-build; check:server-build | Passed; development tooling absent from built web, obsolete Prisma client/native engines absent from server |
| pnpm check:secrets; pnpm audit | Passed eligible-file scan; no known dependency vulnerabilities. Neither is a history audit or security certification. |
| pnpm test:recovery-local | Passed after portable Database Tools installation and consistent tracked fixture correction; encrypted/tamper-checked dump restored into a new namespace with documents, indexes, runtime/file hashes and receipt replay checked |
| pnpm run doctor | Passed working managed database and required indexes after backed-up additive local update |

The completion DB acceptance is included in the pinned quality workflow, using a fresh CI replica set. Hosted CI, another OS/device and a new clone of the uncommitted working tree were not run; no commit was made merely to exercise clone/remote tooling. Logs are retained under graphify-out/completion-*.log. Logs are local evidence, not replacement tests.

## Browser and visual evidence

Playwright uses the actual Express application and an isolated real MongoDB namespace. It verifies signup fields/names, owned personal edits, jobs persisted across reload, actual PNG upload/decode and inline download, evidence removal, strict-verification return, faculty assignment/unassignment, management employment edits and archive/count changes. Existing MFA/recovery/reset, cross-account denials, private-cache clearing, keyboard/dialog and axe/viewport coverage remains.

Representative captures: test-results/completion-*/my-profile-complete.png and faculty.png (desktop/mobile), ownership My Profile, account/roles/integrations, and 320px authentication. The normal generated-account application additionally captures .tools/role-browser/<profile>/administrator.png, staff.png and alumni.png after rendered headings appear. Private MFA/recovery files in that directory must never be shared.

Taste direction: Achromatic ledger, seed 1224321969; quiet blue-grey ground, ink controls, existing Inter declaration/system sans fallback. Student/program identity is the signature element beside editable personal details. No redraw. Login's question is how to enter the registry; My Profile asks what to update; Faculty asks who belongs to each department; Dashboard asks how many eligible graduates are tracked. Data is real to the selected database; SYNTHETIC labels identify development records, which are not production statistics.

The Taste inspector ran on login at 1440/768/390: zero FAIL, one tiny-text WARN. Inputs/labels are 14px; compact helper/secondary text remains 12px. Protected screens were inspected through actual authenticated Playwright screenshots because the standalone inspector has no session-injection option. App critique: headings/actions answer each screen's question; panel edges align; colour stays restrained; counts reconcile (normal demo 1 graduate = 0 tracked + 1 untracked, 0.00%, 1 registered); missing graduation year says Not recorded; mobile navigation folds and content stacks; wide tables have a focusable scroll region. No charts/fabricated activity were added. This is an application review, not a marketing-page picture/motion score or full WCAG certification.

The existing Vite/TanStack development console emits a script-render warning; test reset/teardown can emit failed-fetch warnings. These were not treated as clean-console evidence. The production artifact tooling check passes. Mongoose also warns about the retained legacy ImportJob.errors field; it was not renamed or suppressed to hide a warning.

## Review corrections and local data safety

Regression evidence drove fixes for atomic registration, strict contact transitions, Admin MFA despite the retired flag, shared report filters, default Staff integration denial, full-name search, current-job serialization (including contradictory legacy flags), and omitted import tracking columns. An absent/blank import flag preserves the decision; unknown values reject the row. Authorized imports preserve suffixes and tracking actor metadata.

An initial role-launch attempt used the working configuration and rejected synthetic credentials. It may have left failed-login throttle records; no business records/passwords were changed. The launcher now starts normal entry points with explicit private profile overrides on ports 3003/3004; tests compare logged-in IDs with the guarded synthetic database.

The working doctor found missing User.alumniId and FormsReceipt.keyHash uniqueness. After a conflict-free dry-run, an ACL-protected AES-GCM backup was restored to a new collab_schema_restore_* namespace and compared. Only FormsReceipt and its unique index plus User_alumniId_key were added. Every existing document digest/count and index was identical afterward; doctor now passes. Private evidence is under .tools/local-schema-backups/e136f657e0271661/result.json; ciphertext and separately protected local key folders are retained. This is a local, bounded quiescence-checked backup, not an off-host or online point-in-time recovery guarantee.

Portable Database Tools 100.19.1 came from [MongoDB's official release metadata](https://downloads.mongodb.org/tools/db/release.json); archive SHA-256 matched 527738a0f9ab2d80ea40cb8fc7a68f8e28664a2fd4e3b63626c2d4629aeb7f37. They live only under ignored .tools/database-tools-100.19.1; no system PATH/service installation changed. Synthetic restore retained 9 documents, 22 collections, 59 index definitions and 66 runtime files (5,234,465 bytes), with tamper rejection and replay suppression. See [recovery operations](operations/DISASTER_RECOVERY.md).

## Cleanup and tools actually used

The existing migration diff removes 11 obsolete tracked files: five old oRPC routers, the browser oRPC client, Prisma schema/config (original schema archived), native-engine copy script and old Prisma artifact checker/tests. Express modules, shared contracts, Mongoose migration and server-artifact checks replace them. New completion work also removes duplicate employment/upload UI, the retired faculty redirect and obsolete Hono JSX configuration. Runtime manifests/lockfile have no Hono/oRPC/Prisma dependencies. Existing dirty migration changes, .codex/graphify artifacts, operational tests, private configuration, databases, uploads and backups were preserved.

Applied Superpowers planning/TDD/debugging/verification, Matt Pocock domain/module guidance, Agent Skills API/migration/security/frontend/documentation, and Ponytail implementation/review. Context7 retrieved focused Mongoose and Varlock documentation. Graphify CLI supplied code navigation and regenerated valid graph/HTML/report outputs (1,851 nodes, 5,169 edges, 115 communities). Its update returned exit 1 alongside unsupported/no-symbol file and changed-label warnings; regenerated JSON was parsed and counted. Semantic documentation extraction/LLM relabeling was not rerun. Taste supplied app direction and visual inspection. 21st skills were read; its CLI/MCP and Chrome DevTools MCP were unavailable, so existing shadcn primitives and Playwright were used. No hosted generation, plugin installation, external code upload, GitHub mutation or theme publishing occurred.

## Remaining release work

Live Google OAuth, reCAPTCHA, email, Drive, Sheets, imgBB and real Forms sender acceptance need credentials/configuration and institutional approval. SMS delivery is unimplemented. Production readiness deliberately returns 503 while mandatory verification providers are incomplete; do not weaken that gate. Restore strict email/phone requirements and verify actual delivery/code expiry before release. Review grandfathered verification policy and historical Staff grants through an explicit migration.

Storage/DB operations are not one atomic transaction: failed metadata persistence can leave an orphan stored object. Malware scanning, quotas/retention, distributed storage, longitudinal aggregate privacy, production recovery/key custody, clean-host restore, TLS/edge controls, real capacity and deployment remain institutional/operator work. No data purge, production migration or deployment was authorized or performed.
