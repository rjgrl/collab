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

## Invariants

- Original Super Admin retains every permission and cannot be emptied or self-split.
- Only full Super Admins manage limited-admin membership; selected-user editing never bypasses
  backend authorization, membership/version checks, transactions or audit.
- A single-member Faculty/custom role can move its sole member to a variant; its now-empty
  source may remain. No per-user permission overrides are introduced.
- Existing password, verification, MFA, rate-limit and integration-secret protections remain.

## Out of scope

No email-address migration, live Gmail delivery validation, SMS implementation or production
readiness certification. See [Account security operations](../operations/ACCOUNT_SECURITY.md)
and [Integration operations](../operations/INTEGRATIONS.md) for the separate operational gates.
