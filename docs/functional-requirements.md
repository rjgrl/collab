# Functional Requirements

This document consolidates every functional requirement that can be stated from the provided system guide. Each requirement is specific, testable where the guide allows, and traceable to a functionality.

> **Source:** [source-guide.md](./source-guide.md)

Requirements that would normally exist for a complete system but are **not** stated in the guide are excluded. Those gaps are listed in [open-questions.md](./open-questions.md).

---

## RBAC

| ID | Requirement | Functionality | Source |
|----|-------------|---------------|--------|
| FR-RBAC-001 | The system must include a Roles module. | [RBAC-002](./rbac/manage-roles.md) | MODULES – Roles |
| FR-RBAC-002 | The system must include a Users module. | [RBAC-003](./rbac/manage-users.md) | MODULES – Users |
| FR-RBAC-003 | The system must include a Permissions module. | [RBAC-004](./rbac/manage-permissions.md) | MODULES – Permissions |
| FR-RBAC-004 | Roles, Users, and Permissions must operate together as RBAC (Rule Based Access Control). | [RBAC-001](./rbac/rbac-overview.md) | MODULES – RBAC grouping |

---

## Academic Structure

| ID | Requirement | Functionality | Source |
|----|-------------|---------------|--------|
| FR-ACAD-001 | The system must include a Departments module. | [ACAD-001](./academic-structure/manage-departments.md) | MODULES – Departments |
| FR-ACAD-002 | The system must include a Program module. | [ACAD-002](./academic-structure/manage-programs.md) | MODULES – Program |
| FR-ACAD-003 | The system must include a Faculties module. | [ACAD-003](./academic-structure/manage-faculties.md) | MODULES – Faculties |
| FR-ACAD-004 | The system must allow faculties to be added to a department. | [ACAD-004](./academic-structure/assign-faculty-to-department.md) | MODULES – "Faculties can be added to department" |
| FR-ACAD-005 | The system must attach an alumni record to a program. | [ACAD-005](./academic-structure/attach-alumni-to-program.md) | MODULES – "Alumni attached to program" |
| FR-ACAD-006 | The system must attach a program to a department. | [ACAD-002](./academic-structure/manage-programs.md), [ACAD-005](./academic-structure/attach-alumni-to-program.md) | MODULES – "Program attached to department" |

---

## Alumni Profile

| ID | Requirement | Functionality | Source |
|----|-------------|---------------|--------|
| FR-ALUM-001 | The system must include an Alumni Profile module. | [ALUM-001](./alumni-profile/alumni-profile.md) | MODULES – Alumni Profile |
| FR-ALUM-002 | The Alumni Profile must include Student Details. | [ALUM-002](./alumni-profile/student-details.md) | MODULES – Student Details |
| FR-ALUM-003 | The Alumni Profile must include Contact Info. | [ALUM-003](./alumni-profile/contact-info.md) | MODULES – Contact Info |
| FR-ALUM-004 | Contact Info must include Mobile #. | [ALUM-003](./alumni-profile/contact-info.md) | MODULES – Mobile # |
| FR-ALUM-005 | Contact Info must include Personal Email. | [ALUM-003](./alumni-profile/contact-info.md) | MODULES – Personal Email |
| FR-ALUM-006 | Contact Info must include Facebook Account. | [ALUM-003](./alumni-profile/contact-info.md) | MODULES – Facebook Account |
| FR-ALUM-007 | The Alumni Profile must include Employment. | [ALUM-004](./alumni-profile/employment.md) | MODULES – Employment |
| FR-ALUM-008 | The Alumni Profile must include Tracking. | [ALUM-005](./alumni-profile/tracking.md) | MODULES – Tracking |

---

## Dashboard

| ID | Requirement | Functionality | Source |
|----|-------------|---------------|--------|
| FR-DASH-001 | The dashboard must show the number of graduates. | [DASH-001](./dashboard/graduate-tracking-statistics.md) | DASHBOARD – # of graduates |
| FR-DASH-002 | The dashboard must be able to present graduate counts for a grouping such as IT. | [DASH-001](./dashboard/graduate-tracking-statistics.md) | DASHBOARD – IT example |
| FR-DASH-003 | The dashboard must show a tracked count of graduates. | [DASH-001](./dashboard/graduate-tracking-statistics.md) | DASHBOARD – tracked: 10000 |
| FR-DASH-004 | The dashboard must show a tracked percentage. | [DASH-001](./dashboard/graduate-tracking-statistics.md) | DASHBOARD – 5% tracked |

> **Requirement Conflict:** FR-DASH-003 and FR-DASH-004 cannot both be implemented from the given example without clarification. `10000` tracked of `14750` graduates is not `5%`. See [open-questions.md](./open-questions.md).

---

## Integrations

| ID | Requirement | Functionality | Source |
|----|-------------|---------------|--------|
| FR-INT-001 | The system must integrate reCAPTCHA. | [INT-001](./integrations/recaptcha.md) | INTEGRATION – 1. reCAPTCHA |
| FR-INT-002 | The system must integrate G. Auth. | [INT-002](./integrations/google-auth.md) | INTEGRATION – 2. G. Auth |
| FR-INT-003 | The system must integrate G. Drive for uploading of evidence. | [INT-003](./integrations/google-drive-evidence.md) | INTEGRATION – 3. G. Drive (uploading of evidence) |
| FR-INT-004 | The system must integrate Email. | [INT-004](./integrations/email.md) | INTEGRATION – 4. Email |
| FR-INT-005 | The system must integrate Image BB and/or G. Drive for image hosting. | [INT-005](./integrations/image-hosting.md) | INTEGRATION – 5. Image BB / G. Drive |
| FR-INT-006 | The system must integrate G. Forms. | [INT-006](./integrations/google-forms.md) | INTEGRATION – 6. G. Forms |
| FR-INT-007 | The system must integrate G. Sheets. | [INT-007](./integrations/google-sheets.md) | INTEGRATION – 7. G. Sheets |
| FR-INT-008 | Integrations must be modular. | All INT-* | INTEGRATION grouping labeled Modular |

---

## Requirement Count

| Category | Count |
|----------|-------|
| RBAC | 4 |
| Academic Structure | 6 |
| Alumni Profile | 8 |
| Dashboard | 4 |
| Integrations | 8 |
| **Total** | **30** |
