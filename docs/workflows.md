# Workflows

This document describes the major end-to-end workflows that can be derived from the provided system guide. Steps that are not stated in the guide are marked as unspecified or as assumptions.

> **Source:** [source-guide.md](./source-guide.md)

---

## Workflow Index

| ID | Workflow | Source Support |
|----|----------|----------------|
| WF-001 | RBAC Access Control | Confirmed modules: Roles, Users, Permissions grouped as RBAC |
| WF-002 | Academic Hierarchy Setup | Confirmed: Faculty → Department; Alumni → Program → Department |
| WF-003 | Alumni Profile Maintenance | Confirmed profile sections |
| WF-004 | View Graduate Tracking Statistics | Confirmed dashboard statistic |
| WF-005 | Upload Evidence via G. Drive | Confirmed integration purpose |
| WF-006 | Modular Integration Use | Confirmed Modular label on integrations |

---

## WF-001 — RBAC Access Control

```text
Users
  ↓
Roles
  ↓
Permissions
  ↓
RBAC (Rule Based Access Control)
```

### Confirmed

- The system has Users, Roles, and Permissions modules.
- Those modules form RBAC (Rule Based Access Control).

### Not specified

- How a user is created or authenticated.
- How a role is assigned to a user.
- How a permission is assigned to a role.
- When access is checked.
- What happens when access is denied.

> **Assumption:** Users are associated with Roles, and Roles are associated with Permissions. The guide groups the three modules as RBAC but does not describe the assignment steps.

---

## WF-002 — Academic Hierarchy Setup

```text
Department
  ↑
Program
  ↑
Alumni

Department
  ↑
Faculty
```

### Confirmed

- Faculties can be added to a department.
- Alumni are attached to a program.
- A program is attached to a department.

### Detail

1. A department exists in the Departments module.
2. A program is attached to that department.
3. An alumni record is attached to that program.
4. Independently, a faculty record can be added to a department.

### Not specified

- Order of creation.
- Whether a faculty can belong to more than one department.
- Whether a program can belong to more than one department.
- Whether an alumni record can attach to more than one program.
- Who performs each attachment.

---

## WF-003 — Alumni Profile Maintenance

```text
Alumni Profile
  ├── Student Details
  ├── Contact Info
  │     ├── Mobile #
  │     ├── Personal Email
  │     └── Facebook Account
  ├── Employment
  └── Tracking
```

### Confirmed

- Alumni Profile contains Student Details, Contact Info, Employment, and Tracking.
- Contact Info contains Mobile #, Personal Email, and Facebook Account.
- The alumni record is attached to a program.

### Not specified

- Who creates or updates the profile.
- Whether sections are edited together or separately.
- Required vs optional fields except that the three contact fields are listed.
- Validation, approval, or completeness rules.
- How Tracking relates to the dashboard "tracked" count.

---

## WF-004 — View Graduate Tracking Statistics

```text
Alumni attached to Program
  ↓
Program attached to Department
  ↓
Dashboard
  ↓
# of graduates
  + tracked count
  + % tracked
```

### Confirmed

- The dashboard shows number of graduates.
- The example presents a grouping labeled IT, a graduate count of 14750, a tracked count of 10000, and 5% tracked.

### Not specified

- Who may open the dashboard.
- Whether IT is a department, a program, or another grouping.
- The formula for `% tracked`.
- Filters, date ranges, or export.

> **Requirement Conflict:** `10000 / 14750` is not `5%`. Confirm the intended calculation before implementation.

---

## WF-005 — Upload Evidence via G. Drive

```text
System
  ↓
G. Drive
  ↓
Uploading of evidence
```

### Confirmed

- G. Drive is an integration.
- The stated purpose is uploading of evidence.

### Not specified

- What evidence is.
- Which module triggers the upload.
- Who uploads.
- File types, size limits, and folder structure.
- Whether uploaded evidence changes Tracking or Employment state.

---

## WF-006 — Modular Integration Use

```text
System
  └── Modular integrations
        ├── reCAPTCHA
        ├── G. Auth
        ├── G. Drive (uploading of evidence)
        ├── Email
        ├── Image BB / G. Drive
        ├── G. Forms
        └── G. Sheets
```

### Confirmed

- Seven integrations are listed.
- The group is labeled Modular.

### Not specified

- Where each integration is invoked in the user flow.
- Whether Image BB and G. Drive are alternatives or used together.
- Email triggers.
- G. Forms and G. Sheets data direction (import, export, or both).

---

## Workflows Not Present in the Guide

The following common workflows are **not** described and are not documented as requirements:

- User registration
- Account verification
- Login / logout
- Forgot / reset password
- Approval / rejection
- Reporting beyond the dashboard statistic
- Notification dispatch
