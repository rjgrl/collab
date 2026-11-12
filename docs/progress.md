# Progress

Newest first. One entry per session: date, what changed, what was verified, what remains.

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
