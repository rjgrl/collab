---
id: account-access
type: architecture-design
status: draft
title: Institutional signup and role targeting
tags: [auth, roles]
---

## Drivers

New public registrations must belong to BukSU, without blocking existing local demo logins.
Individual permission changes remain role-based rather than creating per-user overrides.

## Decisions

Signup accepts only exact `buksu.edu.ph` and `student.buksu.edu.ph` domains, ignoring case and
outer whitespace. Shared contracts enforce this on the API and before the browser advances
from Step 1; errors never advertise demo domains. Existing configured demo-domain sign-in
exceptions work outside production only. Production account access requires one of the two
BukSU domains regardless of configured exceptions. No existing account email is rewritten;
operators must migrate real administrator addresses before production deployment. A personal
Gmail sender is not an account-domain exception.

Google sign-in reuses the existing configured/enabled OAuth integration and first-time Alumni
onboarding. In every environment, both the email and the verified ID token's Workspace `hd`
claim must belong to the two exact BukSU domains; development/demo exceptions never apply.
The student email domain may use the university's base Workspace hosted domain. A missing
Workspace claim, personal Gmail or lookalike domain cannot create an account or issue a session.
The browser shows one shared institutional-account error for every role, not staff-only wording.
The button remains hidden until OAuth credentials are configured and the integration enabled;
Gmail App Passwords do not configure OAuth. Token signature/issuer/audience/expiry, verified
email, OAuth state, linking, MFA and public-enrollment restrictions remain independent gates.

The role editor defaults to All Members and offers individual names in one dropdown, not a
member list or radio modes. Changing one person's permissions creates a variant, moves that
person's membership and revokes their sessions; a notice explains this before saving.
A target switch confirms discarding a dirty draft and resets it, preventing a personal draft
from accidentally becoming an All Members change. Reloading a stale role also resets its target.

With +63 selected, the phone field removes the Philippine trunk zero in both input and display.
Country detection and significant zeros elsewhere must remain intact: forcing international
formatting broke pasted-country detection, so the library retains that responsibility while a
national-field adapter handles the Philippine zero. Sign-in CAPTCHA and Forgot Password share
a compact, wrapping row; controls retain accessible touch sizes. Signup's checkbox is compact too.

## Permission delegation and administrator identity

Every catalog permission may be explicitly assigned to an editable role. A role's name or base
identity does not filter stored grants. Ordinary role editors may grant only permissions they
hold; Super Admins with role-management permission may configure any catalog permission. Existing
stored grants that were previously filtered become effective, so operators must review those roles
before rollout. No default grants are added or removed by this change.

There is one Super Admin account type, including existing roles whose base identity is Super Admin.
Its role configurations have editable permissions and institution-wide record scope; neither a
full-access tier nor an immutable original permission set exists. Cataloged actions still require
the corresponding permission. Existing non-catalog administrator-only backup controls are unchanged;
this change does not introduce backup permission keys. Non-Super Admin editors cannot manage
Super Admin access. Individual edits continue to create role configurations, not per-user grants.

Super Admins require MFA irrespective of their selected permissions. Delegated user/role/catalog,
integration, and academic-write permissions also require MFA; the permission editor marks each
such permission. Ordinary tracking permissions do not introduce an MFA requirement. The existing
managed-loopback-only development MFA pause remains; it cannot disable MFA on Atlas or production.

Permission delegation does not expand alumni assignment or academic department scope. Academic
writes enforce scope on both the source and destination; creating a college requires institution-wide
scope. Delegated integration imports validate each row's source alumnus and destination program in
the importing actor's current scope. Shared integration configuration is system-wide by design.
Delegated audit access stays within existing alumni scope; only Super Admin audit readers see all.

At least one active Super Admin must retain users.read, users.write, roles.read, roles.write and
permissions.read. Role changes, splits, deletion, membership changes and disabling accounts enforce
this after mutation in the same transaction. A shared coordination write in the existing AuthThrottle
collection serializes competing changes, preventing write skew across API instances. Its reserved
key is independent of request-rate budgets; expiry only cleans idle coordination state. Rejected
changes roll back data, memberships, revocations and audit together.

## Invariants

- System role identities remain non-deletable; selected-member editing cannot move the current
  editor out of their own role.
- Selected-user editing never bypasses backend authorization, membership/version checks,
  transactions or audit.
- A single-member Faculty/custom role can move its sole member to a variant; its now-empty
  source may remain. No per-user permission overrides are introduced.
- Existing password, verification, MFA, rate-limit and integration-secret protections remain.

## Out of scope

No email-address migration, live Gmail delivery validation, SMS implementation or production
readiness certification. See [Account security operations](../operations/ACCOUNT_SECURITY.md)
and [Integration operations](../operations/INTEGRATIONS.md) for the separate operational gates.
