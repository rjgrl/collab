# Progress

Newest first. One entry per session: date, what changed, what was verified, what remains.

## 2026-11-19 (detailed API documentation PDF)

- Generated an endpoint-by-endpoint reference matching the owner's sample: version, documentation date, description, URL, method, configurations, parameters, and response-code tables for all 106 OpenAPI operations plus three health probes. The detailed PDF, HTML source, generator, and verification manifest are local exports under `.thinkrail/context/exports/` (generator under `.thinkrail/context/`); the earlier overview PDF remains unchanged.
- Verified cookie-based authentication, controller success statuses, and raw-route details against source. Supplemented catalog omissions for Google OAuth callback parameters, upload metadata, evidence preview queries, PDF export filters, and webhook headers. Shared OpenAPI error rows are explicitly identified as a reusable catalog, not endpoint-specific reachability claims; dates are documentation dates, not release dates.
- Verified: generation and DOM checks found 109 complete endpoint sections, 212 tables, and no detected table overflow; extracted PDF text contains all 109 URLs and all eight required labels for every endpoint. PDF has 180 pages; first endpoint HTML capture visually reviewed. No live API calls, application behavior changes, or full application test suite; provider/SMS readiness is unchanged.

## 2026-11-15 (secure API setup guide; no live activation)

- Owner selected **Guide and Examples** using existing Render secret injection and the encrypted Settings › Integrations store. Added `docs/operations/API_SETUP.md`: provider enablement, least-privilege credentials/scopes, actual environment mappings, server-only loading examples, minimal manual probes, quota/billing cautions, rotation/revocation and a dashboard checklist.
- Added `config/apis/.env.example` with placeholder values only and a narrow documentation ignore exception. Clarified encryption-key recovery/rotation in the existing credential guide; keys must stay outside database backup bundles but require a separate protected recovery copy.
- Flagged important limits: production provider env values are ignored; Sheets needs its own UI-entered service account for separation; Drive photo/backup paths reuse the Drive identity; ImgBB images are public; Forms needs an authorized sender/retry contract; SMS is still unimplemented. Resend and Twilio are documented examples, not selected/activated vendors.
- Verified documentation formatting, 36 placeholder-only assignments and their supported/manual mappings, section completeness, local links, private `.env` ignore coverage and example/doc visibility; all 12 JS/TS snippets parsed without execution (not full typechecking); secret scan checked 513 eligible files without high-confidence findings; whitespace check passed. No authenticated provider API tests, sends, credential creation, API enablement, billing changes, Atlas writes or deployment were performed.
- Earlier hosting regression/spec reconciliation remains pending after the last private-path tightening. Actual Render cutover and SMS release readiness are not complete; this documentation task does not change that status.

## 2026-11-15 (approved Atlas profile refresh; no live synchronization)

- Investigated account-name differences: the website backend is still configured for native MongoDB on port 27018. The previous Atlas import was a one-time snapshot. Read-only comparison found 35 changed profile fields across 6 users, 4 faculty profiles and 2 alumni profiles, plus 17 new local-only audit/throttle/session records.
- Owner reviewed the exact old/new values and approved **All Profile Changes**, including the listed department/tracker assignments. Created a new ACL-restricted native Atlas backup outside Git and revalidated the reviewed source/target hashes before updating anything.
- Applied only the approved 35 fields and 12 corresponding modification timestamps in one majority-committed Atlas transaction. No record additions, deletions, database replacement or source changes. All 156 unaffected records and every unapproved field remain unchanged; passwords, role grants, permissions, audit/security/session data, indexes and collection options were preserved.
- Verified: the atomic refresh and whole-dataset preservation checks passed; `pnpm exec tsx .thinkrail/context/verify-atlas-profile-refresh.ts` confirmed all 21 User/Faculty/Alumni profiles match the local source, zero broken references and 168 Atlas records across 27 collections. Recorded the verified post-refresh manifest without overwriting the original backup.
- The 13 audit entries, 3 throttle entries and 1 local session were deliberately not transferred. Local environment files and app configuration were not changed, and no automated test was pointed at Atlas. Future local website edits still will not synchronize automatically; hosted configuration/cutover remains deferred until hosting details are provided.

## 2026-11-15 (verified local-data snapshot in Atlas; cutover deferred)

- Copied the active application's local database into the approved, freshly checked empty Atlas `alumni_tracking` database: 168 records across 27 collections. No other database or existing target data was deleted. The machine-specific `BackupState` collection remains local, as required by the Atlas runbook.
- Created an ACL-restricted native archive and verified environment/key backups outside Git. The archive is not an encrypted in-app backup bundle; `BACKUP_ENCRYPTION_KEY` is not configured locally. No local photo/evidence file references or upload files were found.
- Briefly used existing maintenance mode during backup, verified its 503 response, and restored its original state. Consistent source-snapshot BSON hashes matched before/after mongodump; every restored collection's hashes/counts, indexes and options match the backup. The local API is available again.
- Read-only cleanup inspection found no broken references or unknown collections. Eight users, four faculty profiles and four alumni profiles had reserved example/test email domains, with 12 linked supporting records. After reviewing the exact 28-record proposed set, the owner chose **Keep All Records**. Zero records were deleted; no cleanup is authorized.
- Atlas migration dry-run reported no conflicts, missing indexes, legacy-role changes or missing integration defaults. Inspection left all copied record hashes unchanged. No schema migration was applied, no application code changed, and no automated test was pointed at Atlas.
- Hosted-server configuration and live cutover are still deferred until the owner supplies the hosting provider, service and API URL. The app and local tests still use the original native database; this snapshot does not synchronize subsequent local writes. The deployment URI must explicitly select `alumni_tracking`, retain the source encryption keys and use the host's approved Atlas egress allowlist.

## 2026-11-15 (prepare publication of all interface changes)

- User approved publishing all committed work on a new `alumni-interface-updates` branch instead of pushing protected `main`. No PR or merge was requested. UI changes are committed in `8951eb0`, on top of the history-preserving integration of `origin/main`.
- Confirmed the worktree was clean and all 85 UI/test/doc files were in the commit. Credentials, `.tools` and `.thinkrail` context are excluded from publication. Safety stash and backup branch remain local.
- Verified: fresh fetch and base ancestry check; publication diff whitespace clean; `pnpm check:secrets` checked 499 eligible files with no high-confidence findings. Reused unchanged-source evidence from integration: `pnpm check` 7/7, browser types pass, `pnpm test` 427/427. Remote CI/merge readiness is not claimed; no PR is being created by this action.

## 2026-11-15 (integrate diverged origin/main without pushing)

- Fetched and merged remote `0360744` into local `050fb23` as merge commit `bc93216`, preserving both original histories (3 local-only and 8 remote-only commits). Branch is 4 ahead / 0 behind the fetched `origin/main`; nothing was pushed.
- Protected work with `backup/main-before-origin-merge-20261115-145215`, a binary patch and `stash@{0}` including untracked files. Restored pending UI work afterward; 66 files not touched remotely and all 10 untracked files matched their snapshots exactly before a required tuple-type annotation in `admin-copy.spec.ts`.
- Reconciled history conflicts in CI configuration, app-shell imports and decisions; retained the remote security/refactor additions. Stash restoration conflicted only in progress/decisions, where both sets of entries were kept. Existing UI changes remain uncommitted and unstaged; safety stash/branch are retained. No database migration was run.
- Verified after integration/restoration: `pnpm check` 7/7; `pnpm test:browser-types` passes; `pnpm test` 427/427; no unresolved paths or staged changes. Full browser suite not rerun. Repository docs note that remote `main` is protected and requires a PR independently of ancestry.

## 2026-11-14/15 (JWT sessions, error pages, faster CI, bug-bounty fixes)

- Merged: #5 (tabs, JWT sessions, skeletons, phone-safe toasts; #6 folded in), #7 (404/403/500 pages, session-ended notice), #8 (CI ~8 min: one run per PR, 3 browser shards per OS, cached Chromium), #9 (only `super_admin` administers; `admin`, `staff` and `viewer` roles removed, `viewer` renamed to `alumni` by schema version 2; tracking hidden from the alumni audit log; toast list), #10 (unconfirmed-registration release, alumni upload/job caps and rate limit, email-gateway address hardening, Drive/imgBB download streaming).
- Bug-bounty audit: six confirmed findings, all fixed by #9 and #10 and re-tested against the original proofs of concept.
- This machine: dev database backed up (`.tools/backups/pre-role-migration-20261114-152734/`, restore-verified), migrated to schema version 2; the leftover test role `asdasdasdasd` ("Department Head", demo user `staff@collab.test`) deleted.
- `main` history: the empty duplicate #5 commit was removed with a lease-guarded force-push; the owner's PRODUCT.md commit was kept. Other clones must reset to `origin/main` (see known issues).
- Verified: `pnpm test` 418/418; 13/13 real-DB checks; full browser suite 127 passed, 3 skipped; CI green on every merged PR.
- Still to do: migrate the presentation device and any hosted/Atlas database (`db:migrate --dry-run`, then `--apply`); the open items under "Security follow-ups" in known-issues.

## 2026-11-14 (organized Reports and Reports-only Batch removal)

- Reports now has visible labels in College → Department → Program order, then Graduation Year and Tracking Status. Alumni CSV/PDF downloads are grouped separately from assignment/Google Sheets exports, with concise notes explaining their different filter scopes.
- Removed only the Reports Batch control/state/request field. Profile fields, stored values/history, server schemas and authorization remain unchanged, as explicitly approved.
- Payload tests exposed an existing bug: refetching totals after changing tracking temporarily emptied Department options and cleared the selection. Department options now use a stable subscription to the same scoped Reports summary endpoint; no new academic-directory permission is required.
- Added draft `apps/web/src/routes/_app/reports.SPEC.md`. Verified: `pnpm exec playwright test tests/browser/reports-layout.spec.ts --max-failures=1` 4/4 (desktop/320px phone, light/dark, axe, filter order, selection retention, mocked CSV/PDF/Sheets request construction and UI permission gates); `pnpm check` 7/7; `pnpm test` 410/410; rendered desktop/mobile screenshots reviewed. Full browser suite not run; exported file contents were not tested by the new mocked payload checks.

## 2026-11-14 (password visibility, confirmation and BukSU sidebar)

- Login and registration now have independent masked-by-default Show/Hide controls. Registration requires matching Confirm Password, with inline feedback and a submit-handler equality check. Confirmation is not sent to the API. Desktop password fields share a row; phones stack naturally.
- Resolved review `rc_c7ed30f8`: kept the sidebar product title and shortened only its subtitle to “BukSU - College of Technologies”; updated the mockup and browser expectation. Public landing branding is unchanged.
- Added password-control browser coverage (masking, keyboard, independent toggles, no toggle submissions, mismatch prevention, reset-on-navigation, autocomplete, accessibility and fit), preserved registration checks and verified that confirmation never enters the request. Draft owning spec: `apps/web/src/components/forms/password-controls.SPEC.md`.
- Verified: password/signup/CAPTCHA suites 20/20; additional password/admin/local-registration selection 10/10 with a 60-second per-test budget (supersedes a resource-contended timeout). `pnpm test` 410/410; `pnpm check` 7/7. Dark-mode desktop password screenshot reviewed. Full browser suite not run.

## 2026-11-14 (Super Admin branding and formal labels)

- Sidebar now shows “Alumni Tracking System” and “Bukidnon State University - College of Technologies”, wrapping without truncation inside the existing width. Header fallback matches the product name.
- Extended title case across admin navigation, page/dialog headings, field labels, table headers, actions and placeholders. Shared labels also apply to other roles. Descriptions, instructions, status messages, stored names and data retain their original text/case; permission keys and guards are unchanged.
- Added a tested formatter only for system-defined permission/integration labels and admin browser coverage across twelve module routes, both themes and desktop/phone. Updated existing copy-sensitive selectors; no behavioral checks were removed.
- Verified: `pnpm check` 7/7, `pnpm test` 410/410. Focused admin/account/security/settings browser run passed 23 cases before the 480-second command limit; the remaining mobile Settings suite was rerun and passed 9/9 (30 distinct cases covered across runs). Initial selector mismatches and a transient Vite connection failure were corrected/retried. Full browser suite was not run. Desktop branding screenshot reviewed.

## 2026-11-14 (formal authentication-page capitalization)

- Landing headline, sign-in/sign-up headings, actions, field labels, optional disclosures, placeholders and browser title now use consistent title case. Full sentences, hints and validation messages retain sentence case. Shared account/settings labels are unchanged.
- Updated browser selectors and completed two-step navigation in the existing completion, dropdown and 320px-layout scenarios. The dropdown test budget is now 60 seconds for both themes, multiple popup axe scans and step navigation; no assertions were removed.
- Verified: six focused browser suites produced 30 passes and two dropdown timeouts at the original 30-second limit; rerunning dropdowns with the appropriate budget passed 2/2. `pnpm check` 7/7 with no warnings; `git diff --check` clean. Full browser suite and unit suite were not rerun for this copy-only revision.

## 2026-11-14 (organized sign-up and consistent auth spacing)

- Replaced the uneven single-page registration form with two focused steps: Personal details, then Studies & password. Continue validates without submitting; Back retains values and moves focus appropriately. All existing registration fields, optional disclosures, password guidance, Google availability and final CAPTCHA remain.
- Follow-up spacing correction: sign-up now uses the same 50/50 desktop split as sign-in, with the form centered in its panel. Both default steps fit 1366×768 without page scrolling; narrow screens can scroll naturally without clipping content.
- Verified: `pnpm exec playwright test tests/browser/signup.spec.ts tests/browser/signup-steps.spec.ts tests/browser/auth-layout.spec.ts` 20 passed (desktop/mobile, light/dark, axe, laptop fit, panel balance, registration and navigation). `pnpm check` 7/7; `pnpm test` 409/409. Rendered screenshots reviewed. Full browser suite not run.

## Sign-in spacing and typography

- Sign-in now has equal-width desktop panels with vertically centered brand content and a centered form. Sign-up initially kept its wider form panel; the follow-up above replaces that with the same equal split. Brand title is larger and bold on desktop and mobile; official imagery and authentication behavior are unchanged.
- Verified: `pnpm exec playwright test tests/browser/auth-layout.spec.ts` 4 passed (desktop/mobile, light/dark, axe, 320–1920px widths); focused formatting/lint passed. The combined sign-up regression run was interrupted after seven passing desktop checks and is not claimed complete.

## Sign-in branding copy update

- Swapped the desktop auth brand lines: “Alumni Tracking System” above “Bukidnon State University - College of Technologies”. Logo, styling, mobile branding and application behavior are unchanged.
- Verified: `pnpm exec vp check apps/web/src/components/layout/auth-layout.tsx` passes formatting/lint; `git diff --check` passes. Live browser rendering not checked.

## 2026-11-13 (theme, logo and alumni profile tabs)

- Official COT logo (round) and BukSU light/dark palette merged as PR #4 after PR #3 was squash-merged at `a68ce3d`.
- Alumni profile sections moved into tabs (see decisions). Settings uses the same `SectionTabs` bar, which now fills the width on phones. Empty tables no longer force sideways scrolling.
- Verified: `pnpm check` 7/7; `pnpm test` 404/404; new `tests/browser/profile-tabs.spec.ts` (tabs, address, Back/reload, keyboard, hidden Change history, axe light/dark, phone width) and the full browser suite.

## 2026-11-12 (clean and seeded deployment setup)

- `pnpm deploy:init` (clean) and `pnpm deploy:init --demo` (seeded, not in production) initialize an empty hosted database; README "Setup options" table and Atlas guide updated. `completion-local` updated for staff-only tracking.
- Verified: `pnpm test:deploy-init-local` PASS (clean, production, refusal of non-empty, refused production demo, seeded); `test:integrity-local`, `test:completion-db`, `test:forms-db` PASS; `pnpm check` 7/7; `pnpm test` 404/404.

## 2026-11-12 (sign-up contacts, audit User column, photo editor, PDF photo)

- Contacts card shows sign-up email, phone and Facebook (read-only). Audit log column "User" with email under the name; alumni-related audit summaries use the same plain language as Change history; "tracking.create" reads "Recorded tracking". Photo dialogs: large centered preview, live preview of the chosen file with zoom and drag, saved only on Upload (cropped to 512×512 in the browser). Profile PDF prints the current photo (64pt, rounded) beside the name.
- Verified: `pnpm check` 7/7; `pnpm test` 404/404; browser specs profile-tables, alumni-photo-tracking, account-system, department-audit, compact-ui, ownership, alumni-account, notifications pass on desktop and mobile.

## 2026-11-12 (profile polish: notifications, staff-only tracking, readable history, paginated tables)

- Notifications bottom-right (max 3, close button inside); local-testing banner removed; alumni header shows status under the program with a larger photo, Contacts beside Student details; Alumni no longer see or receive tracking status; employment, change history and faculty tables paginate (10/25/50); change history is plain language and fixes the "null →" employment entries; fixed phone pages widening to 597px when a table had hidden button labels.
- Verified: `pnpm check` 7/7; `pnpm test` 403/403; affected browser specs (profile-tables, alumni-photo-tracking, completion, notifications, ownership, account-system, settings) pass on desktop and mobile.

## 2026-11-12 (alumni photos, paginated tracking, Atlas runbook)

- Alumni detail header shows the profile photo; Super Admins and the directly assigned faculty tracker can upload, replace or remove it (audited `alumni.photo.remove`). Others who can view the alumnus only see it. Cross-user account-photo reads now require alumni scope.
- Tracking history is a server-paginated table (Date, Status, Tracker, Source, Notes; 10/25/50 rows; numbered pages; total count).
- Atlas: `docs/operations/MONGODB_ATLAS.md` covers hosted setup and the later presentation-data migration. Nothing was connected or migrated from this device.
- Note: this checkout had been reset to `2820a1d` (17 commits behind); it was fast-forwarded to `d83726d` before the work.

## 2026-11-12 (decluttered sign-up, Account and edit-heavy surfaces)

- Sign-up is now a calm single page with four numbered groups, optional middle name/suffix/Facebook disclosures, compact live password chips, and unavailable Google authentication omitted instead of disabled.
- Settings › Account is read-first: photo and account identity at the top, summary cards for personal details, contact, and sign-in/security, with each edit in a focused dialog. Alumni use the same account surface without changing existing security, verification, or ownership rules.
- The managed Alumni detail page now shows student details as a summary and moves editing into a dialog. A shared accessible `FilePicker` styles account-photo, evidence, and encrypted-backup inputs without replacing the native file control.
- The recurring `rate_limit_error` came from the external Anthropic model quota during rapid retries, not the application's authentication throttle. Production/default application limits were never disabled; temporary higher limits were scoped to individual development test processes only.
- Verified with default application limits: `pnpm check` 7/7; `pnpm test` 398/398; `pnpm test:browser` 87 passed, 1 skipped across desktop/mobile, light/dark, viewport and axe coverage; `pnpm check:secrets` clean; `pnpm audit --audit-level=moderate` found no known vulnerabilities; `git diff --check` clean.

## 2026-11-11 (close remaining gaps from the five-unit session)

- Backups: maintenance mode now allows only the sign-in essentials (config, me, login, logout, MFA status/verification, Google start/callback) plus Super Admin traffic; sign-up, password reset and profile writes get 503. Backups never copy `.env*`, `.tools`, `.git`, `node_modules` or key files even if `UPLOAD_DIR` is misconfigured. Manual backup failures notify all Super Admins. Optional off-host copy: with Google Drive enabled, the encrypted `.atsbak` is uploaded to the Drive folder (result shown per backup; a failed copy never fails the local backup). Restore from an uploaded `.atsbak` (Import and verify; must decrypt with this server's key). A server crash mid-restore is detected at startup: restore marked failed, stale lock released, maintenance kept on until a Super Admin ends it (audited).
- Fixed first-use TOTP step-up (`afterTimeStep` must not be -1).
- `/api/me/profile` returns the intended 409 for an unlinked Alumni account while every other access gate stays strict; `pnpm test:forms-db` now passes.
- Role note/name edits no longer sign out the role's members; permission changes still do. Role-change audit summaries store role names; old entries show "Unknown or retired role" instead of raw IDs.
- Success toast contrast fixed in the shared UI tokens; lint and Mongoose warnings removed.
- Proof added: HTTP restore with a real generated TOTP; env seeding and key rotation against the real replica set; `SCHEMA_VERSION` guard test (migration pipeline hash); `pnpm tools:mongodb` installs checksum-verified tools on Windows/Ubuntu and CI runs `test:backup-local` and `test:integrations-local`.
- Applied all six `/reflect` guardrails to `builder.md` and `CLAUDE.md`.
- Local `apps/server/.env` now has `INTEGRATION_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_DIR`, `MONGODB_TOOLS_DIR`.
- Verified: `pnpm check` green with zero warnings; `pnpm test` 380/380; `pnpm test:browser` 87 passed, 1 skipped (desktop-only viewport test on mobile); real-DB `test:backup-local`, `test:integrations-local`, `test:forms-db`, `test:completion-db`, `test:scope-local`, `test:security-db`, `test:faculty-local`, `test:contacts-local`, `test:reports-local`, `test:pentest-local` all PASS. CI changes are not yet run on GitHub. Nothing committed yet.

## 2026-11-09 (sign-up checklist, audit log, roles, integrations, backups)

- Unit 1: password rules (owner chose option B: 15–128 code points after NFC + uppercase, lowercase, number, special character or space) defined once in `password-policy.ts`; live accessible checklist on sign-up, reset, password change, Google password setup and Add user; submit disabled until met; server common/breach errors shown inline. Compact one-page sign-up (Google first, Personal/Contact/Academic/Account grid); button fully visible at 1440×900.
- Unit 2: Alumni see only their own audit entries (never unscoped); actor role names recorded at event time ("Not recorded" for old entries); readable action labels and summaries (field labels, role and permission names) with a coverage test over every audit call site; Actor shows the name, email only in details; Record column removed; Audit log in Alumni navigation.
- Unit 3: Super Admin "Edit role" on Members with exact permission-set matching (`role-match.ts`) and "Create a new role with these permissions"; existing server guards unchanged; role "Description" shown as "Note" on cards, picker and editable detail view, duplicate-name warning.
- Unit 4: integration credentials stored AES-256-GCM encrypted in `IntegrationSetting` under env-only `INTEGRATION_ENCRYPTION_KEY`; write-only API (hints only); enable requires all fields + format check + provider connection test; disable erases in one transaction; Forms secret generated and shown once; missing rows mean disabled (migration keeps old implicit values on existing deployments); old PATCH toggle removed; email gateway sends a bearer key; key rotation CLI; `docs/operations/INTEGRATIONS.md`.
- Unit 5: encrypted, verified backups (mongodump archive + local upload files + manifest) in `BACKUP_DIR`; schedule (off/daily/weekly, Asia/Manila, retention) with a DB slot claim and lock; failure notifications and audit; in-app restore with step-up MFA + `RESTORE`, pre-restore backup, maintenance mode (503), mongorestore --drop, file swap, migrations, session invalidation, automatic rollback; Settings › Backups page. MongoDB Database Tools 100.20.1 installed in ignored `.tools/` (SHA-256 verified).
- Verified: `pnpm check` green (1 pre-existing lint warning); `pnpm test` 370/370 (was 280); `pnpm test:browser` 87 passed, 1 skipped (desktop-only viewport test on mobile); `pnpm test:integrations-local` PASS; `pnpm test:backup-local` PASS; `pnpm test:scope-local` PASS; `pnpm test:completion-db` PASS; `pnpm test:security-db` PASS. `pnpm test:forms-db` fails at forms-local.ts:283 identically on untouched HEAD (pre-existing).
- Not done / follow-ups: optional Google Drive off-host copy of backups; restore from an uploaded file; any role update (even a note) still revokes that role's members' sessions; existing local `.env` files need `INTEGRATION_ENCRYPTION_KEY` (and backup keys) added by hand; nothing committed yet (work backed up under `refs/backup/*`).

## 2026-11-09 (UI overhaul and structure cleanup)

- Structure: `.gitattributes` forces LF (fixed `pnpm check` on Windows); removed dead files and stale Prisma ignores; moved server check scripts and the browser fixture to `apps/server/test/`; folded `modules/programs` into `modules/academic`; dropped api re-export shims; moved the api model fixture to `src/test-utils` and db CLI scripts to `src/cli`; merged web `utils/` into `lib/` and grouped components by feature (`page-header.tsx` split into `layout/page.tsx`, `forms/form-layout.tsx`, `data/filter-bar.tsx`).
- UI: new navy/near-white token set and component polish; grouped navy sidebar with breadcrumb header; split brand panel on login, reset, security and complete-profile; `StatTile`, `ErrorAlert` and `ConfirmDialog` used across pages; every `window.confirm` replaced.
- Verified: `pnpm check` green (1 pre-existing lint warning), `pnpm test` 280/280, `pnpm test:browser` 74/74 (desktop + mobile, axe WCAG 2.2 AA light/dark). Baseline before the work was also 74/74 once Playwright Chromium was installed.
- Next: decide whether to rename the package scope and relocate server-coupled tests in `packages/api` (both deferred).

## 2026-11-09

- Set up orchestrator/worker workflow: CLAUDE.md, builder and reviewer agents, reflect skill, these docs.
- Unignored `CLAUDE.md`, `.claude/agents/` and `.claude/skills/` so the team shares them.
- Verified: `git check-ignore` confirms the new files are tracked and `.claude/settings.local.json` stays ignored.
- Branch: development/phase6-cross-device-testing at f6a9be3.
- Next: pick the next phase 6 task.
