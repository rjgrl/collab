# Developer guide

## Stack and boundaries

| Location                            | Responsibility                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web`                          | React/Vite, TanStack Router/Query, existing Tailwind/shadcn UI                                      |
| `packages/contracts/src`            | Browser-safe Zod request/response schemas, name formatting and role predicates                      |
| `apps/web/src/utils/api.ts`         | Typed REST fetch client with request and response validation                                        |
| `apps/server/src/app.ts`            | Express composition, security headers, origin/CSRF controls, parsers, throttling and route mounting |
| `apps/server/src/index.ts`          | Configuration, database connection, listener, timeouts and graceful shutdown                        |
| `apps/server/src/middleware`        | Authentication, authorization, validation, request context and centralized errors                   |
| `apps/server/src/modules/<feature>` | Explicit HTTP routes, thin controllers and business services                                        |
| `packages/api/src/services`         | Shared sessions, passwords, verification, MFA, authorization, imports and webhook logic             |
| `packages/api/src/integrations`     | Server-only provider adapters                                                                       |
| `packages/db/src/models.ts`         | Typed Mongoose schemas, exact legacy collection names and index declarations                        |
| `packages/db/src/migration.ts`      | Read-only inspection and explicit additive index application                                        |

The frontend imports no database models or Node-only server code. Hono, oRPC and Prisma runtime dependencies are removed. Historical requirements/audits retain their original terminology as dated evidence; the original Prisma schema is archived under `docs/migrations`.

## Request flow

Browser -> typed REST client -> Express security/session middleware -> explicit route and guards -> controller validation -> feature service -> Mongoose models/transaction -> public DTO -> response validation -> TanStack Query.

Examples: `GET/POST /api/alumni`, `GET/PATCH/DELETE /api/alumni/:id`, `POST /api/alumni/:alumniId/employments`, `POST /api/alumni/:alumniId/tracking-events`, `GET/PATCH /api/me/profile`, `POST /api/users/:id/alumni-link`, `GET /api/dashboard`, and `GET /api/reports/alumni.csv`. Academic, users, roles, permissions, files, audit and Admin-only integrations have explicit REST modules. `/rpc` and `/api-reference` return 404.

List requests are bounded and paginated. Academic management screens have page controls; selection lists follow all option pages. Search text is escaped before regex construction. ObjectIds must be 24 hexadecimal characters. Mutation contracts reject unknown fields and URL/body identifier conflicts.

## Data and ownership

Relationships remain `User -> UserRole -> Role -> RolePermission -> Permission`, `Department -> Program -> Alumni`, `Faculty -> FacultyDepartment -> Department`, and `Alumni -> Employment/TrackingEvent/EvidenceFile`.

`User.alumniId` is an additive explicit ownership relationship. An absent link grants no ownership. Public registration creates and links a new profile atomically; Google profile completion does the same after essential academic details are confirmed. An authorized Administrator links a legacy account/profile after identity review. A partial unique index rejects duplicate claims. Names and emails are never used to discover ownership.

Alumni (`viewer` or `alumni`, without Staff/Administrator roles) can access My Profile, account settings and privacy-safe aggregate statistics. Historical broad read permissions do not expose the directory or management screens. Every self-service lookup resolves the current database relationship. Owned employment and file writes use dedicated `/api/me` routes. Private evidence always checks the active parent and ownership; management file routes additionally require file permissions.

Account structured names are authoritative and synchronize linked profiles in a transaction. Legacy display names remain intact until explicitly confirmed. My Profile allows only names, gender, mobile number and Facebook URL; academic identifiers, student numbers, tracking, account status, roles and linkage are privileged. Owned employment/photo/evidence have separate strict contracts and shared business services.

## Security, persistence and errors

Authentication validates session digests, expiry/idle timeout and active status. Authorization adds contact/profile completion, applicable MFA, permission and ownership checks. Staff/Alumni never require MFA due to permissions or enrollment history. Administrator roles require it even in mixed-role accounts. Administrator MFA is waived only when LOCAL_DISABLE_MFA=true in managed local development; normal/production enforcement remains. Contact-policy exemptions are separate, explicit, managed-local-only and rejected in production.

Cookie mutations require the exact configured Origin, or a same-origin Referer when Origin is absent. Production cookies are Secure, HttpOnly and host-prefixed. Password/breach checks, MongoDB throttles, MFA replay protection, Google state/verified-email checks, upload limits/signatures, private storage and audits are preserved. Successful sign-in clears previous private query caches.

Errors use `{ error, code, requestId }`: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, 413 oversized, 429 throttled, 500 unexpected failure, 503 unavailable database/provider. Internal diagnostics, hashes, tokens and storage keys are withheld.

Native `{ deletedAt: null }` includes absent and explicit null values. Mongoose connection transactions propagate sessions through async-local storage and reuse nested service scope. Operations within a transaction run sequentially, as required by [Mongoose transaction guidance](https://mongoosejs.com/docs/transactions.html#note-about-parallelism-in-transactions). Readiness requires a writable replica-set primary and, in production, configured/enabled contact verification providers. Index mutation is disabled at startup and follows the migration runbook.

## Verification

Use `pnpm install --frozen-lockfile`, `pnpm setup:local`, `pnpm doctor`, then `pnpm dev`. Existing populated databases are inspected without schema/seed writes; review a dry-run before explicitly updating one.

Run `pnpm test`, `pnpm check-types`, `pnpm lint`, `pnpm test:browser-types`, `pnpm test:browser`, `pnpm build`, `pnpm check:production-build`, `pnpm check:server-build` and `pnpm check:secrets`. Real-database acceptance uses fresh synthetic loopback namespaces. See [the defense guide](../DEFENSE_GUIDE.md), [migration runbook](../migrations/MONGOOSE_REST.md) and [verification record](../MIGRATION_VERIFICATION.md).

## Completion module interfaces

- `contactVerificationPolicy` owns strict/default and managed-local policy; `accountAccessPending` combines applicable contact gates with independent password/completion requirements.
- `createRegistrationProfile` runs inside its caller's Mongoose transaction. User, Alumni, UserRole and audit persist together or all roll back.
- `employmentService` shares create/update/remove rules for self and management routes. An Alumni revision write serializes current-job changes; uploads with job references take the same parent write before rechecking ownership.
- `EvidencePanel` and `EmploymentPanel` are shared actual API consumers. Self mode omits an alumni ID; the server resolves the stored relationship.
- `summarizePopulation` is shared by guarded management dashboard/reports and the aggregate service. Only the aggregate service strips registered/profile details and applies cohort/complement suppression.

See [completion decisions](../decisions/0001-account-profile-policy.md) and [current evidence](../COMPLETION_VERIFICATION.md). Shared Zod contracts are transport boundaries, not a replacement for service authorization or database uniqueness.

Faculty screen/client/contracts/REST modules are retired. Legacy models and collection/index metadata remain for data preservation. The top-right role subtitle is presentation-only. See [current local-testing follow-up](../LOCAL_TESTING_FOLLOW_UP.md).
