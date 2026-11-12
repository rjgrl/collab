# Decisions

Append-only. Format: date, decision, why, alternatives rejected.

## 2026-11-09: Orchestrator plus Haiku workers

- Decision: the main session plans and verifies. `builder` and `reviewer` subagents on Haiku do bulk work.
- Why: cheaper bulk work, and the orchestrator keeps context for planning and checking.
- Guard: the orchestrator reruns every "Done when" check. Security-sensitive diffs get a line-by-line read.

## 2026-11-09: Share Claude config with the team

- Decision: commit `CLAUDE.md`, `.claude/agents/` and `.claude/skills/`. The rest of `.claude/` stays ignored.
- Why: every collaborator gets the same workflow, agents and skills.
- Rejected: unignoring all of `.claude/`, which would leak local settings and session state.

## 2026-11-09: "Refined institutional" UI direction

- Decision: keep the navy identity and modernize it: deep navy grouped sidebar, breadcrumb header, near-white canvas with white cards, stat tiles, split brand panel on auth pages. Tokens live in `packages/ui/src/styles/globals.css`.
- Why: biggest visual gain with proven AA contrast and a familiar layout for existing users.
- Rejected: a blue-and-gold rebrand (gold needs heavy contrast tuning) and a neutral SaaS look (least institutional).
- Constraints kept: 14px/1.5 body text and Inter (browser tests pin both), every accessible name the tests use, mobile "Open menu" dropdown (restyled with section labels, not a drawer).

## 2026-11-09: In-app confirm dialog replaces `window.confirm`

- Decision: destructive or discarding actions use `useConfirm()` (`apps/web/src/components/feedback/confirm-provider.tsx`) over the shared `ConfirmDialog`.
- Why: native prompts are unstyled, block the page and cannot carry a clear action label.
- Test impact: `tests/browser/completion.spec.ts` clicks the alertdialog's confirm button instead of pre-accepting a native dialog. No other test changed.

## 2026-11-09: Line endings and folder conventions

- Decision: `.gitattributes` forces LF. `apps/server/src` holds runtime code only; check scripts and the Playwright fixture live in `apps/server/test/`. Web helpers live in `apps/web/src/lib/`; components are grouped by feature. Test helpers and CLI entry points get their own folders (`packages/api/src/test-utils`, `packages/db/src/cli`).
- Why: Windows `core.autocrlf=true` made `pnpm check` flag every file; mixed runtime/test files made the server source hard to scan.
- Deferred: renaming the `@Alumni-Tracking-Ss` scope (about 490 references plus the lockfile) and moving server-coupled tests out of `packages/api` (the RBAC catalog test scans paths relative to its own location).

## 2026-11-09: Password policy adds character-type rules (deviates from NIST SP 800-63B)

- Decision: new passwords need 15–128 characters (code points after NFC), an uppercase letter, a lowercase letter, a number and a special character, plus the server-side common/breached check. The owner chose this option over length-only rules.
- Deviation: NIST SP 800-63B advises against composition rules. This is an intentional, owner-approved deviation.
- Details: the rules live once in `packages/contracts/src/password-policy.ts` (`PASSWORD_REQUIREMENTS`); `newPasswordSchema` and the live checklist both read that list. Character classes use Unicode properties, so non-ASCII letters count. A space counts as a special character (OWASP's special-character list includes it), so passphrases stay usable. Scripts without letter case (for example CJK-only passwords) cannot meet the case rules.
- Consequence: the bundled common-password list has no entry that meets the new rules, so the opt-in HIBP check (`PASSWORD_BREACH_CHECK=hibp`) is now the meaningful screen. The common check still runs first so its message wins for API clients.
- Rejected: keeping the length-only policy (option A).

## 2026-11-09: Compact single-page sign-up

- Decision: sign-up stays one page. Google sign-up and an "or" divider come first, then Personal / Contact / Academic / Account fieldsets in a 3–4 column grid on desktop, single column on mobile.
- Why: at 1440×900 the Create account button ends at about 871px with no scrolling; at 1366×768 it needs one short scroll. Inputs and buttons keep their existing 40px height and 14px text, so the two-step fallback was not needed.
- Test: `tests/browser/signup.spec.ts` asserts the button is fully in view at 1440×900, within 320px of the fold at 1366×768, and that fields stack on a 390px phone.
- Note: the existing 40px controls are below a 44px touch target; this layout does not make them smaller.

## 2026-11-09: Roles keep permissions; no per-user permissions

- Decision: permissions stay on roles. Super Admins change a member's role from the Members page ("Edit role"); the dialog's permission checklist only finds the role whose permission set matches exactly (`matchingRoles` in `packages/contracts/src/role-match.ts`, order-independent, ignores retired or unknown permissions). With no exact match, saving is blocked and the dialog offers to create a new role with those permissions, then assigns it.
- Why: per-user grants would bypass role review and the scope rules that already protect Super Admin assignments and Alumni/managed transitions.
- Guards unchanged: `usersService.update` still decides every transition (users.write, `assertRoleScope`, Super Admin protection, no conversion to Alumni, staff email domains) and still revokes the member's sessions. The UI only hides the action from non-administrators; the server returns 403 to them.
- Rejected: per-user permission overrides.

## 2026-11-09: Role "Description" is shown as "Note"

- Decision: the UI calls the role description a "Note". It shows under the role name on role cards (two lines, full text on hover/focus), in the Edit role picker, and is editable with the role name in the role detail view. Creating or renaming a role to an existing name shows a non-blocking warning asking for a Note that tells them apart.
- Kept: the stored and API field is still `description` (no migration, no contract rename). Audit summaries label it "Note" for roles only.
- Known side effect: any role update, including a note-only edit, revokes the sessions of that role's members (existing server behavior, kept unchanged).

## 2026-11-09: Integration credentials live encrypted in the database; integrations default to disabled

- Decision: Super Admins enter integration credentials in Settings › Integrations. They are stored in `IntegrationSetting` as AES-256-GCM ciphertext (random IV per value, auth tag stored, AAD `integration:<key>:<field>`), sealed with `INTEGRATION_ENCRYPTION_KEY`. That key exists only in the server environment, must be 64 hex characters, and must differ from `MFA_ENCRYPTION_KEY`, `SESSION_SECRET` and `BACKUP_ENCRYPTION_KEY`; production refuses to start otherwise. Documents keep only an 8-hex SHA-256 fingerprint of the key, so restores with another key show "can't be read" instead of failing silently.
- Write-only: secrets are never returned, logged or audited; the UI shows "Set · ends in ••••1234" (last 4 only for values of 12+ characters). Non-secret values (site keys, IDs, URLs) are shown to administrators.
- Enabling requires every required value, a format check and a provider connection test before anything is saved; disabling erases the credentials and turns the integration off in one transaction; Google Forms gets a server-generated secret shown once. The old `PATCH /api/integrations/:key` toggle, which could enable without credentials, was removed.
- Defaults: a missing row now means disabled. The migration writes explicit rows with the previous implicit values only on existing deployments; fresh installs and new seeds start disabled. Production ignores credential env vars; development may fall back to them and `pnpm db:seed` copies them into the database once.
- Requests build `IntegrationEnv` from the database through a 5-second in-process cache (invalidated on writes in the same process), so another server instance may use the old credentials for up to 5 seconds.
- Rotation: `pnpm db:rotate-integration-key` (see `docs/operations/INTEGRATIONS.md`) re-seals everything in one transaction.
- Not done: the email gateway URL is an administrator-supplied HTTPS URL fetched by the server (admin-only, HTTPS-only; no allowlist).

## 2026-11-09: In-app backup and restore over the live database (supersedes "never overwrite a real database")

- Decision: the owner approved restoring over the live database from Settings › Backups. This supersedes the rule in `docs/operations/DISASTER_RECOVERY.md` for this one guarded path; the procedure is documented there.
- Guards: Super Admin with an MFA-verified session (server-enforced on every backup endpoint), a fresh authenticator code plus typing `RESTORE`, only verified backups, schema version not newer than the server, matching MFA and integration key fingerprints, one lock for backups and restores across instances.
- Safety net: a verified pre-restore backup first; maintenance mode (non-Super-Admin API → 503) during the restore; any failure restores the pre-restore backup, and maintenance stays on only if that also fails. Sessions are invalidated after a restore.
- Format: chunked AES-256-GCM (1 MiB chunks, AAD binds backup ID, index and final flag) with `BACKUP_ENCRYPTION_KEY` from the environment only. Catalog, lock, schedule and maintenance state live outside the restored data (`BACKUP_DIR` files and the excluded `BackupState` collection), so a restore cannot roll them back.
- Tools: MongoDB Database Tools 100.20.1 (official zip, SHA-256 verified) in ignored `.tools/`, used through `MONGODB_TOOLS_DIR`.
- Deferred: the optional off-host copy to Google Drive and restoring from an uploaded file.

## 2026-11-11: Worker safety guardrails after the five-unit implementation

- Decision: builders may use only read-only git commands. They must report test-count changes and new test names, and may call a failure pre-existing only after reproducing it on an unmodified checkout.
- Decision: worker briefs stay to one concern and about three files. Cryptography, restore/migration, and authorization-guard code remains with the orchestrator; workers may handle bounded UI and tests around it.
- Decision: replacing a guard, route, or compatibility path requires a negative grep in the acceptance check so the removed path cannot survive beside the replacement.
- Reason: this session had one destructive reset, test claims without added tests, unproved "pre-existing" failures, a dropped reCAPTCHA guard, and an old integration route that bypassed credential requirements. The user approved applying every `/reflect` proposal.

## 2026-11-11: Integration keys are verified against the provider before saving

- Decision: enabling an integration or updating its credentials runs a live provider check first; on failure nothing is saved and the dialog shows why. reCAPTCHA: site key format plus `siteverify` (a valid secret with a dummy token returns `invalid-input-response`). Google sign-in: a dummy code must return `invalid_grant`, anything else is a rejection. Google Drive and Sheets: open the folder or spreadsheet with the service account. ImgBB: upload a 1x1 image that expires after 60 seconds. Email: send a real test message to the administrator; in production the gateway must resolve to a public address. Google Forms needs no key (the server generates the secret).
- Reason: owner requirement ("verify tokens/keys; if invalid, say so and do not save"), and the review found the reCAPTCHA check accepted any secret.

## 2026-11-12: Versioned API (/api/v1) generated from one route table, with an OpenAPI 3.1 description

- Decision: `packages/contracts/src/api-routes.ts` is the single list of JSON endpoints (contract, method, path, public or session). The web client is built from it, `docs/api/openapi.json` is generated from it by `pnpm openapi`, and `apps/server/src/api-routes.test.ts` proves Express serves every entry. Non-JSON endpoints (uploads, downloads, OAuth redirects, the Forms webhook) are listed in `RAW_ROUTES` and documented by hand.
- Versioning: `/api/v1` is canonical. The unversioned `/api` paths still work (owner choice) and answer with `Deprecation: @1794355200` (RFC 9745) and `Link: </api/v1/...>; rel="successor-version"`. The server rewrites `/api/v1/...` to the existing routers before any other middleware, so rate limits, maintenance mode and origin checks see one path.
- Exception: `/api/auth/google` and `/api/auth/google/callback` stay unversioned and are not deprecated. The callback URL is registered in Google Cloud and the OAuth state cookie is scoped to that path.
- Owner follow-up before removing the alias: point the Google Forms Apps Script at `/api/v1/integrations/google-forms/webhook`. Stored image URLs like `/api/files/...` rely on the alias and need a data migration before it can be removed.
- Rejected: hand-writing the OpenAPI file (drifts), or a code-first framework rewrite (too invasive). The spec is checked byte for byte against the generator in `pnpm test`, and it validates with Redocly (5 warnings: no license, and redirect endpoints have no 2xx/4xx).
- Unchanged: conflict detection still uses `expectedUpdatedAt` in the body rather than ETag/If-Match; action endpoints (login, enable, restore) remain RPC-style. Both are documented trade-offs, not REST-maturity goals for this release.

## 2026-11-12: Reference integrity is enforced at write time and checked nightly

- Decision: MongoDB stays (no migration to PostgreSQL now). A Mongoose plugin (`packages/db/src/reference-integrity.ts`) applied to every schema rejects `save`, `create`, `insertMany` and updates (`$set`, `$setOnInsert`, replacements, upserts) whose `ref` field points at a missing document. The check runs in the caller's transaction (Mongoose async-local session), so a parent created earlier in the same transaction is visible. The API maps the failure to 409 "A linked record no longer exists."
- Exempt: fields marked `integrity: false`. Only `AuditLog.actorId` is, because audit entries are history: after a restore, the Super Admin who ran it may not exist in the restored data, and the entry must still be written. The plugin found this (the restore audit was being dropped) and the Forms import writing its receipt before its job.
- Not covered at write time: deletes of a parent under its children, and writes through the native driver (migrations, mongorestore). `findBrokenReferences` scans all references with `$lookup`; it runs nightly at 03:30 Asia/Manila on one instance (slot claim in `BackupState`), notifies Super Admins and writes an `integrity.references` audit entry with counts and document IDs only. Operators run `pnpm db:check-references` (exits 1 on findings).
- Cost: one indexed `_id` lookup per reference field written. Rejected: `$jsonSchema` collection validators (cannot express cross-collection references) and a PostgreSQL migration (high cost, working system).

## 2026-11-12: Backup monitoring is in-app notifications and structured logs, not a metrics stack

- Decision: freshness alerts (daily 26 h, weekly 7 d + 2 h, measured from the newer of the last verified backup and the last schedule change), Drive-copy failure alerts and integrity alerts go to Super Admin notifications and the audit log, deduplicated across instances with conditional updates in `BackupState`. Tool failures log `backup_tool_failed` JSON lines with redacted stderr; restore failures log `restore_failed` / `restore_rollback_failed` and store the reason.
- Reason: there is no metrics or alerting service in this deployment; Super Admins already use the notification inbox. A log shipper can alert on the JSON event names if one is added later.
- Redaction is required, not cosmetic: mongodump prints the full connection URI, password included, in its own error output.

## 2026-11-12: Read-first UI keeps secondary edits out of the main page

- Decision: retain the navy/Inter identity while reducing simultaneous controls. Sign-up uses four numbered groups with optional fields behind disclosures; Account and managed Alumni details show summary cards first and open focused dialogs for edits. Account photo, evidence, and backup imports share a styled file picker backed by a real accessible file input.
- Why: the previous pages exposed too many fields and native controls at once, obscuring the primary task on both desktop and mobile. Read-first cards preserve scanability without changing server contracts, ownership, verification, or authorization.
- Accessibility: established labels remain stable, optional disclosures transfer focus, dialog focus is trapped and returned, and browser coverage runs desktop/mobile plus light/dark axe WCAG 2.2 AA checks. Base UI's invisible popup focus sentinels are excluded only from axe scans while a popup is open; popup content and keyboard behavior remain covered.
- Rejected: a multi-step sign-up wizard (more navigation and state for the same compact form), a visual rebrand, and custom file controls that hide or replace the native input.

## 2026-11-12: Alumni photos are changed only by Super Admins and the assigned tracker

- Decision: the alumni detail header shows the profile photo to anyone who may view that alumnus. Uploading, replacing or removing it from the staff side is limited to Super Admins and the faculty member whose record is the alumnus's `assignedFacultyId` (`canManageAlumniPhoto` in `apps/server/src/modules/alumni/access.ts`); department/college heads and other faculty can only view. Alumni keep their own photo controls.
- Enforcement is server-side on both write paths (image upload via `POST /files/evidence` and the new `DELETE /alumni/:alumniId/photo`), on top of the existing permission and scope checks. The new delete route exists because Faculty do not hold `files.delete`; granting it would also allow deleting evidence.
- Also tightened: `GET /account-photos/...` for another user now requires the alumnus to be in the viewer's alumni scope; `alumni.read` alone no longer suffices.

## 2026-11-12: Tracking history is paginated on the server

- Decision: `GET /alumni/:alumniId/tracking-events?page&pageSize` returns `{ items, page, pageSize, total }`, newest first, page sizes 10/25/50 only, with the tracker's display name. The detail page renders it as a table with numbered pages.
- Kept: the alumni detail response still embeds `trackingEvents` for API compatibility (Profile PDF and older clients). Removing it is a later, versioned change.

## 2026-11-12: MongoDB Atlas for hosted environments only

- Decision: staging and production use Atlas through the existing `DATABASE_URL`; local development and every automated test keep the native `rs0` replica set, so tests stay offline and isolated. No Atlas-specific code was needed.
- The presentation data will be migrated later from another device with the commands in `docs/operations/MONGODB_ATLAS.md` (config files instead of URIs on the command line; the same encryption keys and `UPLOAD_DIR` must move with the data).

## 2026-11-12: Tracking status is staff-only; history is plain language

- Decision: Alumni never see or receive their tracking state. `/me/profile` omits `isTracked` and `lastTrackedAt` and returns no tracking events; the My Profile page and panel texts no longer mention tracking. Staff still see the status, now under the program in the alumni header.
- Decision: Change history is rendered server-side by `describeHistoryEntry` (`packages/contracts/src/alumni-history.ts`) into a title and plain detail lines. New records show their values (not `null → value`), dates read as "Jul 7, 2023", program and faculty IDs are resolved to names, and any remaining database ID shows as "a linked record". Tracking events now store `metadata.tracking` (status, source, notes); older tracking summaries are parsed for their notes and source.
- Pagination: tracking is paged on the server; employment and change history are paged in the browser (already loaded; history is capped at the 200 newest entries); faculty keeps server paging, now 10/25/50 rows.
- Notifications: bottom-right, at most 3 visible, close button inside on the right.
- Removed the dev-only "Local functionality testing" banner; the local verification setting itself is unchanged.
