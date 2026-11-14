# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are the people who watch the system every day. When their needs conflict with the alumni's, design favours them:

- **Faculty trackers** follow the alumni assigned to them, record tracking, and review employment evidence.
- **Department and college heads** manage faculty and assignments in their scope, and review evidence, reports and the audit log for that scope.
- **Super Admins** manage accounts, permissions, the full audit log, backups and integrations.

Secondary users are **alumni**. They register, then come back now and then to update their academic and employment profile and upload evidence. A visit is short and focused on one task, often on a phone. Alumni never see tracking status.

## Product Purpose

An alumni tracking system commissioned by the College of Technologies (COT), Bukidnon State University (BukSU), to run in production. It records where COT graduates are employed and the evidence behind each record, so the college can:

- produce **accreditation evidence** of graduate employability for quality audits;
- run its formal **graduate tracer study**.

Success means faculty and heads can show complete, verified, auditable employment data for each program when accreditation or the tracer study needs it.

## Positioning

Its unit of work is accountable, scoped tracking, not a contact list. The academic hierarchy is College, then Department, then Program. Each alumnus is assigned to a faculty tracker, each employment claim can carry evidence, and every change is audited. The data stays defensible when an accreditor or tracer-study reviewer asks where it came from.

## Operating Context

- Staff use it at a desk during regular tracking work and while preparing reports for accreditation and the tracer study. Alumni use it on their own devices, mostly phones.
- Alumni can sign up with a BukSU Google account or by email. Sign-up is one page.
- Integrations include Google sign-in, Google Forms (webhook), Google Drive (off-host copies of backups), an email gateway and reCAPTCHA.
- Production runs on MongoDB Atlas behind HTTPS. Each developer's machine runs its own local MongoDB replica set.
- Time zone: Asia/Manila.

## Capabilities and Constraints

- Roles: Alumni, Faculty tracker, Department head, College head, Super Admin. Only Super Admins administer; the admin, staff and viewer roles were removed (PR #9).
- Administrator accounts need TOTP MFA. Passwords must be 15–128 characters with an uppercase letter, a lowercase letter, a number and a special character or space. This deviates from NIST guidance on purpose, and the owner approved it.
- Alumni profile sections: student details, contacts, employment, evidence, tracking, and change history. Change history is visible to heads and Super Admins only.
- Encrypted, verified backups with in-app restore, guarded by step-up MFA.
- Browser tests pin the 14px/1.5 body text, the Inter font, and the accessible names the tests use. A visual change must keep them or update the tests on purpose.
- `docs/decisions.md` is the record of product and UI decisions.

## Brand Commitments

- This is BukSU COT's own institutional system, and it carries the institution's identity.
- The official COT logo comes from buksu.edu.ph and shows as a clipped circle.
- BukSU palette: navy `#001C38`, gold `#D7953E`, blue `#0070BA`, light blue `#8FC3DD`, warm neutrals. Dark mode uses BukSU gold as its accent. The decision records details are in `docs/decisions.md` (2026-11-09, 2026-11-12).
- A visual rebrand was rejected twice (2026-11-09 and the read-first redesign).
- Voice: plain language, for example in change history and audit summaries ("Recorded tracking").

## Evidence on Hand

- Brand assets: `apps/web/public/brand/buksu-cot-seal.webp`, `apps/web/public/brand/cot-building.webp`.
- Demo data is synthetic (seeded colleges, programs, four alumni, one login per role). It is not real graduate data.
- There are no real testimonials, adoption figures, outcome statistics or endorsements on hand. Never invent any.

## Product Principles

1. Favour the people who watch the system. Faculty, heads and Super Admins work in it daily, so scanning, review and oversight come before showing off.
2. Keep alumni updates short. An alumnus should finish an update in one focused visit, on a phone, without staff help.
3. Every record must stand up in an audit. Evidence, the audit trail and scope boundaries are what make the data usable for accreditation and the tracer study.
4. Scope is a boundary. Users see and act only within their College, Department, Program or assignment.
5. Present the institution's identity, not a generic SaaS product.

## Accessibility & Inclusion

WCAG 2.2 AA in light and dark mode on desktop and phone, enforced by axe checks in the Playwright suite. Labels stay stable, dialogs trap and return focus, and disclosures move focus into the content they open.
