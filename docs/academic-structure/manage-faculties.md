# Manage Faculties

**Functionality ID:** ACAD-003  
**Source:** System Guide – MODULES – Faculties; "Faculties can be added to department"

## 1. Overview

Faculties is a listed system module. The guide states that faculties can be added to a department.

## 2. Purpose

Provide faculty records that can be added to a department.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | No named role is given authority over Faculties. |

> **Requirement Status:** Not specified in the provided system guide.

The guide does not state whether a Faculty is also a User or an RBAC role.

## 4. Preconditions

> **Requirement Status:** Not specified in the provided system guide.

## 5. Functional Requirements

- The system must include a Faculties module. (`FR-ACAD-003`)
- The system must allow faculties to be added to a department. (`FR-ACAD-004`)

The guide does not enumerate create, view, edit, or delete operations for a faculty.

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed rule only: faculties can be added to a department. The add flow is documented in [Assign Faculty to Department](./assign-faculty-to-department.md).

## 7. Inputs

> **Requirement Status:** Not specified in the provided system guide.

No faculty attributes are listed.

## 8. Business Rules

- Faculties can be added to a department.

Whether a faculty can be added to more than one department is not specified.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| View | Not specified |
| Create | Not specified |
| Edit | Not specified |
| Delete | Not specified |
| Add to department | Not specified who may perform it |

## 11. System Behavior

> **Requirement Status:** Not specified in the provided system guide.

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

| Entity | Specified Fields | Relationships |
|--------|------------------|---------------|
| Faculty | Not specified | Can be added to Department |

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

## 16. UI Requirements

The guide lists Faculties as a module. Screens are not described.

> **Requirement Status:** Not specified in the provided system guide.

## 17. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Invalid input | Not specified |
| Unauthorized user | Not specified |
| Record not found | Not specified |
| Server error | Not specified |

## 18. Audit / Logging Requirements

> **Requirement Status:** Not specified in the provided system guide.

## 19. Security Requirements

Access is subject to RBAC. Specific faculty permissions are not specified.

## 20. Edge Cases

- Faculty with no department — not specified.
- Faculty also being a User — not specified.

## 21. Acceptance Criteria

Given the implemented system  
When modules are inspected  
Then a Faculties module must exist

Given a faculty  
When the stated rule is applied  
Then the faculty can be added to a department

## 22. Test Scenarios

### Positive Tests

- Faculties module exists.
- A faculty can be added to a department.

### Negative Tests

- Operations not listed in the guide must not be treated as confirmed requirements.

### Edge Cases

- Multiple-department membership is unspecified.

## 23. Dependencies

- [Manage Departments](./manage-departments.md)
- [Assign Faculty to Department](./assign-faculty-to-department.md)

## 24. Related Functionalities

- [RBAC Overview](../rbac/rbac-overview.md)

## 25. Assumptions

> **Assumption:** Faculty records can be maintained. CRUD details were not enumerated.

> **Assumption:** Faculty is an academic-structure entity, not automatically an RBAC role. The guide lists both Faculties and Roles separately.

## 26. Open Questions

- What fields does a Faculty have?
- Which operations are supported?
- Who may manage faculties?
- Is a faculty a user?
- Can a faculty belong to more than one department?
