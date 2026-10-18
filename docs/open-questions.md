# Open Questions

Requirements that are unclear, incomplete, contradictory, or missing from the provided system guide.

Do not treat any item below as a decided requirement.

---

## Authentication

- Is G. Auth the only authentication method?
- Is there a username/password login in addition to G. Auth?
- Where is reCAPTCHA shown (login, forms, public pages)?
- What is the session duration?
- Are logout, forgot-password, reset-password, or change-password in scope?
- What is the password complexity requirement, if passwords exist?

## User Management / RBAC

- The guide writes **RBAC (Rule Based Access Control)** while listing Roles, Users, and Permissions. Is the intended model Role-Based Access Control, Rule-Based Access Control, or both?
- Which named roles exist?
- Can a user have multiple roles?
- Are permissions assigned only through roles?
- Who may create, view, edit, or delete Roles, Users, and Permissions?
- Can users be deactivated or permanently deleted?

## Departments, Program, Faculties

- What attributes does a Department have?
- What attributes does a Program have?
- What attributes does a Faculty have?
- Can a faculty belong to more than one department?
- Can a program belong to more than one department?
- Who may maintain these records?
- Are create, edit, delete, and archive supported?

## Alumni Profile

- Who creates an Alumni Profile (administrator, faculty, the alumnus, import)?
- What fields are in Student Details?
- What fields are in Employment?
- What fields are in Tracking?
- Are Mobile #, Personal Email, and Facebook Account required?
- What validation applies to those contact fields?
- Can an alumni record attach to more than one program?
- How does Alumni Profile Tracking relate to the dashboard "tracked" count?

## Dashboard

- Who can view the dashboard?
- Is **IT** a department, a program, or another grouping?
- How is `# of graduates` calculated?
- How is `tracked` calculated?
- How is `% tracked` calculated?
- **Requirement Conflict:** The example shows `14750` graduates, `10000` tracked, and `5% tracked`. `10000 / 14750` is not `5%`. Which values and which formula are correct?
- Are other dashboard widgets required?

## Integrations

- For each integration, which screens or workflows invoke it?
- What is "evidence" for G. Drive uploads?
- Who uploads evidence, and against which record?
- Are Image BB and G. Drive alternatives for images, or used together?
- Is G. Drive for evidence the same integration as G. Drive for images?
- What does Email send, to whom, and on which events?
- Are G. Forms used for alumni data collection, evidence, or something else?
- Are G. Sheets used for import, export, reporting, or storage?
- What does "Modular" require technically (feature flags, adapters, separate packages)?

## Notifications

- Which events trigger in-app, email, or other notifications?

## Reports

- Are there reports other than the dashboard graduate statistic?

## Search, Filtering, and Data Management

- Is search or filtering required on any module?
- Are import/export operations required besides G. Sheets / G. Forms?

## API

- Are APIs specified or required beyond "not defined in the provided system guide"?

## UI

- What pages, forms, tables, and states are required?
- Is there a public vs authenticated UI?

## Audit / Logging

- Which actions must be logged?

## Security

- What data-protection, sanitization, and session rules apply beyond RBAC, reCAPTCHA, and G. Auth?

## Error Handling

- What error messages and failure behaviors are required?

## Approval Workflows and Statuses

- Are there approval workflows?
- What status values exist for alumni, tracking, employment, or evidence?

---

## Requirement Conflicts

### C-001 — Dashboard percentage does not match the counts

**Section A:** Dashboard example shows IT graduates `14750` and tracked `10000`.

**Section B:** The same example shows `5% tracked`.

**Resolution Required:** Confirm the intended counts and the `% tracked` formula before implementation.

### C-002 — RBAC label vs grouped modules

**Section A:** The guide labels the group **RBAC (Rule Based Access Control)**.

**Section B:** The grouped modules are Roles, Users, and Permissions, which is the conventional shape of Role-Based Access Control.

**Resolution Required:** Confirm whether access control is role-based, rule-based, or both.

### C-003 — Google Drive listed twice

**Section A:** Integration 3 is **G. Drive (uploading of evidence)**.

**Section B:** Integration 5 is **Image BB / G. Drive**.

**Resolution Required:** Confirm whether these are one Drive integration with two uses, or two separate Drive uses with different rules.
