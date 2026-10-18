# Alumni Tracking System

Staff application for academic structure, alumni profiles, graduate tracking statistics, RBAC, and modular integrations.

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

| Role | Access |
|------|--------|
| Super Admin | All permissions |
| Staff | Academic structure, alumni, tracking, files, dashboard, reports, integrations |
| Viewer | Read-only academic, alumni, dashboard, and reports |

## Assumptions (not original client requirements)

Documented in [implementation.md](../implementation.md). Important ones:

1. RBAC is implemented as role-based access (Users → Roles → Permissions).
2. Named bootstrap roles were required because the guide names none.
3. A program belongs to one department; an alumni record belongs to one program.
4. A faculty may belong to multiple departments.
5. `% tracked = round((tracked / graduates) * 100, 2)` because the whiteboard `5%` conflicts with `10000 / 14750`.
6. `IT` is a **department code**.
7. “Tracked” means the alumni record’s latest tracking flag is true.
8. Evidence files belong to an alumni record.
9. Student details include student number, name, gender, graduation year, and batch so records can be identified.

## Out of scope (not in docs)

- AI research assistant
- Research project management
- Document legitimacy / authenticity checking
- Named approval workflows
