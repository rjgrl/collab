# Academic defense guide

## Responsibilities

| Concern                                                  | Location                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| HTTP methods, paths and guards                           | `apps/server/src/modules/<feature>/routes.ts`                         |
| Validated request → service → public response            | Adjacent `controller.ts`                                              |
| Business rules and persistence coordination              | Adjacent `service.ts`; shared security/integrations in `packages/api` |
| Collection structure and indexes                         | `packages/db/src/models.ts`                                           |
| Authentication, authorization, validation, errors        | `apps/server/src/middleware`                                          |
| Browser-safe request/response schemas and inferred types | `packages/contracts/src`                                              |

App creation is separate from the listener, so tests exercise the same Express application directly.

## A complete profile request

1. `apps/web/src/routes/_app/my-profile.tsx` collects approved personal fields using existing UI primitives.
2. The typed fetch client validates the shared contract and sends `PATCH /api/me/profile` with the session cookie.
3. Express applies security headers, body limits, origin/CSRF protection and session loading. Authentication verifies who signed in; authorization checks active status, verification and applicable MFA.
4. The controller parses the strict partial-update schema. Submitted ownership, student number, role or academic fields are rejected before persistence.
5. `meProfileService` resolves the signed-in User's stored `alumniId` from MongoDB. Browser-supplied IDs, names and email cannot establish ownership. Missing linkage produces an explicit administrator-action conflict.
6. A Mongoose transaction rechecks the active relationship, updates permitted fields, synchronizes confirmed account/alumni names and writes the audit event. Failure rolls the operation back.
7. The server filters/validates the DTO; the browser validates the untrusted response before rendering. TanStack Query refreshes views. New sign-in clears the prior identity's private cache.

## Authentication versus authorization

Authentication answers “Which active account holds this valid session?” Authorization answers “May this account perform this action on this record?” Ownership is an additional server rule. Alumni can access only their explicitly linked profile; direct requests to the directory, another ID or related management resources fail even when old permission grants are broad. Private evidence reads always require a matching active parent and ownership for Alumni; management routes additionally require file permissions.

Staff/Administrators retain permission-controlled management. An Administrator with both user and alumni permissions links an account after identity review. A partial unique index prevents two accounts claiming the same alumni record.

## Validation and errors

Browser checks provide immediate feedback but direct HTTP clients can bypass them. The server independently validates body/URL/query input, field allowlists, ObjectId format and pagination. Services verify that referenced records exist and are active. Employment end dates cannot precede start dates. MongoDB unique indexes remain authoritative under concurrency; duplicates become 409 conflicts without internal diagnostics. Invalid input is 400, missing authentication 401, forbidden access 403 and missing records 404.

## Names and legacy data

First and last names are required when confirmed; middle name and suffix are optional. Unicode, compound names, apostrophes and hyphens are supported. Suffix suggestions permit custom text stored as the actual value. One shared formatter omits empty parts. Legacy display names remain intact until explicit confirmation; no automatic splitting or matching occurs. Account names are the source of truth for linked profiles.

## MFA policy

| Roles                                    | Required MFA                                        |
| ---------------------------------------- | --------------------------------------------------- |
| Alumni / legacy Viewer                   | No, including saved enrollment                      |
| Staff                                    | No, regardless of permissions or enrollment history |
| Administrator (`admin`, `super_admin`)   | Yes                                                 |
| Administrator combined with another role | Yes; strongest policy applies                       |

Password/session security, throttling, disabled-account checks and required contact verification remain separate controls. Google sign-in does not replace Administrator MFA. The latest local-testing policy explicitly pauses Admin MFA with LOCAL_DISABLE_MFA=true on managed development targets; production enforcement remains. Only the separate managed-local contact-delivery gates can be waived; no verification flags are falsified.

## Migration and rollback

See [the runbook](migrations/MONGOOSE_REST.md). Inspection is dry-run by default; startup does not mutate indexes. Explicit application only adds missing collections/indexes while preserving records, ObjectIds, references, timestamps and session data. No production migration or deployment is included. Code rollback retains additive fields/indexes and must not re-expose Alumni to the old global Viewer directory.

## Trace signup through every layer

1. `/login` collects separate names, contact, password, student number and program. The browser validates `signupSchema`; public program options contain only active academic identifiers/names.
2. The typed client sends `POST /api/auth/signup`. Express applies parser limits, request IDs, origin checks and rate limits before the auth route/controller validates the same strict contract.
3. `authService.signup` checks enabled CAPTCHA and public-signup policy. `registerUser` screens/hashes the password and starts one transaction.
4. `createRegistrationProfile` rejects student-number conflicts, including archived/imported records, and verifies active program and department references. It creates a new untracked Alumni record.
5. User stores the explicit Alumni ObjectId, structured names and hashed credentials. UserRole assigns only the existing `viewer` key (displayed as Alumni); audit records signup. Unique email/student/ownership indexes handle races. Any failure rolls back every write.
6. A session is created and returned through an HttpOnly cookie. Safe identity omits hashes, private factors and raw tokens. A pending account still has independent name/academic, password and contact requirements.
7. The real MongoDB completion runner races two registrations for one student number and checks one winner, one 409 and no orphan account. Browser tests register through the actual form, reload owned employment and download actual uploaded bytes.

## Business policies to explain

An authentication account is not an alumni row. Imported rows may have no login. `User.alumniId` identifies exactly one owned profile; legacy claims require authorized identity review. Registration and verification never imply tracking. Confirmed account names are authoritative for linked profile names; legacy unsplit names remain unchanged until confirmation.

Tracked means the active record's latest authorized tracking flag is true. Manual Staff/Admin changes record actor/time/source/note. An authorized import may explicitly set its tracking column and records the importing actor. A secret-authenticated Forms submission counts as a received tracking response under the existing project policy; it records integration source/history, not a human reviewer or evidence-authenticity approval. Ordinary self employment/photo/personal edits never change tracking.

At most one employment is current. A current job must be employed without an end date; ending/removing jobs recalculates the profile summary (historical jobs but no current job => unemployed; no jobs => unknown). Job deletion is hard removal with audit, retaining and detaching associated evidence. Alumni/evidence deletion is soft; active queries match both missing and null deletedAt fields. Archiving an alumnus blocks owned access and removes normal counts without deleting the User.

Management scope is institution-wide with effective permissions; faculty assignment is an academic relationship, not an invented Staff access restriction. Staff cannot access integration controls even with historical grants; integration access now requires an Administrator role and its effective permissions. Existing role grants require review. Role changes revoke sessions; the next request must reauthenticate under current grants.

The same eligible population underlies dashboard, reports and filtered exports: active alumni with active program and department. Registered counts mean unique profiles linked to an account, including disabled accounts, not active-login totals. Alumni aggregates omit those counts and all people/files; nonzero cells below five and complementary department inference are suppressed. This is a conservative minimum policy, not a formal privacy guarantee against longitudinal inference.

See [feature matrix](FEATURE_MATRIX.md), [current verification](COMPLETION_VERIFICATION.md), [domain glossary](../GLOSSARY.md) and [decision record](decisions/0001-account-profile-policy.md). Local evidence does not certify live providers or production hosting.

Imports preserve an existing tracking decision when the tracking column is absent/blank. Explicit true/false (also 1/0 or yes/no) records the authorized importing actor; unrecognized flags reject the row.

Latest scope change: Faculty management is retired and legacy data retained. Admin MFA has an explicit managed-local-testing pause. Account role subtitles are visual only. See [follow-up verification](LOCAL_TESTING_FOLLOW_UP.md).
