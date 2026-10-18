# Initial codebase audit

The findings below record the source before remediation. The active checkout was subsequently restored and pushed at `2c2ab14`. See [change-report.md](change-report.md), [test-report.md](test-report.md), and [deployment.md](deployment.md) for current implementation and verification status.

Reviewed on 2026-10-18 against locally available `origin/main` at `b589a9a`. These findings come from source inspection, not exploit or browser testing.

## Checkout correction

The active workspace is local `main` at `056b62f` and tracks only `README.md`. The application source exists in `origin/main`, local `LeadDev-Luzon`, and the detached worktree at `C:/Users/Zul/.local/share/kilo/worktree-pool/collab-d8202160370d/mountain-dinghy` (`b589a9a`). The initial audit missed these refs. No branch was switched or reset.

## Confirmed architecture

React, TanStack Router and Query, shared Base UI/shadcn-style components, Tailwind, and Lucide. Hono serves raw authentication/file routes alongside oRPC. Prisma models MongoDB documents and join collections. Roles resolve into a union of explicit permission keys per authenticated request. Authentication uses password verification, database sessions, and HTTP-only cookies on raw login routes. Integrations include Google OAuth, Drive, Sheets, Forms, reCAPTCHA, email, imgBB, and local storage.

## Findings

| Severity | Source at reviewed commit                                                         | Finding                                                                                                                                                                                                              | Remediation                                                                                            |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| High     | `packages/api/src/routers/rbac.ts:134`, `:177`, `:220`                            | User list/create/update return full Prisma user records, exposing `passwordHash` to user administrators.                                                                                                             | Select only safe response fields and test output.                                                      |
| High     | `packages/api/src/routers/rbac.ts:150`, `:192`, `:247`, `:281`                    | User writers can assign arbitrary roles; role writers can assign arbitrary permissions. There is no comparison to caller authority, allowing delegated operators to escalate privileges.                             | Validate assignable roles and permissions against caller authority, including protected roles.         |
| High     | `apps/server/src/index.ts:190`, `:208`                                            | Google OAuth generates and validates no browser-bound state, permitting login CSRF.                                                                                                                                  | Generate, expire, consume, and validate browser-bound state before token exchange.                     |
| High     | `apps/server/src/index.ts:273`, `:346`; `packages/api/src/services/session.ts:54` | Raw file routes check user presence and permissions, but not active status. Session loading returns disabled users, unlike the oRPC active-account gate. Existing sessions can retain file access after disablement. | Share active-account enforcement with raw routes and revoke sessions when disabling.                   |
| High     | `packages/api/src/routers/rbac.ts:204`, `:291`                                    | Assignment updates delete joins before recreating them outside a transaction. Failures can leave assignments empty. There is no expected-version check for concurrent edits.                                         | Use atomic replacement with optimistic concurrency and conflict responses.                             |
| High     | `packages/api/src/routers/rbac.ts:192`, `:281`                                    | Updates can remove or disable the last administrator, or clear system-role permissions. Only role deletion checks `isSystem`. Existing tests explicitly accept these unsafe cases.                                   | Enforce protected-role and last-administrator invariants atomically; update tests.                     |
| High     | `apps/server/src/index.ts:292`, `:375`                                            | Upload validation trusts client MIME metadata and downloads serve the stored type inline without sniffing protection. Size validation follows multipart parsing.                                                     | Validate content, bound request bodies before parsing, and use safe download headers.                  |
| Medium   | `packages/api/src/integrations/files.ts`; `packages/api/src/routers/dashboard.ts` | Storage/email/Sheets actions do not consistently check persisted integration enablement. Disabling a service does not reliably prevent use.                                                                          | Enforce enablement inside provider operations and test disabled paths.                                 |
| Medium   | `packages/api/src/routers/rbac.ts:192`; `packages/api/src/routers/dashboard.ts`   | Account disablement uses `users.write`, not `users.delete`; `reports.read` has no protected oRPC procedure.                                                                                                          | Reconcile backend guards, catalog descriptions, and frontend data queries.                             |
| Medium   | `apps/web/src/routes/_app/roles.tsx:25`                                           | Refetched role data overwrites local edits through an effect. Groups, master toggles, mixed states, dirty indicators, and conflict handling are absent.                                                              | Implement accessible groups with isolated drafts, clear persistence state, and stale-update rejection. |
| Medium   | `apps/web/src/components/app-shell.tsx`; routes                                   | Integrations, users, and roles are separate destinations. No Settings route exists in the reviewed tree.                                                                                                             | Introduce Settings within existing routing and preserve compatible URLs.                               |

Global alumni/file permissions are the current model; assignments have no tenant or department scope. Scope changes need a confirmed domain requirement. User accounts and alumni records are separate, so self-service ownership cannot safely be inferred from an alumni ID.

## Verification

- Inspected manifests, Prisma schema, permission definitions, oRPC middleware, RBAC routers/tests, session service, Hono routes, storage, dashboard/integration routers, roles UI, integration UI, and navigation with `git show origin/main:<path>`.
- Confirmed refs and worktrees with `git branch --all`, `git log --all`, `git ls-tree`, and `git worktree list`.
- The active workspace lacks source/manifests; the source worktree lacks installed `node_modules/.bin/tsx.cmd` and generated Prisma client. `pnpm` is unavailable on the inspected command PATH. Tests, typechecks, build, dependency audit, and browser verification were not run. No passing baseline is claimed.
- The manifest declares `pnpm@12.5.1`, `pnpm test`, `pnpm check-types`, `pnpm lint`, and `pnpm build`. Establish a writable source checkout, provision the declared package manager, install with the existing lockfile, generate Prisma using project scripts, and run these gates before implementation.
- No credentials were printed or modified, no database was contacted, and no external-provider requests were made.
- Root ignore rules protect local environment files, dependencies, build outputs, and caches. `git check-ignore` verified environment and dependency paths.

## Status

This initial assessment has been followed by implementation and local verification; consult the linked reports. No deployment was performed. Real database durability, external providers, and operational readiness still require staging verification.
