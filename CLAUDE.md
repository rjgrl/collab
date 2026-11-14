# Alumni Tracking System

Role-based alumni tracking app. Academic hierarchy: College → Department → Program.
Roles: Alumni (own profile/employment/evidence), Faculty tracker (assigned alumni),
Department/College head (faculty, assignments, evidence and audit in scope),
Super Admin (accounts, permissions, audit, backups, integrations). Only Super Admins
administer; the admin, staff and viewer roles were removed.

Stack: pnpm 12.5.1 workspace, Node 26.10.0 (`.node-version`). React/Vite + TanStack
Router/Query (`apps/web`), Express REST + Mongoose (`apps/server`), MongoDB replica set
on local port 27018. Tooling via `vp` (vite-plus). Active branch line: phase 6, cross-device testing.

## Session protocol

- Start: read this file, `docs/progress.md`, `docs/decisions.md`, `docs/known-issues.md`.
- End: update `docs/progress.md`, append new decisions and gotchas.
  Apply CLAUDE.md edits only after the user approves them.

## Change rules

- Do the work in this session; do not delegate to subagents.
- When a change removes or replaces a guard, route or compatibility path, confirm with a grep
  that finds nothing (for example, the removed route string).
- Diffs touching auth, RBAC/scope (`packages/api/src/scope.ts`, `access.ts`,
  `packages/contracts/src/permission-groups.ts`), MFA, file access or migrations are read
  line by line. A passing check does not prove authorization is intact.

## Checks

| Command                                                                  | What it covers                                                                                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                             | format/lint (`vp check`) + typecheck all packages                                                                                                   |
| `pnpm lint`                                                              | lint only                                                                                                                                           |
| `pnpm test`                                                              | local suite; only `packages/*/src/**/*.test.ts` and top-level `apps/server/src/*.test.ts` (put server-module tests in `packages/api/src/services/`) |
| `pnpm openapi`                                                           | regenerate `docs/api/openapi.json` after changing `packages/contracts/src/api-routes.ts` or a contract (`pnpm test` fails while it is stale)        |
| `pnpm test:browser`                                                      | Playwright suites in `tests/browser`                                                                                                                |
| `pnpm test:scope-local`, `test:faculty-local`, `test:reports-local`, ... | focused server checks against local DB                                                                                                              |
| `pnpm db:check-references`                                               | read-only scan for references to missing records; exits 1 if any                                                                                    |
| `pnpm run doctor`                                                        | local environment health                                                                                                                            |

## Folder map

```
apps/server/src/          Express app, middleware
  modules/<domain>/       academic, account-photos, alumni, audit, auth, backups, faculty,
                          files, integrations, notifications, reports(+pdf), roles, users
apps/server/test/         browser-fixture.ts (Playwright API), local/*-local.ts check scripts
apps/web/src/             React app: routes/ (TanStack, _app = signed-in shell),
                          components/{layout,data,forms,feedback,account,alumni,settings},
                          lib/ (api client, session, helpers)
packages/api/             access, scope, RBAC, validation, errors, shared services;
                          src/test-utils/ holds the in-memory model fixture for tests
packages/contracts/       shared zod contracts (auth, alumni, academic, audit, ...)
packages/db/              Mongoose models and DB connection; src/cli/ seed, migrate, verify
packages/ui/              shared UI components, design tokens in src/styles/globals.css
packages/config/          shared tsconfig base
scripts/                  setup, doctor, dev workflow, provisioning, rehearsal checks
tests/browser/            Playwright specs
config/staging/           staging config
docs/                     setup, operations, migrations, plus progress/decisions/known-issues
.tools/                   local-only secrets (local-login.txt), never commit
```
