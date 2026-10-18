# Assign Faculty to Department

**Functionality ID:** ACAD-004  
**Source:** System Guide – MODULES – "Faculties can be added to department"

## 1. Overview

This functionality is the explicit rule that faculties can be added to a department.

## 2. Purpose

Associate a faculty record with a department.

## 3. Actors / User Roles

| Role | Access | Description |
|------|--------|-------------|
| Unspecified | Not specified | The guide does not say who adds a faculty to a department. |

> **Requirement Status:** Not specified in the provided system guide.

## 4. Preconditions

> **Assumption:** A faculty record and a department record exist before the add occurs. The guide does not state creation order.

## 5. Functional Requirements

- The system must allow faculties to be added to a department. (`FR-ACAD-004`)

## 6. User Flow

> **Requirement Status:** Not specified in the provided system guide.

Confirmed outcome only:

1. A faculty is added to a department.

UI steps, confirmation, and undo/remove are not described.

## 7. Inputs

| Field | Type | Required | Validation | Description |
|------|------|----------|------------|-------------|
| Faculty | Not specified | Not specified | Not specified | The faculty being added |
| Department | Not specified | Not specified | Not specified | The department receiving the faculty |

Identifiers and selection method are not specified.

## 8. Business Rules

- Faculties can be added to a department.

The guide does not say whether the same faculty can be added to multiple departments, or whether a faculty can be removed.

## 9. Validation Rules

> **Requirement Status:** Not specified in the provided system guide.

## 10. Permissions and Authorization

| Action | Specified? |
|--------|------------|
| Add faculty to department | Not specified who may perform it |
| Remove faculty from department | Not specified |
| View assignments | Not specified |

## 11. System Behavior

| Condition | Specified Behavior |
|-----------|--------------------|
| Successful add | Not specified |
| Duplicate add | Not specified |
| Missing faculty or department | Not specified |
| Unauthorized access | Not specified |

## 12. Status / State Changes

> **Requirement Status:** Not specified in the provided system guide.

## 13. Notifications

> **Requirement Status:** Not specified in the provided system guide.

## 14. Database / Data Requirements

Relationship specified: Faculty can be added to Department.

Cardinality, join entity, and effective dates are not specified.

## 15. API / Integration Requirements

API specification not defined in the provided system guide.

## 16. UI Requirements

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

Access is subject to RBAC. Specific assignment permissions are not specified.

## 20. Edge Cases

- Adding the same faculty twice to one department — not specified.
- Adding one faculty to many departments — not specified.
- Removing a faculty — not specified.

## 21. Acceptance Criteria

Given a faculty and a department  
When the stated rule is implemented  
Then the system must allow the faculty to be added to the department

Given no further rules in the guide  
When testers design cases for removal or many-to-many  
Then those cases remain open questions, not confirmed requirements

## 22. Test Scenarios

### Positive Tests

- A faculty can be added to a department.

### Negative Tests

- Unauthorized behavior is unspecified and must not be assumed.

### Edge Cases

- Duplicate assignment, multi-department assignment, and removal are unspecified.

## 23. Dependencies

- [Manage Faculties](./manage-faculties.md)
- [Manage Departments](./manage-departments.md)

## 24. Related Functionalities

- [Attach Alumni to Program](./attach-alumni-to-program.md)

## 25. Assumptions

> **Assumption:** "Added to" means an association is stored between Faculty and Department.

## 26. Open Questions

- Who may add a faculty to a department?
- Can one faculty belong to multiple departments?
- Can the assignment be removed or changed?
- Is there a primary department?
