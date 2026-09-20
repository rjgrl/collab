# Source System Guide

This file is a faithful transcription of the system guide provided for the Alumni Tracking System. It is the primary source of truth for all generated documentation.

**Source:** Whiteboard / module sketch supplied with the documentation request.

**Supporting files reviewed:** `docs/problem-statement.md`, `docs/user-stories.md`, and `docs/system-flow.md` were empty at analysis time. `collab/README.md` contained only the heading `# collab` and no system requirements.

---

## MODULES

- Roles
- Users
- Permissions

The three items above are grouped together and labeled **RBAC (Rule Based Access Control)**.

- Departments
- Program
- Faculties
- Alumni Profile
  - Student Details
  - Contact Info
    - Mobile #
    - Personal Email
    - Facebook Account
  - Employment
  - Tracking
- Faculties can be added to department
- Alumni attached to program → Program attached to department

---

## DASHBOARD

- # of graduates
- Example shown: IT: 14750 tracked: 10000 / 5% tracked

---

## INTEGRATION

The integrations are grouped and labeled **Modular**.

1. reCAPTCHA
2. G. Auth
3. G. Drive (uploading of evidence)
4. Email
5. Image BB / G. Drive
6. G. Forms
7. G. Sheets

---

## Terminology as Written

The following terms are preserved exactly as they appear in the source guide:

| Source Term | Notes |
|-------------|-------|
| RBAC (Rule Based Access Control) | Written on the guide as "Rule Based Access Control". The grouped modules are Roles, Users, and Permissions. |
| Program | Singular on the guide. |
| Faculties | Plural on the guide. |
| Alumni Profile | Profile module containing Student Details, Contact Info, Employment, and Tracking. |
| Mobile # | Contact field. |
| Personal Email | Contact field. |
| Facebook Account | Contact field. |
| G. Auth | Interpreted as Google Authentication. The abbreviation was not expanded on the guide. |
| G. Drive | Interpreted as Google Drive. The abbreviation was not expanded on the guide. |
| Image BB | Interpreted as imgBB / ImageBB image hosting. The abbreviation was not expanded on the guide. |
| G. Forms | Interpreted as Google Forms. The abbreviation was not expanded on the guide. |
| G. Sheets | Interpreted as Google Sheets. The abbreviation was not expanded on the guide. |
| Modular | Applied to the integration list. |

---

## What This Guide Does Not Contain

The provided system guide does not contain named user roles, CRUD operation lists, field-level definitions beyond Contact Info, API contracts, notification rules, approval workflows, reports beyond the dashboard statistic, audit-log requirements, or non-functional metrics.
