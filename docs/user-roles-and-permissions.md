# User Roles and Permissions

## 1. Overview

The system guide defines **Roles**, **Users**, and **Permissions** as modules grouped under **RBAC (Rule Based Access Control)**.

The guide does **not** name any concrete roles and does **not** assign any functionality-level permissions.

## 2. Confirmed from the System Guide

| Item | Status in Guide |
|------|-----------------|
| Roles module exists | Confirmed |
| Users module exists | Confirmed |
| Permissions module exists | Confirmed |
| The three modules form RBAC | Confirmed |
| Named roles (for example Admin, Staff, Faculty, Alumni) | Not specified |
| Role-to-permission assignments | Not specified |
| Whether a user may have multiple roles | Not specified |
| Whether permissions are assigned only through roles | Not specified |
| Default / seed roles | Not specified |

## 3. Permission Matrix

Only roles supported by the system guide may appear as columns. Because no named roles were provided, the matrix uses a single unspecified authorized-access column.

| Functionality | Unspecified RBAC Role |
|---------------|-----------------------|
| RBAC Overview | Not specified |
| Manage Roles | Not specified |
| Manage Users | Not specified |
| Manage Permissions | Not specified |
| Manage Departments | Not specified |
| Manage Programs | Not specified |
| Manage Faculties | Not specified |
| Assign Faculty to Department | Not specified |
| Attach Alumni to Program | Not specified |
| Alumni Profile | Not specified |
| Student Details | Not specified |
| Contact Info | Not specified |
| Employment | Not specified |
| Tracking | Not specified |
| Graduate Tracking Statistics | Not specified |
| reCAPTCHA | Not specified |
| G. Auth | Not specified |
| G. Drive (uploading of evidence) | Not specified |
| Email | Not specified |
| Image BB / G. Drive | Not specified |
| G. Forms | Not specified |
| G. Sheets | Not specified |

> **Requirement Status:** Not specified in the provided system guide.

No checkmarks are shown because the guide does not grant or deny any named role access to any functionality.

## 4. Access Actions

The guide does not define who can View, Create, Edit, Delete, Approve, Reject, Export, or Manage any module.

> **Requirement Status:** Not specified in the provided system guide.

## 5. Related Functionalities

- [RBAC Overview](./rbac/rbac-overview.md)
- [Manage Roles](./rbac/manage-roles.md)
- [Manage Users](./rbac/manage-users.md)
- [Manage Permissions](./rbac/manage-permissions.md)

## 6. Open Questions

- Which named roles exist?
- Which role may manage Roles, Users, and Permissions?
- Which role may maintain Departments, Programs, Faculties, and Alumni Profiles?
- Which role may view the dashboard?
- Can a user have more than one role?
- Are permissions granted only through roles?
