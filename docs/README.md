# System Documentation

## System Overview

The Alumni Tracking System is specified as a modular system for managing academic structure, alumni profiles, graduate tracking statistics, and access control.

The provided system guide defines three major areas:

1. **MODULES** — Roles, Users, and Permissions grouped as **RBAC (Rule Based Access Control)**; Departments, Program, Faculties, and Alumni Profile (Student Details, Contact Info, Employment, Tracking); plus two explicit attachment rules: faculties can be added to a department, and alumni attach to a program that attaches to a department.
2. **DASHBOARD** — Display of number of graduates, including a tracked count and a tracked percentage. An example is shown for IT: 14750 graduates, 10000 tracked, 5% tracked.
3. **INTEGRATION** — Seven integrations grouped as **Modular**: reCAPTCHA, G. Auth, G. Drive (uploading of evidence), Email, Image BB / G. Drive, G. Forms, and G. Sheets.

> **Source:** Whiteboard / module sketch transcribed in [source-guide.md](./source-guide.md).

> **Requirement Status:** The guide does not provide a formal problem statement, named user roles, API contracts, notification rules, or field-level definitions beyond Alumni Profile Contact Info.

## Documentation Structure

```text
docs/
├── README.md
├── source-guide.md
├── functional-requirements.md
├── requirements-traceability.md
├── user-roles-and-permissions.md
├── workflows.md
├── data-requirements.md
├── non-functional-requirements.md
├── open-questions.md
├── problem-statement.md
├── user-stories.md
├── system-flow.md
│
├── rbac/
│   ├── rbac-overview.md
│   ├── manage-roles.md
│   ├── manage-users.md
│   └── manage-permissions.md
│
├── academic-structure/
│   ├── manage-departments.md
│   ├── manage-programs.md
│   ├── manage-faculties.md
│   ├── assign-faculty-to-department.md
│   └── attach-alumni-to-program.md
│
├── alumni-profile/
│   ├── alumni-profile.md
│   ├── student-details.md
│   ├── contact-info.md
│   ├── employment.md
│   └── tracking.md
│
├── dashboard/
│   └── graduate-tracking-statistics.md
│
└── integrations/
    ├── recaptcha.md
    ├── google-auth.md
    ├── google-drive-evidence.md
    ├── email.md
    ├── image-hosting.md
    ├── google-forms.md
    └── google-sheets.md
```

## Modules

- [RBAC (Rule Based Access Control)](./rbac/rbac-overview.md)
  - [Roles](./rbac/manage-roles.md)
  - [Users](./rbac/manage-users.md)
  - [Permissions](./rbac/manage-permissions.md)
- [Departments](./academic-structure/manage-departments.md)
- [Program](./academic-structure/manage-programs.md)
- [Faculties](./academic-structure/manage-faculties.md)
- [Assign Faculty to Department](./academic-structure/assign-faculty-to-department.md)
- [Attach Alumni to Program](./academic-structure/attach-alumni-to-program.md)
- [Alumni Profile](./alumni-profile/alumni-profile.md)
  - [Student Details](./alumni-profile/student-details.md)
  - [Contact Info](./alumni-profile/contact-info.md)
  - [Employment](./alumni-profile/employment.md)
  - [Tracking](./alumni-profile/tracking.md)
- [Dashboard](./dashboard/graduate-tracking-statistics.md)
- [Integrations](./integrations/recaptcha.md)

## User Roles

The system guide defines a **Roles** module as part of RBAC. It does **not** name any concrete roles such as Admin, Staff, Faculty, or Alumni.

See [User Roles and Permissions](./user-roles-and-permissions.md).

## Functionality Index

| ID | Module | Functionality | Documentation |
|----|--------|---------------|---------------|
| RBAC-001 | RBAC | RBAC Overview | [rbac/rbac-overview.md](./rbac/rbac-overview.md) |
| RBAC-002 | RBAC | Manage Roles | [rbac/manage-roles.md](./rbac/manage-roles.md) |
| RBAC-003 | RBAC | Manage Users | [rbac/manage-users.md](./rbac/manage-users.md) |
| RBAC-004 | RBAC | Manage Permissions | [rbac/manage-permissions.md](./rbac/manage-permissions.md) |
| ACAD-001 | Academic Structure | Manage Departments | [academic-structure/manage-departments.md](./academic-structure/manage-departments.md) |
| ACAD-002 | Academic Structure | Manage Programs | [academic-structure/manage-programs.md](./academic-structure/manage-programs.md) |
| ACAD-003 | Academic Structure | Manage Faculties | [academic-structure/manage-faculties.md](./academic-structure/manage-faculties.md) |
| ACAD-004 | Academic Structure | Assign Faculty to Department | [academic-structure/assign-faculty-to-department.md](./academic-structure/assign-faculty-to-department.md) |
| ACAD-005 | Academic Structure | Attach Alumni to Program | [academic-structure/attach-alumni-to-program.md](./academic-structure/attach-alumni-to-program.md) |
| ALUM-001 | Alumni Profile | Alumni Profile | [alumni-profile/alumni-profile.md](./alumni-profile/alumni-profile.md) |
| ALUM-002 | Alumni Profile | Student Details | [alumni-profile/student-details.md](./alumni-profile/student-details.md) |
| ALUM-003 | Alumni Profile | Contact Info | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| ALUM-004 | Alumni Profile | Employment | [alumni-profile/employment.md](./alumni-profile/employment.md) |
| ALUM-005 | Alumni Profile | Tracking | [alumni-profile/tracking.md](./alumni-profile/tracking.md) |
| DASH-001 | Dashboard | Graduate Tracking Statistics | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| INT-001 | Integrations | reCAPTCHA | [integrations/recaptcha.md](./integrations/recaptcha.md) |
| INT-002 | Integrations | G. Auth | [integrations/google-auth.md](./integrations/google-auth.md) |
| INT-003 | Integrations | G. Drive (uploading of evidence) | [integrations/google-drive-evidence.md](./integrations/google-drive-evidence.md) |
| INT-004 | Integrations | Email | [integrations/email.md](./integrations/email.md) |
| INT-005 | Integrations | Image BB / G. Drive | [integrations/image-hosting.md](./integrations/image-hosting.md) |
| INT-006 | Integrations | G. Forms | [integrations/google-forms.md](./integrations/google-forms.md) |
| INT-007 | Integrations | G. Sheets | [integrations/google-sheets.md](./integrations/google-sheets.md) |

## Requirements Traceability

- [Requirements Traceability](./requirements-traceability.md)
- [Functional Requirements](./functional-requirements.md)

## Cross-Cutting Documents

- [User Roles and Permissions](./user-roles-and-permissions.md)
- [Workflows](./workflows.md)
- [Data Requirements](./data-requirements.md)
- [Non-Functional Requirements](./non-functional-requirements.md)
- [Open Questions](./open-questions.md)
- [Source Guide Transcription](./source-guide.md)
- [Implementation Guide](./implementation.md)

## Assumptions

Assumptions are marked in individual functionality files and are not treated as confirmed requirements.

Documented assumption themes:

1. Roles, Users, and Permissions modules imply management of those entities as part of RBAC.
2. Departments, Program, Faculties, and Alumni Profile imply records that can be maintained.
3. "G. Auth", "G. Drive", "G. Forms", and "G. Sheets" refer to Google Authentication, Google Drive, Google Forms, and Google Sheets.
4. "Image BB" refers to imgBB / ImageBB image hosting.
5. Dashboard counts can be viewed by grouping such as IT.
6. Integrations are intended to be replaceable or isolatable because they are labeled Modular.
7. Contact Info fields belong to the Alumni Profile.

See each functionality file, [data-requirements.md](./data-requirements.md), and [open-questions.md](./open-questions.md) for item-level assumption labels.

## Open Questions

The system guide is a high-level module sketch. Major unspecified areas include named roles, CRUD operations, field definitions (except Contact Info), authentication/session behavior, evidence meaning, email purpose, dashboard formula, and all API/UI details.

See [open-questions.md](./open-questions.md).

## Requirement Conflicts

1. **Dashboard percentage vs counts:** The example shows IT graduates `14750`, tracked `10000`, and `5% tracked`. `10000 / 14750` is approximately `67.80%`, not `5%`.
2. **RBAC naming:** The guide labels RBAC as "Rule Based Access Control" while grouping Roles, Users, and Permissions, which is the conventional shape of Role-Based Access Control.
3. **Google Drive dual use:** G. Drive is listed for "uploading of evidence" and again under "Image BB / G. Drive".

See [open-questions.md](./open-questions.md) and [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md).

## Documentation Status

| Item | Status |
|------|--------|
| Source guide analysis | Complete |
| Functionality documentation | Complete for all items identified in the source guide |
| Requirements IDs | Assigned |
| Traceability matrix | Complete |
| Named user roles | Not specified in source guide |
| API specification | Not specified in source guide |
| Field-level data model beyond Contact Info | Not specified in source guide |
| Ready for implementation without clarification | No — see open questions |
| Application implementation | See [implementation.md](./implementation.md) |
