# Requirements Traceability

This matrix traces every documented functionality and every functional requirement back to the provided system guide.

> **Source of truth:** [source-guide.md](./source-guide.md)

---

## Functionality Traceability

| ID | Module | Functionality | Source | Documentation |
|----|--------|---------------|--------|---------------|
| RBAC-001 | RBAC | RBAC Overview | MODULES – Roles, Users, Permissions grouped as RBAC (Rule Based Access Control) | [rbac/rbac-overview.md](./rbac/rbac-overview.md) |
| RBAC-002 | RBAC | Manage Roles | MODULES – Roles | [rbac/manage-roles.md](./rbac/manage-roles.md) |
| RBAC-003 | RBAC | Manage Users | MODULES – Users | [rbac/manage-users.md](./rbac/manage-users.md) |
| RBAC-004 | RBAC | Manage Permissions | MODULES – Permissions | [rbac/manage-permissions.md](./rbac/manage-permissions.md) |
| ACAD-001 | Academic Structure | Manage Departments | MODULES – Departments | [academic-structure/manage-departments.md](./academic-structure/manage-departments.md) |
| ACAD-002 | Academic Structure | Manage Programs | MODULES – Program; "Program attached to department" | [academic-structure/manage-programs.md](./academic-structure/manage-programs.md) |
| ACAD-003 | Academic Structure | Manage Faculties | MODULES – Faculties | [academic-structure/manage-faculties.md](./academic-structure/manage-faculties.md) |
| ACAD-004 | Academic Structure | Assign Faculty to Department | MODULES – "Faculties can be added to department" | [academic-structure/assign-faculty-to-department.md](./academic-structure/assign-faculty-to-department.md) |
| ACAD-005 | Academic Structure | Attach Alumni to Program | MODULES – "Alumni attached to program -> Program attached to department" | [academic-structure/attach-alumni-to-program.md](./academic-structure/attach-alumni-to-program.md) |
| ALUM-001 | Alumni Profile | Alumni Profile | MODULES – Alumni Profile | [alumni-profile/alumni-profile.md](./alumni-profile/alumni-profile.md) |
| ALUM-002 | Alumni Profile | Student Details | MODULES – Alumni Profile / Student Details | [alumni-profile/student-details.md](./alumni-profile/student-details.md) |
| ALUM-003 | Alumni Profile | Contact Info | MODULES – Alumni Profile / Contact Info | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| ALUM-004 | Alumni Profile | Employment | MODULES – Alumni Profile / Employment | [alumni-profile/employment.md](./alumni-profile/employment.md) |
| ALUM-005 | Alumni Profile | Tracking | MODULES – Alumni Profile / Tracking | [alumni-profile/tracking.md](./alumni-profile/tracking.md) |
| DASH-001 | Dashboard | Graduate Tracking Statistics | DASHBOARD – # of graduates; IT example | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| INT-001 | Integrations | reCAPTCHA | INTEGRATION – 1. reCAPTCHA | [integrations/recaptcha.md](./integrations/recaptcha.md) |
| INT-002 | Integrations | G. Auth | INTEGRATION – 2. G. Auth | [integrations/google-auth.md](./integrations/google-auth.md) |
| INT-003 | Integrations | G. Drive (uploading of evidence) | INTEGRATION – 3. G. Drive (uploading of evidence) | [integrations/google-drive-evidence.md](./integrations/google-drive-evidence.md) |
| INT-004 | Integrations | Email | INTEGRATION – 4. Email | [integrations/email.md](./integrations/email.md) |
| INT-005 | Integrations | Image BB / G. Drive | INTEGRATION – 5. Image BB / G. Drive | [integrations/image-hosting.md](./integrations/image-hosting.md) |
| INT-006 | Integrations | G. Forms | INTEGRATION – 6. G. Forms | [integrations/google-forms.md](./integrations/google-forms.md) |
| INT-007 | Integrations | G. Sheets | INTEGRATION – 7. G. Sheets | [integrations/google-sheets.md](./integrations/google-sheets.md) |

---

## Functional Requirement Traceability

| Requirement ID | Functionality ID | Documentation |
|----------------|------------------|---------------|
| FR-RBAC-001 | RBAC-002 | [rbac/manage-roles.md](./rbac/manage-roles.md) |
| FR-RBAC-002 | RBAC-003 | [rbac/manage-users.md](./rbac/manage-users.md) |
| FR-RBAC-003 | RBAC-004 | [rbac/manage-permissions.md](./rbac/manage-permissions.md) |
| FR-RBAC-004 | RBAC-001 | [rbac/rbac-overview.md](./rbac/rbac-overview.md) |
| FR-ACAD-001 | ACAD-001 | [academic-structure/manage-departments.md](./academic-structure/manage-departments.md) |
| FR-ACAD-002 | ACAD-002 | [academic-structure/manage-programs.md](./academic-structure/manage-programs.md) |
| FR-ACAD-003 | ACAD-003 | [academic-structure/manage-faculties.md](./academic-structure/manage-faculties.md) |
| FR-ACAD-004 | ACAD-004 | [academic-structure/assign-faculty-to-department.md](./academic-structure/assign-faculty-to-department.md) |
| FR-ACAD-005 | ACAD-005 | [academic-structure/attach-alumni-to-program.md](./academic-structure/attach-alumni-to-program.md) |
| FR-ACAD-006 | ACAD-002, ACAD-005 | [academic-structure/manage-programs.md](./academic-structure/manage-programs.md), [academic-structure/attach-alumni-to-program.md](./academic-structure/attach-alumni-to-program.md) |
| FR-ALUM-001 | ALUM-001 | [alumni-profile/alumni-profile.md](./alumni-profile/alumni-profile.md) |
| FR-ALUM-002 | ALUM-002 | [alumni-profile/student-details.md](./alumni-profile/student-details.md) |
| FR-ALUM-003 | ALUM-003 | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| FR-ALUM-004 | ALUM-003 | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| FR-ALUM-005 | ALUM-003 | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| FR-ALUM-006 | ALUM-003 | [alumni-profile/contact-info.md](./alumni-profile/contact-info.md) |
| FR-ALUM-007 | ALUM-004 | [alumni-profile/employment.md](./alumni-profile/employment.md) |
| FR-ALUM-008 | ALUM-005 | [alumni-profile/tracking.md](./alumni-profile/tracking.md) |
| FR-DASH-001 | DASH-001 | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| FR-DASH-002 | DASH-001 | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| FR-DASH-003 | DASH-001 | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| FR-DASH-004 | DASH-001 | [dashboard/graduate-tracking-statistics.md](./dashboard/graduate-tracking-statistics.md) |
| FR-INT-001 | INT-001 | [integrations/recaptcha.md](./integrations/recaptcha.md) |
| FR-INT-002 | INT-002 | [integrations/google-auth.md](./integrations/google-auth.md) |
| FR-INT-003 | INT-003 | [integrations/google-drive-evidence.md](./integrations/google-drive-evidence.md) |
| FR-INT-004 | INT-004 | [integrations/email.md](./integrations/email.md) |
| FR-INT-005 | INT-005 | [integrations/image-hosting.md](./integrations/image-hosting.md) |
| FR-INT-006 | INT-006 | [integrations/google-forms.md](./integrations/google-forms.md) |
| FR-INT-007 | INT-007 | [integrations/google-sheets.md](./integrations/google-sheets.md) |
| FR-INT-008 | INT-001 through INT-007 | Integration documents |

---

## Coverage Check

| Source Guide Item | Functionality ID | Documented | Implemented |
|-------------------|------------------|------------|-------------|
| Roles | RBAC-002 | Yes | `apps/web` Roles page, `roles` router |
| Users | RBAC-003 | Yes | `apps/web` Users page, `users` router |
| Permissions | RBAC-004 | Yes | Permission catalog + role assignment |
| RBAC (Rule Based Access Control) | RBAC-001 | Yes | Users → Roles → Permissions enforced on API |
| Departments | ACAD-001 | Yes | Departments module |
| Program | ACAD-002 | Yes | Programs attached to department |
| Faculties | ACAD-003 | Yes | Faculties module |
| Alumni Profile | ALUM-001 | Yes | Alumni module |
| Student Details | ALUM-002 | Yes | Profile fields (assumed set) |
| Contact Info | ALUM-003 | Yes | Mobile #, Personal Email, Facebook Account |
| Employment | ALUM-004 | Yes | Employment history on profile |
| Tracking | ALUM-005 | Yes | Tracking events + dashboard flag |
| Faculties can be added to department | ACAD-004 | Yes | Faculty-department assignment |
| Alumni attached to program | ACAD-005 | Yes | Required program on alumni |
| Program attached to department | ACAD-002, ACAD-005 | Yes | Program.departmentId |
| Dashboard # of graduates | DASH-001 | Yes | Dashboard page |
| IT 14750 / tracked 10000 / 5% tracked | DASH-001 | Yes | Live counts; formula documented |
| reCAPTCHA | INT-001 | Yes | Live or checkbox fallback |
| G. Auth | INT-002 | Yes | Optional Google OAuth |
| G. Drive (uploading of evidence) | INT-003 | Yes | Drive or local disk |
| Email | INT-004 | Yes | SMTP or log fallback |
| Image BB / G. Drive | INT-005 | Yes | imgBB, Drive, or local |
| G. Forms | INT-006 | Yes | Signed webhook importer |
| G. Sheets | INT-007 | Yes | Sheets or CSV fallback |
| Modular | FR-INT-008 | Yes | Integration adapters + toggles |

AI Research Assistant and research-project modules are **not** implemented because they are not in the Docs folder.

