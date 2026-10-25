# Local-testing follow-up

Implemented 2026-10-23 from the latest four explicit user requests. This supersedes earlier local Admin MFA, delegated Staff integration and Faculty acceptance behavior. It extends the existing working tree; no deployment, database reset or account replacement occurred.

## Current behavior

- `LOCAL_DISABLE_MFA=true` permits an unenrolled Administrator to enter the application in managed local development. It is enabled in the private working server environment and the isolated normal role demo. Existing factors/recovery codes remain; identity responses honestly keep `mfaVerified=false` until verification occurs. Setting false/unsetting and restarting restores mandatory Administrator MFA. Runtime validation rejects the pause in production or outside the managed loopback database target.
- Integrations are Administrator-only in Settings navigation, direct page entry and all management service actions, including imports and Sheets exports. Effective permissions are still required. Historical Staff integration grants cannot bypass the role boundary. New Staff presets omit both integration permissions; authorized Staff CSV reporting remains available. Provider webhook authentication is unchanged.
- Faculty navigation, page, typed client/contracts and REST module are removed. `/api/faculty` returns 404. Legacy MongoDB models, records, collection/index definitions and historical requirements are retained without destructive migration.
- The top-right account name has a readable role underneath on desktop/mobile. Administrator takes display precedence for mixed accounts. This visual subtitle does not change authorization.

## Verification

| Check | Observed result |
| --- | --- |
| `pnpm test` | 202 passed, zero failures/skips |
| `pnpm test:browser` | 52 passed across desktop and mobile |
| `pnpm test:roles-local` | Existing generated Administrator, Staff and Alumni accounts sign in through the normal UI; persisted identity, role subtitles, Admin-only integrations and session revocation verified |
| `pnpm test:completion-db` | Real synthetic MongoDB registration, concurrency, ownership, employment/files, Faculty 404 and report/privacy acceptance passed |
| `pnpm test:forms-db` | Synthetic Forms transaction/replay acceptance passed |
| `pnpm test:pentest-local` | Local synthetic transport/security checks passed |
| Build, type checks, lint and browser type checks | Passed |
| Secret and production/server artifact checks | Passed |
| Graphify AST refresh and whitespace checks | Passed; 1,845 nodes / 5,099 edges / 106 communities, valid JSON |

The new browser regressions prove first login with **no authenticator enrollment**, restore strict enforcement, and deny a Staff account that deliberately retains both historical integration grants. They also check role placement, viewport overflow, Admin accessibility, hidden Staff controls, preserved CSV exports and Faculty 404. Representative screenshots are in `test-results/*local-testing*/`; normal-role artifacts remain private under `.tools/role-browser/` and must not be shared because other artifacts there may contain secrets.

Test logs are under `graphify-out/local-follow-up-*.log`. Existing Mongoose reserved-path and React script-element warnings remain; these checks do not claim production readiness or live provider delivery. No real messages or external provider changes were performed.

See [decision 0002](decisions/0002-local-testing-and-alumni-scope.md), [account security](operations/ACCOUNT_SECURITY.md) and [current traceability](FEATURE_MATRIX.md).
