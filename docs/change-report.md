# Change report

## Settings and RBAC

- Added the Settings route layout and Account page; moved existing Members, Roles, and Integrations components under it. Compatible old URLs redirect. Navigation remains permission-aware at desktop/mobile sizes.
- Added account name updates and password changes requiring the current password, with other-session invalidation.
- Added shared permission grouping helpers and an editor with master checkboxes, independent permissions, accessible mixed states, saved/dirty state, preserved failed drafts, explicit reload on conflicts, and role-switch confirmation. Only permissions the caller may grant are applicable to group controls.
- Added atomic role/user assignment transactions, safe user projections, permission/role scope checks, unique assignment validation, and audit records. `roles.update` now requires `expectedUpdatedAt`; stale version claims fail before assignments are removed. MongoDB transaction conflicts return a conflict response.
- Protected the Super Admin role from editing and its account assignments from removal/disablement in the application. Only Super Admin can manage system roles. The stronger invariant prevents last-administrator lockout without a count-and-update race; intentional administrator decommissioning needs an operator procedure.
- Account status moved from `users.update` to `users.setStatus`, requiring `users.delete`; the UI uses the new API. Added `reports.summary` under `reports.read`, so report viewing does not depend on dashboard permissions.

## Authentication, files, and integrations

- Public signup and new Google registration are disabled in production unless `ALLOW_PUBLIC_SIGNUP=true` is explicitly configured. When allowed, they receive Viewer access. This avoids automatically granting global alumni/file read access to unprovisioned public users. Bootstrap administrators use private seed variables; removed public demo credentials from the login form and current setup instructions. Existing database passwords are unchanged.
- Google OAuth uses an expiring browser-bound state cookie, validates it before token exchange, requires verified email, and rechecks integration enablement. Raw routes use shared validation, origin checks, secure headers, bounded bodies, auth rate limits, and generic internal errors. Session resolution rejects disabled accounts.
- Added content-signature checks, CSV text checks, randomized private storage keys, path containment, safe download disposition, and no-store headers. Legacy binary DOC/XLS uploads are no longer accepted; DOCX/XLSX remain supported when content matches. File signature checks are not malware scanning.
- Evidence links and storage keys are excluded from alumni responses; evidence metadata requires `files.read`. Downloads proxy private Drive content through authorization. Only intentionally public imgBB profile photos may expose provider URLs. Local/Drive profile images reference the protected API.
- Integration enablement is enforced on email, Sheets, and upload provider selection. Configured status explicitly says unverified. Unconfigured email fails without logging recipient/message contents. Email supports an HTTPS JSON gateway, not direct SMTP. Added provider timeouts and spreadsheet formula neutralization in CSV exports.
- Seed defaults preserve editable role assignments, repair protected administrator permissions, and omit demo data unless enabled in development. Removed unsupported MongoDB migrate scripts. No Prisma schema fields changed and no live database mutation was performed.

## Dependencies, design, and tooling

- Fixed duplicate workspace YAML keys and misplaced build approval configuration.
- Added MIT-licensed `file-type` for content detection and `hono-rate-limiter` for authentication abuse limits, retaining existing Hono, oRPC, Zod, Prisma, and Base UI.
- Added Playwright and axe test tooling. The fixture server uses real routes and synthetic adapters; it cannot start outside test mode and is not imported by production.
- Removed the scaffold CLI dependency. Its existing stylesheet is retained unmodified as `packages/ui/src/styles/shadcn.css`, with the MIT license/provenance alongside it. Shared components still use the existing cn utility.
- Applied patched transitive dependencies for deepmerge-ts, source-map-js, seroval, and tinypool. Prisma's configuration uses ordinary object deepmerge; version 8 changes for Map merging are not used here. Generation/build checks verify the installed combination. Vite+ reports peer semver warnings because its replacement package identifies itself as 0.3.1; runtime builds and browser checks are the compatibility evidence.
- Card titles now use heading semantics; permission checkboxes display a distinct partial indicator; pending buttons cannot be re-enabled by spread props. Developer tools are gated to development. Fixed pre-existing optional-ID type errors in faculty/program editing.
- Extracted a testable Hono app factory and added live/readiness endpoints. Server builds copy platform-specific Prisma engines beside the bundle.
- Added a conservative secret-pattern check, environment examples, deployment guide, and test/change reports. Private environment files, dependency caches, screenshots/traces, and generated outputs remain ignored.

## Screenshot comparison and limits

The supplied images are Plaky requirement lists for Admin, User/Alumni, and Staff/Coordinator; they are not screenshots of the application. Their feature labels were used to check workflows, not to copy Plaky's board layout. Existing alumni/academic/employment/tracking/import/export APIs and pages remain. Account settings, permission enforcement, and grouped role controls address concrete gaps.

Self-service alumni ownership is still unspecified: user accounts have no relation to alumni records. No ownership association was invented. Department/tenant-scoped RBAC is not part of the current schema. Large-list pagination, dashboard query optimization, webhook replay handling, retention/purge, quotas, malware processing, and multi-instance infrastructure remain documented follow-up work. Full feature completion or production readiness is not claimed.

## Dependency reference checks

Compatibility and implementation choices were checked against the [file-type API and limitations](https://github.com/sindresorhus/file-type), [Hono body-limit API](https://hono.dev/docs/middleware/builtin/body-limit), [Base UI checkbox semantics](https://base-ui.com/react/components/checkbox), [Google reCAPTCHA display API](https://developers.google.com/recaptcha/docs/display), and [deepmerge-ts 8 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0). The dependency advisory results are observations from the recorded pnpm audit, not proof of complete application security.
