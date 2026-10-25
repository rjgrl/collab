# Alumni Tracking System

Staff management and Alumni self-service application for academic structure, profiles, graduate tracking statistics, RBAC, and modular integrations. The implementation uses React/Vite, TanStack Router/Query, Express REST, Mongoose, MongoDB and shared Zod contracts.

## What this system is

The Alumni Tracking System maintains:

- **RBAC** — Roles, Users, and Permissions
- **Academic structure** — Departments, Programs, Faculties
- **Alumni profiles** — Student Details, Contact Info (Mobile #, Personal Email, Facebook Account), Employment, Tracking
- **Dashboard** — number of graduates, tracked count, and percent tracked, including an IT department grouping
- **Modular integrations** — reCAPTCHA, Google Auth, Google Drive evidence upload, Email, imgBB / Drive image hosting, Google Forms, Google Sheets

It is **not** a research-project manager and does **not** include an AI research assistant. Those items are not in `docs/`.

## Target users

The source guide does not name roles. Bootstrap roles exist so the system can be used:

| Role                                    | Access                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Super Admin                             | All permissions                                                               |
| Staff                                   | Academic structure, alumni, tracking, files, dashboard, reports, integrations |
| Alumni (legacy `viewer`, also `alumni`) | Own explicitly linked My Profile and account settings only                    |

Staff/Administrator management follows permissions. Administrator roles require MFA even in mixed-role accounts; Staff and Alumni are exempt, including saved enrollment. Historical role permission grants do not bypass Alumni ownership restrictions. See [the defense guide](../DEFENSE_GUIDE.md).

## Assumptions (not original client requirements)

Documented in [implementation.md](../implementation.md). Important ones:

1. RBAC is implemented as role-based access (Users → Roles → Permissions).
2. Named bootstrap roles were required because the guide names none.
3. A program belongs to one department; an alumni record belongs to one program.
4. A faculty may belong to multiple departments.
5. `% tracked = round((tracked / graduates) * 100, 2)` because the whiteboard `5%` conflicts with `10000 / 14750`.
6. Departments are identified by name; programs retain their codes.
7. “Tracked” means the alumni record’s latest tracking flag is true.
8. Evidence files belong to an alumni record.
9. Student details include student number, name, required gender (Male or Female), and graduation year so records can be identified.

## Out of scope (not in docs)

- AI research assistant
- Research project management
- Document legitimacy / authenticity checking
- Named approval workflows
