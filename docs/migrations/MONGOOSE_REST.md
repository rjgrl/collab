# Mongoose and REST migration runbook

## Scope

Existing collection names, ObjectIds, references, timestamps, optional/null fields and records remain intact. No backfill is required to read existing data. Legacy `User.name` remains available for display and rollback. Structured names and `User.alumniId` are optional until explicitly confirmed or linked. The original schema is archived as `legacy-prisma-schema.prisma`.

Mongoose uses explicit collection names, with `autoIndex` and `autoCreate` disabled. Inspection/application lives in `packages/db/src/migration.ts`. Startup never drops, resets, renames or reseeds a populated database.

## Authorized operator procedure

1. Back up the database and matching private uploads; verify restore separately. Drain writers during the reviewed cutover window.
2. Install matching lockfile dependencies and build both applications. Preserve private configuration, passwords, MFA/verification keys and files.
3. Configure the DB package environment for the approved target. Run `pnpm --filter @Alumni-Tracking-Ss/db db:migrate --dry-run`. This default mode reports collection/index names, missing indexes and conflicts without writing data or printing duplicate values.
4. Review all conflicts. Inspection compares keys, uniqueness, sparse/partial options and collation, and checks missing unique indexes for duplicate groups. Incompatible definitions or duplicates block application; do not force past them or remove records to obtain green output.
5. Obtain explicit authorization for target writes, then run `pnpm --filter @Alumni-Tracking-Ss/db db:migrate --apply`. It adds absent collections/indexes and retires only the reviewed legacy `Department_code_key`, saving its full definition in `MigrationIndexBackup` and the report before removal. All records and unrelated indexes remain intact. Pause writers during this step. Repeated application is safe. Interrupted application may leave valid additions; inspect and repeat after resolving the failure.
6. Run the DB package's `db:verify-transactions` in the approved environment before cutover. Its synthetic write is rolled back. Standalone MongoDB is unsupported; readiness requires a writable replica-set primary.
7. Verify the partial unique `User_alumniId_key` before enabling explicit linking and `FormsReceipt_keyHash_key` before enabling webhook retries. Many users may have absent/null links; these do not establish ownership.
8. Release the matching frontend and API together. Only `/api` REST routes are served; update proxy/SPA rules. Existing cookie names, session digests and session records are retained; no blanket revocation occurs.

These are operator instructions, not authorization to migrate or deploy production. Local `setup:local` accepts only the managed loopback setup and requires `--update-existing` before schema/seed writes to a populated database. Repository seeding refuses production.

## Names and explicit linking

Never split legacy display names or infer ownership from matching names/emails. Users confirm separate name fields through Account settings or profile completion; authorized account edits use the same contract. Optional/custom suffixes are stored as their actual trimmed value. Account names synchronize linked alumni names transactionally; missing/archived linked records abort the write rather than silently diverging.

An Administrator with `users.write` and `alumni.write`, completed verification and required MFA selects an account and active alumni record in Settings → Members → Link alumni profile. Verify identity/student number before confirming. The service rejects duplicate/conflicting links and requires confirmed account names. No bulk automatic matching is provided.

## Rollback

Restore the previous compatible application artifact and lockfile while retaining the database, keys, uploads and additive fields/indexes. `db:migrate --rollback` restores the saved `Department_code_key` only if all existing code values, including missing values, remain unique. Pause writers first. It never rewrites records; if multiple code-free departments exist, rollback blocks until an operator reviews a data-preserving rollback plan. See [departments and audit history](../DEPARTMENTS_AND_AUDIT.md).

The previous application also restores its old global Viewer access and older MFA policy. Keep affected Alumni access paused during such rollback until ownership enforcement or a reviewed compensating restriction is restored. New structured names also populate legacy `name`, so display compatibility requires no lossy conversion. Never restore an older database over newer records as routine code rollback.

## Evidence

Before edits, 146 tests, types, lint and production builds passed. Isolated acceptance verifies dry-run write avoidance, repeated additive application, collection/index names, legacy null/missing soft deletes, ObjectId serialization, unique ownership links, transaction visibility and rollback. Final measured results are recorded in `docs/MIGRATION_VERIFICATION.md`.

## Feature-completion additions

Optional `Alumni.employmentRevision` and `EvidenceFile.employmentId` are additive. Existing records read without backfill. The department code index retirement described above is the only index removal; existing unique ownership/email/student constraints remain authoritative. New registration creates account/profile atomically. Legacy imported claims still require review and explicit linking. Current-job consistency is enforced by serialized application transactions. An authorized profile job edit also reconciles legacy contradictory current flags (ended/non-employed jobs cease to be current; the most recently updated valid job wins). No bulk historical rewrite is run.

Code rollback must preserve uploaded evidence, detached job references, accounts, factors and role assignments. Keep Alumni access restricted during any rollback that lacks the new self-service guards. Restore strict contact policy only with configured/accepted providers; no data rewrite is needed because local testing never falsifies verified flags. Existing `verificationRequired=false` accounts and stored Staff permissions are preserved and require a reviewed policy migration if the institution changes them. See [current completion evidence](../COMPLETION_VERIFICATION.md).
