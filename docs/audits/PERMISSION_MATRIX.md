# Permission and privacy decision matrix

2026-10-19. Source: `packages/db/src/permissions.ts`, routers, `requirePermission`, session loading and raw file handlers. This lists **all 26 currently defined permission keys** for the three default presets. It does not read private databases or assume live/custom assignments equal presets. Custom roles grant their explicit keys; multiple roles union their keys. No new role, ownership or department policy was introduced.

All protected permissions additionally require an active session and completed required verification. Privileged accounts (super_admin or users/roles/permissions/integrations keys) require verified MFA before protected operations. Thus Staff requires MFA under the current default integration grants. MFA does not create missing permissions.

| Permission         | Super Admin preset | Staff preset | Viewer preset | Resource / operation scope                                                                |
| ------------------ | ------------------ | ------------ | ------------- | ----------------------------------------------------------------------------------------- |
| users.read         | Yes                | No           | No            | Global account directory, safe projection                                                 |
| users.write        | Yes                | No           | No            | Account create/update and scoped role assignment                                          |
| users.delete       | Yes                | No           | No            | Account status; protected-admin safeguards                                                |
| roles.read         | Yes                | No           | No            | Global role catalog                                                                       |
| roles.write        | Yes                | No           | No            | Scoped role/grant changes                                                                 |
| roles.delete       | Yes                | No           | No            | Non-system role deletion; last-admin safeguards                                           |
| permissions.read   | Yes                | No           | No            | Permission catalog                                                                        |
| departments.read   | Yes                | Yes          | Yes           | Global academic directory                                                                 |
| departments.write  | Yes                | Yes          | No            | Academic create/update                                                                    |
| departments.delete | Yes                | Yes          | No            | Academic soft deletion                                                                    |
| programs.read      | Yes                | Yes          | Yes           | Global program directory                                                                  |
| programs.write     | Yes                | Yes          | No            | Program create/update                                                                     |
| programs.delete    | Yes                | Yes          | No            | Program soft deletion                                                                     |
| alumni.read        | Yes                | Yes          | Yes           | Global profiles, contact/employment/tracking data; optional filters are not access scopes |
| alumni.write       | Yes                | Yes          | No            | Global profile/employment edits; no owner binding                                         |
| alumni.delete      | Yes                | Yes          | No            | Global soft deletion                                                                      |
| tracking.write     | Yes                | Yes          | No            | Global alumni tracking updates                                                            |
| files.read         | Yes                | Yes          | Yes           | Global authorized evidence metadata/downloads, excluding deleted files                    |
| files.write        | Yes                | Yes          | No            | Evidence/photo uploads to any active alumni record                                        |
| files.delete       | Yes                | Yes          | No            | Evidence soft deletion                                                                    |
| dashboard.read     | Yes                | Yes          | Yes           | Global/optionally filtered aggregate statistics                                           |
| reports.read       | Yes                | Yes          | Yes           | Global report totals                                                                      |
| reports.export     | Yes                | Yes          | No            | CSV/Sheets contact-data exports, bounded to 10,000 rows                                   |
| integrations.read  | Yes                | Yes          | No            | Provider status (not secret values)                                                       |
| integrations.write | Yes                | Yes          | No            | Integration enablement, imports, notifications/test mail when configured                  |
| audit.read         | Yes                | No           | No            | Global operational audit events                                                           |

| Other surface                                                 | Authorization rule                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Own profile/name, verification, password, MFA setup/challenge | Session's user ID; caller-supplied userId is not trusted. Limited onboarding sessions can complete their own security setup       |
| Login/signup/reset entry points                               | Public where enabled, schema/CAPTCHA/account/IP budgets and possession proofs as appropriate                                      |
| Google Forms webhook                                          | Explicit integration enablement, configured shared secret, stable submission ID, validated business payload; no browser role used |
| Public health/config/session inspection                       | Deliberately public, projected fields; anonymous auth.me returns null                                                             |

## Executed synthetic scenarios

`pnpm test:forms-db` seeds these exact presets into a newly generated loopback database and enrolls Admin/Staff through the actual MFA endpoints. It verifies pre-MFA denial, Viewer users/export/delete denials, Staff users denial and export success, Admin users success, and profile userId manipulation that updates only the caller. A Viewer reading another synthetic alumnus succeeds, matching current global permission policy. Earlier [TCP matrix](PENTEST_SURFACE.md) and rerun Node RBAC/authorization regressions cover additional selected denials, role grant limits and protected-admin invariants. This is not the complete Cartesian resource/action/role/race matrix.

## Owner decisions still required

- Approve or replace global Viewer alumni contact/employment/evidence access, including the default files.read grant. Department filters and hidden buttons do not establish isolation.
- Approve Staff integration/notification/export authority and its MFA requirement. Define custom-role review and account deprovisioning owners.
- Define retention/erasure for alumni, evidence, jobs, logs, verification challenges, sessions, throttle buckets, backups and Forms receipts. Soft deletion retains personal information. Receipt hashes support linkage and are not proof of anonymization.
- Decide consent/lawful basis, data subject processes, export/download audit requirements, public-image hosting, least-privilege database/backup access and approval workflow for institutional policy changes.

These are policy/release decisions, not demonstrated IDOR vulnerabilities. No cross-department or ownership guarantee is claimed by current code.
