# Account, profile and local verification policy

Status: accepted by the implementation master prompt, 2026-10-23. The local Admin MFA requirement is superseded by [decision 0002](0002-local-testing-and-alumni-scope.md); other decisions remain applicable.

The existing Express/REST/Mongoose stack and collection names remain. Accounts authenticate; Alumni records describe graduates. A public registration creates both and the Alumni role in one transaction. Student-number conflicts require explicit Admin review instead of automatic matching; this prevents taking over an imported record with public biographical information. Confirmed account names synchronize to linked profiles. Existing display names are not split or backfilled.

Local contact testing is explicit and server-owned. Independent email/phone requirement flags default true and may be false only in managed local development/test. Waiving a delivery gate never marks a contact verified or bypasses essential profile/password completion. Production rejects exemptions and requires provider readiness. Administrator MFA remains mandatory everywhere; Staff/Alumni do not require it, and Admin wins on mixed accounts.

Owned employment and evidence reuse management business rules behind dedicated self routes. The server derives ownership from User.alumniId. Parent revision writes serialize current-job changes and upload/job-reference races. One current job is permitted; editing employment never implies tracking. Evidence is retained/soft-deleted; job removal is audited hard deletion with evidence detachment.

Reports share the active academic population and filters. Alumni receive aggregate-only responses with a minimum nonzero cohort/cell of five and department complement suppression. Rejecting user-selected cohort filters reduces inference. This deliberately sacrifices some small-department visibility; institutions must review longitudinal/privacy requirements before release.

Alternatives rejected: first-user Admin assignment, matching legacy profiles by email/student number alone, client-controlled verification bypass, fabricated verified contacts, mandatory Staff MFA, and a second disconnected demo app. They violate the explicit ownership/security or testing requirements. Existing production data, role grants, indexes and factors are preserved; any reviewed backfill, provider enablement or deployment is a separate operator action.
