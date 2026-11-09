# Alumni Tracking System

Role-based alumni tracking app. Academic hierarchy: College → Department → Program.
Roles: Alumni (own profile/employment/evidence), Faculty tracker (assigned alumni),
Department/College head (faculty and assignments in scope), Staff (evidence review),
Super Admin (accounts, permissions, audit, integrations).

Stack: pnpm 12.5.1 workspace, Node 26.10.0 (`.node-version`). React/Vite + TanStack
Router/Query (`apps/web`), Express REST + Mongoose (`apps/server`), MongoDB replica set
on local port 27018. Tooling via `vp` (vite-plus). Active branch line: phase 6, cross-device testing.

## Session protocol

- Start: read this file, `docs/progress.md`, `docs/decisions.md`, `docs/known-issues.md`.
- End: update `docs/progress.md`, append new decisions and gotchas, run `/reflect`.
  Apply skill or CLAUDE.md edits only after the user approves them.

## Orchestrator and workers

- The main session is the orchestrator. It plans, writes briefs and checks results.
  It does not do bulk work when a worker can do it.
- Workers are subagents on Haiku: `builder` (writes code) and `reviewer` (checks a diff against a brief).
- Every brief uses this shape:

  ```
  Goal: <one outcome>
  Files to read: <paths>
  Constraints: <what not to touch, conventions to follow>
  Done when: <command that exits 0, or an observable result>
  ```

- Before accepting any worker output, the orchestrator runs the "Done when" check itself.
  If it fails, send the work back to the same worker with the failing output.
- Never pass a worker's report to the user unchecked.
- (added) Diffs touching auth, RBAC/scope (`packages/api/src/scope.ts`, `access.ts`,
  `permission-groups.ts`), MFA, file access or migrations: the orchestrator reads them line
  by line. A passing check does not prove authorization is intact.

## Checks

| Command | What it covers |
| --- | --- |
| `pnpm check` | format/lint (`vp check`) + typecheck all packages |
| `pnpm lint` | lint only |
| `pnpm test` | local test suite (`scripts/test-local.mjs`) |
| `pnpm test:browser` | Playwright suites in `tests/browser` |
| `pnpm test:scope-local`, `test:faculty-local`, `test:reports-local`, ... | focused server checks against local DB |
| `pnpm run doctor` | local environment health |

## Folder map

```
apps/server/src/          Express app, middleware, *-local.ts check scripts
  modules/<domain>/       academic, account-photos, alumni, audit, auth, faculty,
                          files, integrations, notifications, reports(+pdf), roles, users
apps/web/src/             React app: routes/ (TanStack, _app = signed-in shell),
                          components/, lib/, utils/
packages/api/             access, scope, RBAC, validation, errors, shared services
packages/contracts/       shared zod contracts (auth, alumni, academic, audit, ...)
packages/db/              Mongoose models and DB connection
packages/ui/              shared UI components (cn helper in src/lib)
packages/config/          shared tsconfig base
scripts/                  setup, doctor, dev workflow, provisioning, rehearsal checks
tests/browser/            Playwright specs
config/staging/           staging config
docs/                     setup, operations, migrations, plus progress/decisions/known-issues
.tools/                   local-only secrets (local-login.txt), never commit
.claude/agents/           builder.md, reviewer.md
.claude/skills/reflect/   end-of-session reflection skill
```
